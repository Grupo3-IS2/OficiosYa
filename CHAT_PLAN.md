# Plan: chat entre cliente y profesional

Plan de implementación del chat 1 a 1 entre un usuario (cliente) y un profesional. Está escrito
desde el lado **backend y deploy**; la sección [Contrato para el frontend](#7-contrato-para-el-frontend)
es lo que hay que pasarle a quien haga la UI.

---

## 1. Objetivo y alcance

- El chat se habilita **a partir de un `JobRequest`**: el cliente y el profesional de un trabajo
  pueden abrir la conversación desde el detalle del trabajo, cualquiera de los dos primero.
- Sólo se puede escribir mientras el par tenga un trabajo activo, o hasta unos días después de
  completado; si no, la conversación queda de sólo lectura.
- Ambos ven la lista de sus conversaciones (última actividad primero), con el último mensaje y la
  cantidad de no leídos.
- Mensajes de texto plano, en tiempo real cuando el otro está conectado, y persistidos para cuando no.
- Historial paginado y marca de "leído".
- Adjuntos o imágenes, editar o borrar mensajes, "escribiendo…", indicador de en línea.
- Avisos por mail de mensajes no leídos.
- Bloquear o reportar usuarios y moderación por parte del admin.

---

## 2. Decisiones de diseño

| Tema | Decisión | Por qué |
|---|---|---|
| Quién puede hablar con quién | **El `JobRequest` es el handshake**: sólo las dos partes de un trabajo | Evita el spam y los contactos sueltos, reusa el control de partes que ya hace `JobRequestServiceImpl` y deja que el profesional también escriba primero. El costo es que no se puede consultar *antes* de pedir un trabajo (ver §9). |
| Unidad de conversación | **Una conversación por par de usuarios**, no una por `JobRequest` | Entre los mismos dos usuarios hay un solo hilo aunque tengan varios trabajos; un trabajo nuevo reusa la conversación que ya existe. |
| Cuándo se crea | **Lazy**: la primera vez que alguna de las partes la abre desde el trabajo | `JobRequestServiceImpl.create` no cambia (chat y trabajos quedan desacoplados) y los trabajos que ya están en la base no necesitan migración. |
| Cuándo se puede escribir | Con algún trabajo del par en `PROPOSED`, `ACCEPTED` o `RESCHEDULE_REQUESTED`, o `COMPLETED` hace menos de `CHAT_WINDOW_AFTER_COMPLETED_DAYS` (7) | Mientras hay algo que coordinar. Fuera de eso, sólo lectura: el historial sigue visible. |
| Envío de mensajes | **REST** (`POST`) | Reusa lo que ya está: `@Valid`, `GlobalExceptionHandler`, `JwtAuthenticationFilter`, rate limiter y tests con MockMvc. Los errores vuelven como JSON estándar y no se pierden en el socket. |
| Recepción en vivo | **STOMP sobre WebSocket**, sólo para *push* | Ya tenemos `spring-boot-starter-websocket`, `JwtChannelInterceptor`, el proxy `/ws` en Vite y el `location /ws/` en nginx. |
| Broker | **Simple broker en memoria** de Spring | Corremos una sola instancia del backend por entorno. Si algún día hay más de una, se cambia por un relay (RabbitMQ) sin tocar la API. |
| Persistencia | Postgres, con dos tablas nuevas | Igual que el resto. Para este volumen sobra, y "¿se puede escribir?" es una consulta sobre `job_request`: tener todo en la misma base da transacciones y joins sin sincronizar otro sistema. |
| Dónde viven las tablas | **Schema `chat`** dentro de la misma base (no otra base) | Orden: el chat queda separado de `public` y se puede respaldar, inspeccionar o borrar aparte. Las FK a `public.users` y `public.job_request` y la transacción compartida siguen funcionando, cosa que con otra base se perdería. No suma seguridad (ver §4). |
| Cifrado | **TLS en tránsito + contenido cifrado en reposo** (AES-GCM), **sin** cifrado de extremo a extremo | Ver §5.5: E2E rompe la validación, la vista previa de la bandeja y el acceso del admin ante un reclamo. |
| Identificadores | `Long id`, como `JobRequest` | Mismo criterio que el resto de la API. El acceso se controla verificando que el que llama participa de la conversación. |

**Flujo de un mensaje:**

**Cómo se abre una conversación:**

```
Detalle del trabajo ── POST /api/v1/job-requests/{jobId}/conversation ──▶ ChatService
                                                     │ ¿el que llama es parte del trabajo? si no, 403
                                                     │ busca la conversación del par (en cualquier orden)
                                                     │ si no existe, la crea
                                                     ▼
                                       200/201 ConversationResponse ──▶ navegar a /messages/{id}
```

**Flujo de un mensaje:**

```
Front A ── POST /api/v1/conversations/{id}/messages ──▶ ChatService
                                                          │ ¿hay un trabajo activo del par? si no, 409
                                                          │ guarda en DB (transacción)
                                                          │ publica ChatMessageSent (evento)
                                                          ▼
                                     @TransactionalEventListener(AFTER_COMMIT)
                                                          │
        convertAndSendToUser(publicIdDeB, "/queue/messages", dto)  (y también a A, para sus otras pestañas)
                                                          ▼
Front B (suscrito a /user/queue/messages) ◀──────────── STOMP
```

El push se hace **después del commit** para no avisar nunca de un mensaje que terminó en rollback.

---

## 3. Lo que ya existe

- `pom.xml`: `spring-boot-starter-websocket`.
- `config/JwtChannelInterceptor`: valida el JWT en el `CONNECT` de STOMP. Falta registrarlo y
  endurecerlo (ver §5).
- El principal de Spring Security es el `publicId` del usuario (`SecurityConfig.userDetailsService`),
  así que `convertAndSendToUser(publicId.toString(), …)` funciona directo.
- `nginx/oficiosya-site.conf`: `location /ws/` con `Upgrade` y `proxy_read_timeout 3600s`, incluido por
  `oficios-ya.conf` (release) y `oficios-ya-dev.conf` (dev).
- `frontend/vite.config.ts`: proxy de `/ws` con `ws: true`.
- `TokenRevocationService` (logout y revocación de sesiones) y `RequestRateLimiter`.
- `JobRequestServiceImpl.isParticipant(jobRequest, userId)` y `JobRequestRepository.findByParticipant`:
  el mismo criterio de "es parte del trabajo" que va a usar el chat.

**Lo que falta:** `WebSocketConfig` (no hay ningún `@EnableWebSocketMessageBroker`), permitir el
handshake `/ws/**` en `SecurityConfig` y todo el dominio del chat.

---

## 4. Modelo de datos

Hibernate crea las tablas solo (`ddl-auto=update`); igual conviene declarar los índices y las
restricciones en las entidades.

### Schema `chat`

Las dos tablas del chat van en un schema propio, `chat`, de la misma base. `JobRequest.completedAt`
se queda en `public.job_request`, porque es un dato del trabajo y no del chat.

- En las entidades: `@Table(name = "conversation", schema = "chat")` y
  `@Table(name = "chat_message", schema = "chat")`, con los índices y `uniqueConstraints` ahí mismo.
  Las consultas JPQL no cambian; el código no tiene consultas nativas que haya que adaptar.
- En `application.properties`:
  ```properties
  # Lets ddl-auto create the "chat" schema the chat tables live in (see Conversation, ChatMessage).
  spring.jpa.properties.hibernate.hbm2ddl.create_namespaces=true
  ```
  Sin esto, `update` intenta crear `chat.conversation` en un schema que no existe y la app no arranca.
  Un script SQL de inicialización no sirve: Postgres sólo los corre con el volumen `pgdata` vacío, y en
  dev y release ya tiene datos.
- Las FK cruzan schemas sin problema (`chat.conversation.client_id → public.users.id`,
  `chat.chat_message.job_request_id → public.job_request.id`).
- **No es una medida de seguridad:** la app se conecta con un único usuario, dueño de los dos schemas.
  Aislar de verdad pediría otro rol de Postgres y un segundo datasource, que no vale la pena acá. El
  contenido se protege con el cifrado en reposo (§5.5).

### `Conversation` (tabla `chat.conversation`)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `Long` | PK |
| `client` | `@ManyToOne Client` | El cliente del primer trabajo que abrió el chat; `client_id` not null |
| `professional` | `@ManyToOne Professional` | El profesional de ese trabajo; `professional_id` not null |
| `createdAt` | `OffsetDateTime` | `@CreationTimestamp` |
| `lastMessageAt` | `OffsetDateTime` | Para ordenar la bandeja sin `JOIN` + `MAX` |
| `lastMessagePreview` | `TEXT`, cifrado | Desnormalizado para la bandeja (primeros 120 caracteres). Se guarda cifrado con el mismo converter que `content` (§5.5). |
| `clientLastReadMessageId` | `Long` | Hasta qué mensaje leyó cada lado (null = nada) |
| `professionalLastReadMessageId` | `Long` | |
| `version` | `Long` `@Version` | Como `JobRequest`: dos mensajes simultáneos no pisan `lastMessageAt` |

- `UNIQUE (client_id, professional_id)`: un solo hilo por par.
- Índices: `(client_id, last_message_at desc)` y `(professional_id, last_message_at desc)`.
- **El par se busca en los dos sentidos.** Desde el refactor de `Client`, un profesional puede contratar
  a otro: si A le pidió un trabajo a B y después B a A, los dos trabajos tienen que caer en la misma
  conversación. `ConversationRepository.findBetween(a, b)` busca `(client=a, professional=b)` o
  `(client=b, professional=a)`, y sólo si no hay ninguna se crea con los roles del trabajo actual.
- Dos aperturas simultáneas del mismo par: el `UNIQUE` hace fallar a la segunda; se captura
  `DataIntegrityViolationException` y se vuelve a buscar.

### Cambio en `JobRequest`

| Campo | Tipo | Notas |
|---|---|---|
| `completedAt` | `OffsetDateTime` (nullable) | Se setea en `completeJobRequest`. No sirve `updatedAt`, porque calificar el trabajo también lo cambia y alargaría la ventana. Los trabajos que ya están `COMPLETED` quedan con `null` y se tratan como fuera de la ventana. |

Y en `JobRequestRepository`:

```java
/** Whether the two users have a job, either way round, that still allows chatting. */
@Query("""
        SELECT COUNT(j) > 0 FROM JobRequest j
        WHERE ((j.client.publicId = :a AND j.professional.publicId = :b)
            OR (j.client.publicId = :b AND j.professional.publicId = :a))
        AND (j.status IN :openStatuses
             OR (j.status = :completed AND j.completedAt > :completedSince))
        """)
boolean existsChatEnablingJob(@Param("a") UUID a, @Param("b") UUID b,
                              @Param("openStatuses") Collection<JobStatus> openStatuses,
                              @Param("completed") JobStatus completed,
                              @Param("completedSince") OffsetDateTime completedSince);
```

### `ChatMessage` (tabla `chat.chat_message`)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `Long` | PK. También sirve de cursor para paginar. |
| `conversation` | `@ManyToOne(LAZY) Conversation` | not null |
| `sender` | `@ManyToOne(LAZY) Client` | not null |
| `content` | `TEXT`, cifrado | Hasta 2000 caracteres en claro (se valida en el DTO, antes de cifrar). En la base queda el texto cifrado, más largo, por eso `TEXT` (§5.5). |
| `jobRequest` | `@ManyToOne(LAZY) JobRequest` (nullable) | Opcional: a qué trabajo se refiere el mensaje, para que el front lo muestre. Si viene, tiene que ser un trabajo del par. |
| `clientMessageId` | `UUID` | Lo genera el front; hace que un reintento no duplique el mensaje |
| `createdAt` | `OffsetDateTime` | `@CreationTimestamp` |

- Índice `(conversation_id, id desc)` para la paginación.
- `UNIQUE (conversation_id, sender_id, client_message_id)`: si el front reintenta el `POST` con el
  mismo `clientMessageId`, se devuelve el mensaje ya guardado (`200`) en vez de crear otro.

**"No leídos"** = mensajes de la conversación con `id > miLastReadMessageId` y `sender != yo`.

---

## 5. Backend: qué hay que hacer

### 5.1 Paquetes y clases nuevas (mismo estilo que `JobRequest`)

```
entity/Conversation.java, entity/ChatMessage.java
repository/ConversationRepository.java, repository/ChatMessageRepository.java
dto/request/ChatMessageCreateRequest.java     { String content, UUID clientMessageId, Long jobRequestId? }
dto/response/ConversationResponse.java
dto/response/ChatMessageResponse.java
mapper/ChatMapper.java                        (MapStruct)
service/interfaces/ChatService.java, service/ChatServiceImpl.java
service/ChatMessageSent.java                  (evento) + ChatPushListener.java
controller/ConversationController.java
config/WebSocketConfig.java
config/ChatContentConverter.java              (cifrado en reposo, §5.5)
exception/ConversationNotFoundException.java  (+ handler en GlobalExceptionHandler)
exception/ConversationClosedException.java    (409, sin trabajo activo)
```

Y cambios chicos en lo existente: `JobRequest.completedAt`, que `completeJobRequest` lo setee,
`JobRequestRepository.existsChatEnablingJob` y el endpoint nuevo en `JobRequestController`.

### 5.2 API REST (todo autenticado)

| Método y ruta | Qué hace | Respuestas |
|---|---|---|
| `POST /api/v1/job-requests/{jobId}/conversation` | **El handshake.** Devuelve la conversación del par de ese trabajo, creándola si no existe (idempotente). Lo puede llamar el cliente o el profesional del trabajo, en cualquier estado del trabajo (si está cerrado, la conversación se abre igual, pero en sólo lectura). | `201` si es nueva, `200` si ya existía, `403` si no es parte del trabajo, `404` si el trabajo no existe |
| `GET /api/v1/conversations` | Bandeja del que llama (como cliente y como profesional), por `lastMessageAt desc` | `200 ConversationResponse[]` |
| `GET /api/v1/conversations/unread-count` | Total de no leídos, para el badge del header | `200 { count }` |
| `GET /api/v1/conversations/{id}/messages?before={msgId}&limit=30` | Página de mensajes, del más nuevo al más viejo; `limit` máximo 100 | `200 ChatMessageResponse[]`, `403` si no participa, `404` |
| `POST /api/v1/conversations/{id}/messages` `{ content, clientMessageId, jobRequestId? }` | Guarda, actualiza la bandeja y hace el push | `201 ChatMessageResponse`, `200` si es un reintento, `400` si es inválido, `403`, `409` si el par no tiene un trabajo activo, `429` |
| `POST /api/v1/conversations/{id}/read` `{ lastReadMessageId }` | Marca leído hasta ese mensaje (nunca hacia atrás) y avisa por push al otro lado | `204` |

`ConversationResponse`:
```json
{
  "id": 12,
  "otherParticipant": { "id": "uuid", "name": "Ana Pérez", "profileImageUrl": "/uploads/...", "role": "PROFESSIONAL" },
  "myRole": "CLIENT",
  "lastMessagePreview": "¿Podés el jueves?",
  "lastMessageAt": "2026-10-12T21:30:00-03:00",
  "unreadCount": 2,
  "canWrite": true
}
```

`canWrite` dice si hoy hay un trabajo que habilita el chat; con `false` el front muestra el historial
y deshabilita el campo de texto. Se calcula con `existsChatEnablingJob`. En la bandeja son N consultas
chicas; si pesa, se resuelve con una sola consulta agrupada por par.

`ChatMessageResponse`:
```json
{ "id": 345, "conversationId": 12, "senderId": "uuid", "content": "Hola", "clientMessageId": "uuid", "jobRequestId": 87, "createdAt": "..." }
```

**Reglas en `ChatServiceImpl`:**

- El que llama se toma de `AuthenticatedUser.id(authentication)`, igual que en los endpoints `/me`.
- Participa = es `conversation.client` o `conversation.professional`. Si no participa, se lanza
  `AccessDeniedException`, como hace `JobRequestServiceImpl`.
- **Abrir:** sólo si el que llama es parte del `JobRequest` (mismo criterio que `isParticipant`).
  Que el profesional esté `published` no importa: el trabajo ya los vinculó.
- **Escribir:** además de participar, `existsChatEnablingJob(yo, elOtro, [PROPOSED, ACCEPTED,
  RESCHEDULE_REQUESTED], COMPLETED, ahora - ventana)` tiene que dar `true`; si no, se lanza
  `ConversationClosedException` (409). Leer y marcar como leído siempre se puede.
- Un trabajo `REJECTED` o `CANCELLED` no habilita a escribir: si era el único del par, la
  conversación queda en sólo lectura. Un trabajo nuevo la vuelve a habilitar.
- Si el mensaje trae `jobRequestId`, ese trabajo tiene que ser del par; si no, `400`.
- `content`: `trim()`, de 1 a 2000 caracteres y texto plano. El backend no interpreta HTML, y el front
  tiene que mostrarlo como texto, nunca con `dangerouslySetInnerHTML`.
- Rate limit por usuario para enviar mensajes (por ejemplo 30 por minuto), reusando la idea de
  `RequestRateLimiter` pero con el `publicId` como clave en vez de la IP.
- `lastMessagePreview` = los primeros 120 caracteres del contenido.

### 5.3 WebSocket

**`WebSocketConfig`** (`@EnableWebSocketMessageBroker`):

- Endpoint STOMP: **`/ws/chat`** (WebSocket nativo, sin SockJS). Tiene que estar *debajo* de `/ws/`:
  nginx usa `location /ws/`, y a un pedido a `/ws` (sin barra) le responde con un `301` que el cliente
  WebSocket no sigue. Además, `setAllowedOriginPatterns` con los mismos
  orígenes que el CORS de `SecurityConfig` (conviene sacarlos a un único lugar).
- `enableSimpleBroker("/queue")` con heartbeat `10000,10000`. Necesita un `TaskScheduler` para
  los heartbeats. Los heartbeats evitan que nginx corte por `proxy_read_timeout`.
- `setApplicationDestinationPrefixes("/app")`: no se usa en el MVP porque el envío es por REST.
- `setUserDestinationPrefix("/user")`.
- `configureClientInboundChannel` registra `JwtChannelInterceptor`.

**`SecurityConfig`:** agregar `.requestMatchers("/ws/**").permitAll()`. El handshake HTTP no puede
mandar `Authorization` desde el navegador; la autenticación real ocurre en el `CONNECT` de STOMP.

**Cambios en `JwtChannelInterceptor` (importante):**

1. Hoy, si el `CONNECT` no trae token o el token es inválido o está revocado, **lo deja pasar** (anónimo).
   Hay que **rechazarlo** lanzando `MessagingException` / `AccessDeniedException`.
2. Autorizar los `SUBSCRIBE`: permitir sólo `/user/queue/**` y rechazar cualquier otro destino.
   Así nadie puede escuchar colas ajenas.
3. Guardar el `exp` del token en los atributos de la sesión y, en cada frame entrante, rechazar si ya
   venció. Un socket abierto no debe sobrevivir a la expiración del JWT.
4. Revocación: en el logout y en `revokeSessions(publicId)` (cambio de contraseña), cerrar las
   sesiones STOMP de ese usuario. Para eso, guardar `sessionId → publicId` al conectar (escuchando
   `SessionConnectedEvent` y `SessionDisconnectEvent`).

**Destinos que recibe el front:**

| Destino | Payload | Cuándo |
|---|---|---|
| `/user/queue/messages` | `ChatMessageResponse` | Mensaje nuevo en cualquiera de mis conversaciones (también los míos, para sincronizar pestañas) |
| `/user/queue/read` | `{ conversationId, readerId, lastReadMessageId }` | El otro leyó |

**Reconexión:** el push no garantiza la entrega. Al reconectar, el front vuelve a pedir
`GET /conversations` y los mensajes de la conversación abierta. La base de datos es la fuente de verdad.

### 5.4 Tests (backend)

Siguiendo el estilo actual (Mockito para servicios, MockMvc para controllers):

- `ChatServiceImplTest`:
  - abrir desde un trabajo es idempotente, y dos trabajos del mismo par devuelven la misma conversación;
  - el par se encuentra en los dos sentidos (A le pide a B y B le pide a A: una sola conversación);
  - quien no es parte del trabajo recibe 403 al abrir, y quien no participa de la conversación, 403 al leer o escribir;
  - se puede escribir con un trabajo `PROPOSED`, `ACCEPTED` o `RESCHEDULE_REQUESTED`;
  - con sólo trabajos `REJECTED` o `CANCELLED`, escribir da 409, pero leer funciona;
  - un `COMPLETED` dentro de la ventana habilita, fuera de la ventana o con `completedAt` null no;
  - un `jobRequestId` de otro par da 400;
  - el contenido se valida (vacío, sólo espacios, más de 2000);
  - reintentar con el mismo `clientMessageId` no duplica;
  - el "leído" nunca retrocede;
  - el conteo de no leídos ignora los mensajes propios;
  - la bandeja queda ordenada por `lastMessageAt`.
- `ConversationControllerTest` y el endpoint nuevo en `JobRequestControllerTest`: 401 sin token,
  códigos de estado (incluido el 409) y forma del JSON de error.
- `JobRequestServiceImplTest`: `completeJobRequest` setea `completedAt`.
- `JwtChannelInterceptorTest`:
  - se rechaza un `CONNECT` sin token, con token inválido, revocado o vencido;
  - se rechaza un `SUBSCRIBE` a un destino que no es `/user/queue/**`.
- `ChatPushListenerTest`: después del commit llama a `convertAndSendToUser` para los dos
  participantes, con su `publicId`.
- Integración (opcional): `@SpringBootTest(webEnvironment = RANDOM_PORT)` con `WebSocketStompClient`.
  Ojo: el workflow de Sonar excluye los tests que levantan el contexto completo (`-Dtest='!OficiosYaTests'`).
  Si se agrega uno así, hay que excluirlo también o darle una base de datos al job.

### 5.5 Privacidad y cifrado

**Qué protege cada capa:**

| Tramo | Cómo viaja o se guarda | Quién podría leerlo |
|---|---|---|
| Navegador ↔ nginx | HTTPS / WSS (Let's Encrypt) | Nadie en la red |
| nginx ↔ app, app ↔ Postgres | En claro, pero dentro del mismo host (loopback y la red de Docker) | Sólo quien ya tiene acceso al servidor |
| En la base y en los backups | **Cifrado** con AES-GCM (este apartado) | Nadie sin la clave, aunque tenga el dump |
| En memoria del backend | En claro | El backend (lo necesita para validar, armar la vista previa y el acceso del admin) |

**Por qué no cifrado de extremo a extremo (E2E):** con E2E el servidor sólo guarda datos que no puede
leer. Eso choca con lo que el plan necesita:

- no se puede validar ni filtrar el contenido (largo, teléfonos mientras el trabajo está `PROPOSED`);
- no hay `lastMessagePreview` para la bandeja;
- un admin no puede leer una conversación ante un reclamo, algo que un marketplace suele necesitar;
- las claves viven en el navegador: si el usuario borra sus datos o cambia de dispositivo, pierde el
  historial, salvo que se haga una gestión de claves multi-dispositivo (lo más difícil de algo como
  Signal), que excede el alcance del proyecto.

El cifrado en reposo cubre el riesgo más probable (un dump o un backup que se filtra) sin perder nada
de eso. No protege contra alguien que controle el servidor en ejecución, porque ahí también está la clave.

**Implementación: `config/ChatContentConverter`:**

```java
@Converter
public class ChatContentConverter implements AttributeConverter<String, String> {
    // "v1:" + Base64(IV de 12 bytes || texto cifrado || tag de 16 bytes)
    // AES/GCM/NoPadding, IV aleatorio (SecureRandom) en cada mensaje: nunca reusar un IV con la misma clave.
    // convertToDatabaseColumn: cifra.  convertToEntityAttribute: lee el prefijo de versión y descifra.
}
```

- Se aplica con `@Convert(converter = ChatContentConverter.class)` sobre `ChatMessage.content` y
  `Conversation.lastMessagePreview`. El resto del código (servicio, DTOs, mapper) ve texto en claro.
- La clave sale de `CHAT_ENCRYPTION_KEY` (32 bytes en Base64, AES-256). Se genera una vez con
  `openssl rand -base64 32`.
- **Sin clave, la app no arranca** (falla en el arranque con un mensaje claro). Generar una clave
  temporal, como se hace con el par de claves del JWT, sería peor: los mensajes guardados quedarían
  ilegibles después de reiniciar.
- **El prefijo `v1:`** permite rotar la clave más adelante: se agrega `v2` con una clave nueva para
  escribir, y `v1` se sigue usando sólo para leer los mensajes viejos. No hace falta para el MVP, pero el
  formato ya queda preparado.
- Un dato que no se puede descifrar (clave equivocada, dato alterado: GCM lo detecta con el tag) lanza
  una excepción y se loguea el id del mensaje, **nunca el contenido**.
- **Costo:** no se puede buscar por el texto de los mensajes en SQL (`LIKE`). El plan no lo necesita.

**Otras reglas:**

- No loguear el contenido de los mensajes en ningún nivel. Ojo con `spring.jpa.show-sql` y los
  parámetros de Hibernate: muestran el valor ya cifrado, pero igual conviene no activarlos en producción.
- El push por STOMP lleva el texto en claro: viaja por WSS hasta el navegador, igual que la respuesta REST.

**Tests (`ChatContentConverterTest`):**

- cifrar y descifrar devuelve el mismo texto, incluidos acentos, emojis y 2000 caracteres;
- el mismo texto cifrado dos veces da resultados distintos (IV aleatorio);
- un dato alterado o descifrado con otra clave falla, en vez de devolver basura;
- `null` se queda en `null`;
- sin `CHAT_ENCRYPTION_KEY`, o con una clave que no mide 32 bytes, el converter no se puede crear.

---

## 6. Deploy

Lo bueno: casi toda la infraestructura ya está.

- [ ] **nginx:** `location /ws/` ya existe en `nginx/oficiosya-site.conf` y `deploy.yml` corre
      `nginx -t && reload` en cada deploy. Verificar en el servidor, después del primer deploy, que
      `wss://dev.oficiosya.duckdns.org/ws/chat` hace el upgrade:
      `curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: x3JJHMbDL1EzLkh9GBhXDw==" https://dev.oficiosya.duckdns.org/ws/chat`
      debe devolver `101`.
- [ ] **Timeouts:** el heartbeat STOMP (10 s) queda muy por debajo del `proxy_read_timeout 3600s`
      de nginx, así que no hace falta tocar nginx.
- [ ] **Base de datos:** `ddl-auto=update` va a crear el schema `chat` (gracias a
      `hibernate.hbm2ddl.create_namespaces`, §4) y dentro `conversation` y `chat_message` en el primer
      arranque. Después del primer deploy a dev, verificar con
      `docker compose exec db psql -U "$DB_USERNAME" -d "$DB_NAME" -c '\dt chat.*'`.
      El `pg_dump` completo ya incluye el schema `chat`; para respaldar o inspeccionar sólo el chat:
      `pg_dump -n chat` (sale cifrado, ver §5.5).
      **Antes de desplegar en release, hacer un backup** del volumen `pgdata`
      (`docker compose exec db pg_dump …`). `update` crea las restricciones `UNIQUE` sólo si la tabla
      es nueva, así que conviene que las entidades salgan bien desde el primer deploy a dev.
      En `job_request`, `update` agrega la columna `completed_at` nullable; las filas existentes quedan
      en `null`, que es lo esperado (ver §4).
- [ ] **Variables nuevas** (en `application.properties`, `docker-compose.yml` y `.env.example`, con
      default):
  - `CHAT_MESSAGE_MAX_LENGTH=2000`
  - `RATE_LIMIT_CHAT_PER_MINUTE=30`
  - `CHAT_WINDOW_AFTER_COMPLETED_DAYS=7`
- [ ] **Clave de cifrado del chat (`CHAT_ENCRYPTION_KEY`, §5.5):**
  - Generar una clave **distinta** para dev y para release (`openssl rand -base64 32`) y ponerla en el
    `.env` de cada clon en el servidor. No va al repo ni a los logs.
  - En `docker-compose.yml`, pasarla al servicio `app` como `${CHAT_ENCRYPTION_KEY:?…}`, para que
    `docker compose` avise si falta (igual que `DB_PASSWORD`).
  - En `.env.example`, una clave **sólo para desarrollo**, marcada como tal (como `DB_PASSWORD=changeme`).
    El workflow de Playwright copia `.env.example` a `.env`, así que con eso CI funciona sin cambios.
  - **Guardar una copia de la clave fuera del servidor** (por ejemplo en el gestor de contraseñas del
    equipo). Si se pierde, los mensajes guardados no se pueden recuperar. El backup de la base
    sin la clave no sirve, y la clave junto al backup anula el cifrado: guardarlos por separado.
  - En el workflow de Playwright, subir `RATE_LIMIT_CHAT_PER_MINUTE` igual que se hace con
    `RATE_LIMIT_AUTH_PER_MINUTE`.
- [ ] **Una sola instancia:** el simple broker y la tabla de sesiones viven en memoria. Mientras
      `docker compose` levante una sola réplica de `app`, está bien. Dejarlo anotado en el README.
- [ ] **Reinicio en un deploy:** al hacer `up -d --build`, todos los sockets se cortan. El front
      tiene que reconectar con backoff y volver a pedir el estado (ver §5.3).
- [ ] **CI de Playwright:** ya levanta `app` con Docker. El test E2E del chat usa dos `browser.newContext()`
      (cliente y profesional): el cliente crea un trabajo, los dos abren la conversación desde el
      detalle y el mensaje llega sin recargar.
- [ ] **Logs:** loguear los `CONNECT` rechazados (sin el token) y los errores del push.
      Nunca loguear el contenido de los mensajes.

---

## 7. Contrato para el frontend

Lo mínimo que necesita quien haga la UI:

1. Conectar con `@stomp/stompjs` a `ws(s)://<host>/ws/chat`, mandando `Authorization: Bearer <token>` en
   los `connectHeaders`. Usar heartbeat de 10 s y reconexión automática.
2. Suscribirse a `/user/queue/messages` y `/user/queue/read`.
3. Para enviar: `POST /api/v1/conversations/{id}/messages` con un `clientMessageId` (`crypto.randomUUID()`).
   Mostrar el mensaje como "enviando" y reemplazarlo cuando llega la respuesta o el push con el mismo
   `clientMessageId`.
4. En el detalle de un trabajo (y en su tarjeta en "Mis solicitudes"), un botón "Mensajes" para las
   dos partes: `POST /api/v1/job-requests/{jobId}/conversation` y luego navegar a `/messages/{id}`.
   Al enviar desde ahí, mandar `jobRequestId` para que el mensaje quede asociado al trabajo.
   No hay botón de contacto en el perfil público.
5. Si `canWrite` es `false`, o un envío responde `409`, mostrar el historial con el campo deshabilitado
   y un aviso del tipo "El chat se habilita mientras tengan un trabajo en curso".
6. Al abrir una conversación, y cada vez que llega un mensaje con la conversación a la vista:
   `POST /api/v1/conversations/{id}/read`.
7. Al reconectar el socket, volver a pedir la bandeja y la conversación abierta.
8. Al hacer logout, desconectar el cliente STOMP.

---

## 8. Plan por fases

| Fase | Tareas | Entregable | Estimación |
|---|---|---|---|
| **1. Modelo y servicio** | Entidades, repositorios, DTOs, mapper, `JobRequest.completedAt` y `existsChatEnablingJob`, `ChatContentConverter` (cifrado en reposo), `ChatServiceImpl` con todas las reglas, tests unitarios | Servicio probado sin HTTP | 2,5 a 3 días |
| **2. API REST** | `POST /job-requests/{id}/conversation`, `ConversationController`, excepciones (403/409), Swagger, rate limit, tests de controller | Chat funcional "a recargar", usable desde Swagger | 1 día |
| **3. Tiempo real** | `WebSocketConfig`, `/ws` en `SecurityConfig`, endurecer `JwtChannelInterceptor`, evento + push después del commit, cierre de sesiones al revocar, tests | Push en vivo, probado con un cliente STOMP de consola | 2 días |
| **4. Deploy a dev** | Variables, `.env.example`, backup, deploy, verificar el `101` en `/ws/chat`, probar con dos navegadores | Funcionando en `dev.oficiosya.duckdns.org` | 0,5 día |
| **5. Integración con el front** | Acompañar la integración, ajustar el contrato, E2E de Playwright con dos contextos | Feature completa en `dev` | 1 a 2 días (en paralelo con el front) |
| **6. Release** | Backup de la DB de release, merge `dev → main`, smoke test en producción | En producción | 0,5 día |

Las fases 1 y 2 no bloquean al front: con el contrato de §7 se puede empezar la UI mockeando
las respuestas, como ya se hace en los tests de Playwright.

---

## 9. Riesgos y preguntas para el equipo

### Decidir antes de la fase 1

Estas cambian el modelo de datos o las reglas de `ChatServiceImpl`; cambiarlas después implica tocar
tablas que ya tienen datos.

1. **¿Protegemos el PIN de confirmación?** Al crear el trabajo, el cliente recibe un PIN de 6 dígitos
   y el profesional lo ingresa para marcarlo `COMPLETED` (`completeJobRequest`). El chat le abre al
   profesional un canal para pedirlo ("pasame el PIN así te agendo") y cerrar el trabajo sin hacerlo.
   - **Recomendación:** un aviso fijo en el chat ("Nunca compartas tu PIN por el chat"), y que el
     backend rechace (`400`) un mensaje con una secuencia de 6 dígitos que coincida con el PIN de algún
     trabajo activo del par. Se compara con el mismo `passwordEncoder.matches` que usa
     `completeJobRequest`, y sólo cuando el mensaje tiene 6 dígitos seguidos, así que no le cuesta
     nada a los mensajes normales.
2. **¿Los eventos del trabajo aparecen en el chat?** Por ejemplo "Trabajo aceptado", "Reagendamiento
   pedido para el jueves 10:00", "Trabajo cancelado".
   - **Recomendación:** sí. Da contexto sin salir del chat y reusa el push. Implica sumar a
     `chat_message` un campo `type` (`USER` / `SYSTEM`) y que `sender` pueda ser `null`, y que
     `JobRequestServiceImpl` publique un evento en cada cambio de estado.
3. **¿El otro ve el "visto"?** El plan manda la confirmación de lectura al otro lado
   (`/user/queue/read`), y a algunos usuarios les resulta invasivo.
   - **Recomendación:** el backend la guarda igual, porque la necesita para el conteo de no leídos.
     Mostrarla o no al otro es una decisión del front, sin costo para el backend.
4. **¿Cuánto tiempo se guardan los mensajes?** ¿Para siempre, o se borran N meses después del último
   trabajo del par? Y si algún día se agrega el borrado de cuentas (hoy no existe), los mensajes
   tienen que irse con la cuenta o quedar anonimizados.
   - **Recomendación:** decidir el plazo ahora aunque la limpieza venga después. Ya hay un patrón para
     tareas periódicas en `VerificationCodeCleanup`, y con el schema propio (§4) es fácil de acotar.

### No bloquean el backend, pero necesitan dueño

- **Notificaciones si el otro no está conectado.** Sin ellas, un profesional que no tiene el sitio
  abierto no ve el mensaje hasta que vuelve.
  - **Recomendación:** un mail del tipo "Tenés mensajes sin leer", como mucho uno por conversación cada
    algunas horas. El envío de mails ya existe y está configurado (Mailpit en dev). Es lo primero que
    agregaría después del MVP.
- **Términos y privacidad.** Los mensajes son datos personales (Ley 18.331 de Uruguay). Si un admin va
  a leerlos ante un reclamo (ver "Admin"), los términos lo tienen que decir, junto con cuánto tiempo se
  guardan.
- **Admin:** ¿necesita leer conversaciones (por ejemplo ante un reclamo)? Si sí, conviene agregar un
  endpoint de admin separado con auditoría, no abrir los endpoints actuales.
- **Arreglos por fuera de la plataforma.** Con el chat pueden acordar otro precio o pagar por fuera,
  salteando `paymentAmount`. ¿Lo aceptamos o lo avisamos?
- **Abuso.** Hoy, si uno acosa al otro, la única salida es rechazar o cancelar el trabajo para que el chat
  quede en sólo lectura. ¿Alcanza para el MVP, o hace falta un botón de "reportar"?
- **No se puede consultar antes de pedir un trabajo.** Es el costo del handshake por `JobRequest`. Hoy
  crear un trabajo (`POST /api/v1/job-requests`) pide al menos una tarea (oficio y descripción),
  ubicación y monto; el PIN lo genera el servidor. No es mucho, pero para una pregunta del tipo
  "¿trabajás los sábados?" igual obliga a inventar una tarea y un monto. Si molesta, la salida más barata es un trabajo `PROPOSED` liviano, no
  abrir el chat desde el perfil.
- **Datos de contacto:** el perfil público hoy *oculta* el teléfono. Con el chat, las partes pueden
  pasárselo, pero sólo después de que hubo un pedido de trabajo. ¿Está bien así, o filtramos teléfonos
  y mails mientras el trabajo esté `PROPOSED`?
- **Ventana después de completado:** 7 días por defecto (`CHAT_WINDOW_AFTER_COMPLETED_DAYS`). ¿Alcanza
  para garantías o reclamos chicos?
