# Plan: chat entre cliente y profesional

Plan de implementación del chat 1 a 1 entre un usuario (cliente) y un profesional, y del cambio en
`JobRequest` para que la propuesta de trabajo pueda salir de cualquiera de los dos lados. Está escrito
desde el lado **backend y deploy**; la sección [Contrato para el frontend](#7-contrato-para-el-frontend)
es lo que hay que pasarle a quien haga la UI.

---

## 1. Objetivo y alcance

- **El chat no depende de un `JobRequest`.** Un cliente puede escribirle a cualquier profesional
  publicado desde su perfil público, para consultar antes de pedir nada ("¿trabajás los sábados?").
- También se puede abrir desde el detalle de un trabajo, por cualquiera de las dos partes.
- Una vez abierta, los dos pueden escribir siempre; no hay ventana ni modo de sólo lectura.
- **El trabajo se propone desde cualquiera de los dos lados:**
  - el **cliente** propone (como hoy) y el **profesional** acepta, eligiendo el horario;
  - el **profesional** propone (por ejemplo, un presupuesto después de charlar) con horario incluido,
    y el **cliente** acepta.
- **Cada propuesta aparece en el chat** como un mensaje especial, "Trabajo propuesto", con el estado
  y el horario del trabajo siempre al día, y con "Aceptar / Rechazar" para quien corresponde (§5.7).
- Ambos ven la lista de sus conversaciones (última actividad primero), con el último mensaje y la
  cantidad de no leídos.
- Mensajes de texto plano, en tiempo real cuando el otro está conectado, y persistidos para cuando no.
- Historial paginado y conteo de no leídos. **Sin "visto"**: el otro no sabe si leíste.
- Cualquiera de los dos puede **bloquear** la conversación (§5.8).
- El backend **rechaza mensajes con el PIN** de un trabajo del par, y **con teléfonos o mails**
  mientras el par no tenga un trabajo aceptado (§5.8).
- **Mails**: "Tenés mensajes sin leer", y avisos a las dos partes cuando un trabajo se acepta, cancela,
  reagenda o completa (§5.9).
- Los mensajes viejos se **borran** pasado un plazo configurable (§5.9). Las propuestas sin respuesta
  **no vencen**: quedan `PROPOSED` hasta que alguien las responda o cancele (decisión del equipo).
- **Fuera del MVP:** adjuntos o imágenes, editar o borrar mensajes, "escribiendo…", indicador de en
  línea, reportar usuarios y que el admin lea conversaciones (se hará después, ver §9).

---

## 2. Decisiones de diseño

| Tema | Decisión | Por qué |
|---|---|---|
| Quién puede iniciar una conversación | **El cliente**, desde el perfil de un profesional **publicado**. Además, **cualquiera de las dos partes** desde un trabajo que ya tengan. | Permite consultar antes de pedir un trabajo. El profesional no inicia en frío: no hay un directorio de clientes y así se evita que un profesional le escriba a usuarios que nunca lo contactaron. |
| Unidad de conversación | **Una conversación por par de usuarios**, no una por `JobRequest` | Entre los mismos dos usuarios hay un solo hilo, haya cero, uno o varios trabajos. |
| Cuándo se crea | **Lazy**: la primera vez que alguien la abre (desde el perfil o desde un trabajo), **o al proponer un trabajo** | La propuesta tiene que quedar en el chat, así que proponer busca o crea la conversación del par (§5.7). Los trabajos que ya están en la base no necesitan migración: su conversación se crea cuando alguien la abre. |
| Propuesta en el chat | **Un mensaje de tipo `JOB_PROPOSAL`** que apunta al `JobRequest`; la tarjeta muestra el estado y el horario **actuales** del trabajo, no una copia | Si el mensaje guardara el estado del momento, quedaría desactualizado al aceptar o cancelar. Leyéndolo del `JobRequest` (y avisando por push cuando cambia) la tarjeta siempre dice la verdad. |
| Cuándo se puede escribir | **Siempre**, si participás de la conversación y **nadie la bloqueó** | Sin el trabajo como requisito, no hay un estado del que colgar la ventana. El spam se controla con rate limit al abrir conversaciones y al enviar (§5.2) y con el bloqueo (§5.8). |
| Contenido prohibido | **Se rechaza** (`400`), no se censura | Quien escribió sabe que el mensaje no salió y por qué. Censurar en silencio confunde a los dos y obliga a guardar texto modificado. |
| Quién propone un trabajo | **Cualquiera de las dos partes**; acepta o rechaza **la otra** | El cliente pide como hoy. El profesional puede mandar un presupuesto concreto después de charlar, y el cliente lo acepta con un clic. |
| Profesional que propone | Sólo a un cliente **con el que ya tiene una conversación** | Es la única forma de que el profesional conozca al cliente, y evita que le mande propuestas a cualquiera (§5.6). |
| Envío de mensajes | **REST** (`POST`) | Reusa lo que ya está: `@Valid`, `GlobalExceptionHandler`, `JwtAuthenticationFilter`, rate limiter y tests con MockMvc. Los errores vuelven como JSON estándar y no se pierden en el socket. |
| Recepción en vivo | **STOMP sobre WebSocket**, sólo para *push* | Ya tenemos `spring-boot-starter-websocket`, `JwtChannelInterceptor`, el proxy `/ws` en Vite y el `location /ws/` en nginx. |
| Broker | **Simple broker en memoria** de Spring | Corremos una sola instancia del backend por entorno. Si algún día hay más de una, se cambia por un relay (RabbitMQ) sin tocar la API. |
| Persistencia | Postgres, con dos tablas nuevas | Igual que el resto. Para este volumen sobra, y tener todo en la misma base da transacciones y joins (por ejemplo, con `job_request`) sin sincronizar otro sistema. |
| Dónde viven las tablas | **Schema `chat`** dentro de la misma base (no otra base) | Orden: el chat queda separado de `public` y se puede respaldar, inspeccionar o borrar aparte. Las FK a `public.users` y `public.job_request` y la transacción compartida siguen funcionando, cosa que con otra base se perdería. No suma seguridad (ver §4). |
| Cifrado | **TLS en tránsito + contenido cifrado en reposo** (AES-GCM), **sin** cifrado de extremo a extremo | Ver §5.5: E2E rompe la validación, la vista previa de la bandeja y el acceso del admin ante un reclamo. |
| Identificadores | `Long id`, como `JobRequest` | Mismo criterio que el resto de la API. El acceso se controla verificando que el que llama participa de la conversación. |

**Cómo se abre una conversación:**

```
Perfil público ── POST /api/v1/conversations { professionalId } ──▶ ChatService
                                                     │ ¿el profesional existe y está publicado? si no, 404
                                                     │ ¿es uno mismo? 400
                                                     │ busca la conversación del par (en cualquier orden)
                                                     │ si no existe, la crea (rate limit de conversaciones nuevas)
                                                     ▼
                                       200/201 ConversationResponse ──▶ navegar a /messages/{id}

Detalle del trabajo ── POST /api/v1/job-requests/{jobId}/conversation ──▶ ChatService
                                                     │ ¿el que llama es parte del trabajo? si no, 403
                                                     │ busca o crea la conversación del par (igual que arriba)
                                                     ▼
                                       200/201 ConversationResponse
```

**Flujo de un mensaje:**

```
Front A ── POST /api/v1/conversations/{id}/messages ──▶ ChatService
                                                          │ ¿A participa? si no, 403
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

**Ciclo de un trabajo con propuestas en los dos sentidos:**

```
Cliente propone   ── POST /job-requests { professionalId, … } ──▶ PROPOSED (proposedBy=CLIENT, PIN al cliente)
                                                                    │ el profesional acepta con horario
                                                                    ▼
                                                                 ACCEPTED

Profesional propone ── POST /job-requests { clientId, …, start, end } ──▶ PROPOSED (proposedBy=PROFESSIONAL)
                                                                    │ el cliente acepta (sin body)
                                                                    ▼
                                                                 ACCEPTED (PIN al cliente, en la respuesta)
```

En los dos casos, la otra parte puede rechazar (`REJECTED`) y cualquiera puede cancelar (`CANCELLED`),
como hoy. Desde `ACCEPTED`, **cualquiera de los dos puede pedir reagendar** (con la anticipación mínima)
y responde el otro; completar con PIN y calificar no cambian.

**La propuesta en el chat:**

```
JobRequestServiceImpl.createJobRequest ── publica JobProposed (evento, misma transacción)
                                                          │
                          ChatJobListener (@EventListener, síncrono)
                                                          │ busca o crea la conversación del par
                                                          │ guarda un ChatMessage type=JOB_PROPOSAL, sender=quien propuso
                                                          │ publica ChatMessageSent
                                                          ▼
                     push a los dos por /user/queue/messages (después del commit, como cualquier mensaje)

accept / reject / cancel / reschedule / complete ── publica JobStatusChanged
                                                          ▼
                     push a los dos por /user/queue/job-updates { conversationId, job } (después del commit)
                     → el front actualiza la tarjeta en el lugar, sin un mensaje nuevo
```

---

## 3. Lo que ya existe

- `pom.xml`: `spring-boot-starter-websocket`.
- `config/JwtChannelInterceptor`: valida el JWT en el `CONNECT` de STOMP. Falta registrarlo y
  endurecerlo (ver §5.3).
- El principal de Spring Security es el `publicId` del usuario (`SecurityConfig.userDetailsService`),
  así que `convertAndSendToUser(publicId.toString(), …)` funciona directo.
- `nginx/oficiosya-site.conf`: `location /ws/` con `Upgrade` y `proxy_read_timeout 3600s`, incluido por
  `oficios-ya.conf` (release) y `oficios-ya-dev.conf` (dev).
- `frontend/vite.config.ts`: proxy de `/ws` con `ws: true`.
- `TokenRevocationService` (logout y revocación de sesiones) y `RequestRateLimiter`.
- `JobRequestServiceImpl.isParticipant(jobRequest, userId)` y `JobRequestRepository.findByParticipant`:
  el mismo criterio de "es parte del trabajo" que va a usar el chat al abrir desde un trabajo.
- `Professional.published`: el mismo criterio que usa la búsqueda pública para decidir a quién se
  puede contactar desde el perfil.
- `ScheduleService.createJobSchedule` y `checkJobSlotAvailable`: los reusa la propuesta del profesional
  para reservar y validar su horario (§5.6).

**Lo que falta:** `WebSocketConfig` (no hay ningún `@EnableWebSocketMessageBroker`), permitir el
handshake `/ws/**` en `SecurityConfig`, todo el dominio del chat y las propuestas del profesional en
`JobRequest`.

---

## 4. Modelo de datos

Hibernate crea las tablas solo (`ddl-auto=update`); igual conviene declarar los índices y las
restricciones en las entidades.

### Schema `chat`

Las dos tablas del chat van en un schema propio, `chat`, de la misma base. Los campos nuevos de
`JobRequest` se quedan en `public.job_request`, porque son datos del trabajo y no del chat.

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
| `client` | `@ManyToOne Client` | Quien abrió la conversación desde el perfil, o el cliente del trabajo desde el que se abrió; `client_id` not null |
| `professional` | `@ManyToOne Professional` | El profesional contactado, o el del trabajo; `professional_id` not null |
| `createdAt` | `OffsetDateTime` | `@CreationTimestamp` |
| `lastMessageAt` | `OffsetDateTime` | Para ordenar la bandeja sin `JOIN` + `MAX`. Null hasta el primer mensaje. |
| `lastMessagePreview` | `TEXT`, cifrado | Desnormalizado para la bandeja (primeros 120 caracteres). Se guarda cifrado con el mismo converter que `content` (§5.5). |
| `clientLastReadMessageId` | `Long` | Hasta qué mensaje leyó cada lado (null = nada). Sólo para el conteo de no leídos: no se le muestra al otro. |
| `professionalLastReadMessageId` | `Long` | |
| `clientBlockedAt` | `OffsetDateTime` (nullable) | Cuándo el `client` bloqueó la conversación; null = no la bloqueó (§5.8) |
| `professionalBlockedAt` | `OffsetDateTime` (nullable) | Lo mismo para el `professional` |
| `clientUnreadMailAt` | `OffsetDateTime` (nullable) | Último mail de "mensajes sin leer" enviado a ese lado, para no mandar más de uno cada `CHAT_UNREAD_MAIL_INTERVAL_HOURS` (§5.9) |
| `professionalUnreadMailAt` | `OffsetDateTime` (nullable) | |
| `version` | `Long` `@Version` | Como `JobRequest`: dos mensajes simultáneos no pisan `lastMessageAt` |

- `UNIQUE (client_id, professional_id)`: un solo hilo por par.
- Índices: `(client_id, last_message_at desc)` y `(professional_id, last_message_at desc)`.
- **El par se busca en los dos sentidos.** Desde el refactor de `Client`, un profesional puede contratar
  a otro: si A le escribió a B desde su perfil y después B le pide un trabajo a A, todo tiene que caer en
  la misma conversación. `ConversationRepository.findBetween(a, b)` busca `(client=a, professional=b)` o
  `(client=b, professional=a)`, y sólo si no hay ninguna se crea con los roles del caso actual. Por eso
  `client`/`professional` dicen quién tenía cada rol **al crearla**, no en cada trabajo: los permisos
  de un trabajo se miran siempre en el `JobRequest`.
- Dos aperturas simultáneas del mismo par: el `UNIQUE` hace fallar a la segunda; se captura
  `DataIntegrityViolationException` y se vuelve a buscar.
- Una conversación abierta pero sin mensajes **no aparece en la bandeja** del otro (se filtra por
  `lastMessageAt IS NOT NULL` para quien no la creó), así abrir el chat "para ver" no le genera ruido.

### Cambios en `JobRequest`

| Campo | Tipo | Notas |
|---|---|---|
| `proposedBy` | `Role` (`CLIENT` / `PROFESSIONAL`), not null | Quién propuso el trabajo; define quién puede aceptarlo o rechazarlo. `@ColumnDefault("'CLIENT'")`, como `version`, para que las filas que ya existen queden como propuestas por el cliente, que es lo que eran. |
| `proposedStart`, `proposedEnd` | `OffsetDateTime` (nullable) | El horario que ofrece el profesional cuando propone él. Null si propuso el cliente (el horario lo elige el profesional al aceptar, como hoy). Se limpian al aceptar, igual que `clearReschedule()`. |
| `status` | `JobStatus` | No suma valores. |
| `rescheduleRequestedBy` | `Role` (nullable) | Quién pidió el cambio de horario; sólo mientras `RESCHEDULE_REQUESTED`. Lo responde la otra parte (§5.6). Null en las filas existentes = lo pidió el cliente. |

`confirmationPinHash` pasa a ser **nullable**: si propone el profesional, el PIN se genera recién
cuando el cliente acepta (§5.6). Hibernate con `update` no saca un `NOT NULL` de una columna existente,
así que hay que hacerlo a mano una vez por entorno (ver §6).

### `ChatMessage` (tabla `chat.chat_message`)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `Long` | PK. También sirve de cursor para paginar. |
| `conversation` | `@ManyToOne(LAZY) Conversation` | not null |
| `sender` | `@ManyToOne(LAZY) Client` | not null. En una propuesta, quien propuso. |
| `type` | `ChatMessageType` (`TEXT` / `JOB_PROPOSAL`), not null | `TEXT` es un mensaje escrito por el usuario; `JOB_PROPOSAL` es la tarjeta "Trabajo propuesto", que sólo crea el backend (§5.7). |
| `content` | `TEXT`, cifrado (nullable) | En `TEXT`: hasta 2000 caracteres en claro (se valida en el DTO, antes de cifrar). En la base queda el texto cifrado, más largo, por eso `TEXT` (§5.5). En `JOB_PROPOSAL`: null, porque todo lo que muestra sale del `JobRequest`. |
| `jobRequest` | `@ManyToOne(LAZY) JobRequest` (nullable) | En `TEXT`, opcional: a qué trabajo se refiere el mensaje. Si viene, tiene que ser un trabajo del par. En `JOB_PROPOSAL`, **obligatorio**: el trabajo propuesto. |
| `clientMessageId` | `UUID` | En `TEXT` lo genera el front; hace que un reintento no duplique el mensaje. En `JOB_PROPOSAL` lo genera el backend. |
| `createdAt` | `OffsetDateTime` | `@CreationTimestamp` |

- Índice `(conversation_id, id desc)` para la paginación.
- `UNIQUE (conversation_id, sender_id, client_message_id)`: si el front reintenta el `POST` con el
  mismo `clientMessageId`, se devuelve el mensaje ya guardado (`200`) en vez de crear otro.
- `UNIQUE (job_request_id) WHERE type = 'JOB_PROPOSAL'` no se puede declarar con JPA (índice parcial);
  la unicidad "una tarjeta por trabajo" la garantiza que sólo `createJobRequest` la crea, una vez.
- Check en la entidad (`@AssertTrue` o en el servicio): `JOB_PROPOSAL` ⇒ `jobRequest != null` y
  `content == null`; `TEXT` ⇒ `content != null`.

**"No leídos"** = mensajes de la conversación con `id > miLastReadMessageId` y `sender != yo`.

---

## 5. Backend: qué hay que hacer

### 5.1 Paquetes y clases nuevas (mismo estilo que `JobRequest`)

```
entity/Conversation.java, entity/ChatMessage.java, entity/ChatMessageType.java
repository/ConversationRepository.java, repository/ChatMessageRepository.java
dto/request/ConversationCreateRequest.java    { UUID professionalId }
dto/request/ChatMessageCreateRequest.java     { String content, UUID clientMessageId, Long jobRequestId? }
dto/response/ConversationResponse.java
dto/response/ChatMessageResponse.java
dto/response/ChatJobSummary.java              (la tarjeta del trabajo, §5.7)
mapper/ChatMapper.java                        (MapStruct)
service/interfaces/ChatService.java, service/ChatServiceImpl.java
service/ChatMessageSent.java                  (evento) + ChatPushListener.java
service/JobProposed.java, service/JobStatusChanged.java   (eventos que publica JobRequestServiceImpl)
service/ChatJobListener.java                  (crea la tarjeta y avisa los cambios, §5.7)
controller/ConversationController.java
config/WebSocketConfig.java
config/ChatContentConverter.java              (cifrado en reposo, §5.5)
exception/ConversationNotFoundException.java  (+ handler en GlobalExceptionHandler)
service/ChatContentFilter.java                (PIN y datos de contacto, §5.8)
service/ChatMailNotifier.java                 (mails de no leídos y de cambios del trabajo, §5.9)
service/ChatMessageCleanup.java              (tarea periódica, §5.9)
```

Y cambios en lo existente (§5.6): `JobRequest.proposedBy`, `proposedStart`/`proposedEnd`,
`JobRequestCreateRequest`, `JobRequestAcceptRequest` y las reglas de crear, aceptar y rechazar en
`JobRequestServiceImpl`; `JobRequestResponse.proposedBy` y el endpoint de conversación en
`JobRequestController`.

### 5.2 API REST del chat (todo autenticado)

| Método y ruta | Qué hace | Respuestas |
|---|---|---|
| `POST /api/v1/conversations` `{ professionalId }` | **Contacto desde el perfil.** Devuelve la conversación entre el que llama y ese profesional, creándola si no existe (idempotente). | `201` si es nueva, `200` si ya existía, `400` si es uno mismo, `404` si el profesional no existe o no está publicado (salvo que ya tengan una conversación: entonces `200`), `429` |
| `POST /api/v1/job-requests/{jobId}/conversation` | **Desde un trabajo.** Lo mismo, pero para el par de ese trabajo. Lo puede llamar el cliente o el profesional del trabajo, en cualquier estado. | `201`, `200`, `403` si no es parte del trabajo, `404` si el trabajo no existe |
| `GET /api/v1/conversations` | Bandeja del que llama (como cliente y como profesional), por `lastMessageAt desc` | `200 ConversationResponse[]` |
| `GET /api/v1/conversations/unread-count` | Total de no leídos, para el badge del header | `200 { count }` |
| `GET /api/v1/conversations/{id}/messages?before={msgId}&limit=30` | Página de mensajes, del más nuevo al más viejo; `limit` máximo 100 | `200 ChatMessageResponse[]`, `403` si no participa, `404` |
| `POST /api/v1/conversations/{id}/messages` `{ content, clientMessageId, jobRequestId? }` | Guarda, actualiza la bandeja y hace el push | `201 ChatMessageResponse`, `200` si es un reintento, `400` si es inválido, `403`, `429` |
| `POST /api/v1/conversations/{id}/read` `{ lastReadMessageId }` | Marca leído hasta ese mensaje (nunca hacia atrás). **No** avisa al otro (no hay "visto"). | `204` |
| `POST /api/v1/conversations/{id}/block` | El que llama bloquea la conversación (idempotente) | `200 ConversationResponse`, `403`, `404` |
| `DELETE /api/v1/conversations/{id}/block` | Saca **su** bloqueo; si el otro también bloqueó, sigue bloqueada | `200 ConversationResponse`, `403`, `404` |

`ConversationResponse`:
```json
{
  "id": 12,
  "otherParticipant": { "id": "uuid", "name": "Ana Pérez", "profileImageUrl": "/uploads/...", "role": "PROFESSIONAL" },
  "myRole": "CLIENT",
  "lastMessagePreview": "¿Puedes el jueves?",
  "lastMessageAt": "2026-10-12T21:30:00-03:00",
  "unreadCount": 2,
  "canWrite": true,
  "blockedByMe": false
}
```

`canWrite` es `false` si cualquiera de los dos bloqueó. `blockedByMe` dice si el bloqueo es mío (para
mostrar "Desbloquear"); si bloqueó el otro, el front sólo ve `canWrite: false`, sin saber quién fue.

`myRole` es el rol con que se creó la conversación (§4), sólo informativo. Para decidir si mostrar
"Proponer trabajo" el front mira si el usuario logueado es profesional (§7), porque con dos
profesionales cualquiera de los dos puede proponerle al otro.

`ChatMessageResponse` de texto:
```json
{ "id": 345, "conversationId": 12, "type": "TEXT", "senderId": "uuid", "content": "Hola", "clientMessageId": "uuid", "jobRequestId": 87, "job": null, "createdAt": "..." }
```

`ChatMessageResponse` de una propuesta (`job` trae el estado **actual** del trabajo, §5.7):
```json
{
  "id": 346, "conversationId": 12, "type": "JOB_PROPOSAL", "senderId": "uuid", "content": null,
  "clientMessageId": "uuid", "jobRequestId": 87, "createdAt": "...",
  "job": {
    "id": 87,
    "status": "PROPOSED",
    "proposedBy": "PROFESSIONAL",
    "tasks": [ { "tradeName": "Plomería", "description": "Cambiar la canilla de la cocina" } ],
    "location": "Av. Italia 1234",
    "paymentAmount": 1500.00,
    "start": "2026-10-16T10:00:00-03:00",
    "end": "2026-10-16T12:00:00-03:00",
    "rescheduleStart": null,
    "rescheduleEnd": null
  }
}
```

`job` es un `ChatJobSummary`: un recorte de `JobRequestResponse` sin datos de contacto ni PIN. `start` y
`end` son el horario que corresponde al estado: el propuesto por el profesional mientras está
`PROPOSED`, el agendado desde `ACCEPTED`, y `null` si lo propuso el cliente y todavía nadie lo aceptó
("a confirmar").

**Reglas en `ChatServiceImpl`:**

- El que llama se toma de `AuthenticatedUser.id(authentication)`, igual que en los endpoints `/me`.
- Participa = es `conversation.client` o `conversation.professional`. Si no participa, se lanza
  `AccessDeniedException`, como hace `JobRequestServiceImpl`.
- **Abrir desde el perfil:** el profesional tiene que existir y estar `published`; si no, `404` (no se
  distingue "no existe" de "no publicado", como en la búsqueda). Si el par ya tiene una conversación,
  se devuelve aunque el profesional se haya despublicado después.
- **Abrir desde un trabajo:** sólo si el que llama es parte del `JobRequest` (mismo criterio que
  `isParticipant`). Que el profesional esté `published` no importa: el trabajo ya los vinculó.
- **Escribir:** alcanza con participar y que la conversación no esté bloqueada (si no, `403`, §5.8).
  No se mira el estado de ningún trabajo, salvo para el filtro de contacto (§5.8).
- Si el mensaje trae `jobRequestId`, ese trabajo tiene que ser del par; si no, `400`.
- `content`: `trim()`, de 1 a 2000 caracteres y texto plano. El backend no interpreta HTML, y el front
  tiene que mostrarlo como texto, nunca con `dangerouslySetInnerHTML`.
- **Rate limits por usuario** (con el `publicId` como clave en vez de la IP, reusando la idea de
  `RequestRateLimiter`):
  - enviar mensajes: 30 por minuto;
  - **abrir conversaciones nuevas** (sólo cuenta cuando se crea, no cuando ya existía): 20 por día.
    Es el freno principal contra un cliente que le escribe lo mismo a todos los profesionales.
- `lastMessagePreview` = los primeros 120 caracteres del contenido; en una propuesta, el texto fijo
  "Trabajo propuesto".
- `POST /conversations/{id}/messages` crea sólo mensajes `TEXT`; el `type` no se acepta en el body.
  Las tarjetas sólo las crea el backend.
- Al armar la página de mensajes, los `job` de las tarjetas se cargan con una sola consulta
  (`JOIN FETCH` o `IN (:jobIds)`), no uno por mensaje.

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
| `/user/queue/job-updates` | `{ conversationId, job: ChatJobSummary }` | Cambió el estado o el horario de un trabajo del par (aceptado, rechazado, cancelado, reagendado, completado). El front actualiza la tarjeta del trabajo en el lugar. |

**Reconexión:** el push no garantiza la entrega. Al reconectar, el front vuelve a pedir
`GET /conversations` y los mensajes de la conversación abierta. La base de datos es la fuente de verdad.

### 5.4 Tests (backend)

Siguiendo el estilo actual (Mockito para servicios, MockMvc para controllers):

- `ChatServiceImplTest`:
  - abrir desde el perfil es idempotente y crea la conversación con el que llama como cliente;
  - abrir desde el perfil de un profesional no publicado o inexistente da 404, salvo que ya haya una
    conversación del par; abrirla con uno mismo da 400;
  - abrir desde un trabajo es idempotente, y dos trabajos del mismo par devuelven la misma conversación,
    que también es la que se abrió antes desde el perfil;
  - el par se encuentra en los dos sentidos (A le escribe a B y B le pide un trabajo a A: una sola conversación);
  - quien no es parte del trabajo recibe 403 al abrir, y quien no participa de la conversación, 403 al leer o escribir;
  - se puede escribir sin ningún trabajo y con trabajos en cualquier estado;
  - el límite de conversaciones nuevas por día cuenta sólo las creadas, no las reabiertas;
  - una conversación sin mensajes no aparece en la bandeja del otro;
  - un `jobRequestId` de otro par da 400;
  - el contenido se valida (vacío, sólo espacios, más de 2000);
  - reintentar con el mismo `clientMessageId` no duplica;
  - el "leído" nunca retrocede y no manda nada al otro;
  - bloquear: nadie escribe (403), sí se lee; desbloquear saca sólo el bloqueo propio; abrir desde el
    perfil devuelve la conversación bloqueada sin crear otra; `canWrite` y `blockedByMe` correctos para
    cada lado;
  - un mensaje con el PIN de un trabajo activo del par da 400; seis dígitos que no son el PIN pasan;
  - un teléfono o mail da 400 sin trabajo `ACCEPTED`, `RESCHEDULE_REQUESTED` o `COMPLETED` del par, y
    pasa con alguno;
  - el conteo de no leídos ignora los mensajes propios;
  - la bandeja queda ordenada por `lastMessageAt`.
- `JobRequestServiceImplTest` (propuestas, §5.6):
  - el cliente propone: `proposedBy=CLIENT`, el PIN sale en la respuesta, acepta sólo el profesional y
    con horario (como hoy);
  - el profesional propone: `proposedBy=PROFESSIONAL`, sin PIN en la respuesta, horario obligatorio y
    en el futuro, y sólo con una conversación previa con ese cliente (si no, 403);
  - el profesional no puede proponerse a sí mismo ni proponer sin ser profesional;
  - el cliente acepta la propuesta del profesional: se reserva el horario propuesto, el PIN sale en la
    respuesta de la aceptación y nunca en otra;
  - quien propuso no puede aceptar ni rechazar su propia propuesta (403), pero sí cancelarla;
  - si el horario propuesto ya está ocupado cuando el cliente acepta, la aceptación falla y el trabajo
    sigue `PROPOSED`;
  - las filas existentes (sin `proposedBy`) se comportan como propuestas por el cliente;
  - reagendar: lo puede pedir el cliente o el profesional, con menos de `JOB_MIN_NOTICE_HOURS` da 400,
    lo responde sólo quien no lo pidió (quien lo pidió recibe 403 al aceptar o rechazar), y un
    `RESCHEDULE_REQUESTED` con `rescheduleRequestedBy` null lo responde el profesional;
  - crear un trabajo publica `JobProposed`, y cada acción que cambia el estado o el horario publica
    `JobStatusChanged`.
- `ChatJobListenerTest` (la tarjeta, §5.7):
  - proponer deja un mensaje `JOB_PROPOSAL` con `sender` = quien propuso y sin `content`, en la
    conversación del par, creándola si no existía (sin contar para el límite de conversaciones nuevas);
  - actualiza `lastMessageAt` y el preview "Trabajo propuesto", y cuenta como no leído para el otro;
  - si guardar la tarjeta falla, la propuesta hace rollback;
  - `ChatJobSummary` muestra el horario correcto en cada estado (tabla de §5.7), sin PIN ni contacto;
  - un cambio de estado manda `/user/queue/job-updates` a los dos después del commit y no crea un
    mensaje nuevo ni cambia `lastMessageAt`;
  - `POST /conversations/{id}/messages` con `type: JOB_PROPOSAL` en el body crea igual un `TEXT`
    (el DTO no tiene ese campo);
  - la página de mensajes carga los trabajos de las tarjetas en una sola consulta.
- `ChatMessageCleanupTest` y `ChatMailNotifierTest` (§5.9):
  - con `CHAT_MESSAGE_RETENTION_DAYS=-1` no se borra nada; con N, se borran los mensajes más viejos y
    se limpia el preview si la conversación quedó vacía;
  - el mail de no leídos sale como mucho una vez por intervalo y no sale si ya los leyó; el de cambios
    del trabajo sale a las dos partes y no lleva el PIN.
- `JobRequestServiceImplTest`, bloqueo: proponer (en los dos sentidos) entre un par con la conversación
  bloqueada da 403; los trabajos que ya existían siguen su curso.
- `ConversationControllerTest`, el endpoint nuevo en `JobRequestControllerTest` y los cambios en
  crear y aceptar: 401 sin token, códigos de estado (incluido el 429) y forma del JSON de error.
- `JwtChannelInterceptorTest`:
  - se rechaza un `CONNECT` sin token, con token inválido, revocado o vencido;
  - se rechaza un `SUBSCRIBE` a un destino que no es `/user/queue/**`.
- `ChatPushListenerTest`: después del commit llama a `convertAndSendToUser` para los dos
  participantes, con su `publicId`; marcar como leído no hace ningún push.
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

- no se puede validar ni filtrar el contenido (largo, el PIN y los teléfonos y mails de §5.8);
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

### 5.6 Propuestas de trabajo en los dos sentidos

Hoy sólo el cliente crea un `JobRequest` y sólo el profesional lo acepta o rechaza
(`findOwnedByProfessional`). El cambio: quien propone queda en `proposedBy` y **acepta o rechaza
siempre la otra parte**.

**Crear — `POST /api/v1/job-requests`** (mismo endpoint, compatible con el front actual):

`JobRequestCreateRequest` lleva **exactamente uno** de `professionalId` o `clientId` (si vienen los dos
o ninguno, `400`):

| Viene | Quién propone | Reglas |
|---|---|---|
| `professionalId` | El que llama, **como cliente** | Igual que hoy: no a sí mismo; se genera el PIN y se devuelve en esta respuesta. `proposedBy=CLIENT`. `startTimestamp`/`endTimestamp` no se aceptan (`400`): el horario lo elige el profesional al aceptar. |
| `clientId` | El que llama, **como profesional** | El que llama tiene que ser `Professional` (si no, `403`); no a sí mismo (`400`); tiene que existir una conversación entre los dos (`ConversationRepository.findBetween`; si no, `403`). `startTimestamp` y `endTimestamp` obligatorios y en el futuro (`requireFuture`), y el hueco tiene que estar libre en su agenda (mismo chequeo que `checkJobSlotAvailable`, adaptado a un trabajo sin bloque todavía). **No** se genera PIN. `proposedBy=PROFESSIONAL`. |

Que el profesional esté `published` no importa para proponer: si ya charló con el cliente, puede
mandarle un presupuesto aunque haya ocultado el perfil.

En los dos sentidos, si el par tiene la conversación **bloqueada** (por cualquiera de los dos), crear
la propuesta da `403` (§5.8). Si no, el bloqueo se saltearía proponiendo un trabajo, porque la tarjeta
aparece en el chat.

**Aceptar — `POST /api/v1/job-requests/{id}/accept`:**

- Puede aceptar sólo la parte que **no** propuso; si no, `403` (reemplaza a `findOwnedByProfessional`
  en aceptar y rechazar con un `findOwnedByCounterpart`).
- Si propuso el cliente: igual que hoy, el profesional manda `{ startTimestamp, endTimestamp }` y se crea
  el bloque en su agenda.
- Si propuso el profesional: el cliente acepta **sin body** (`@RequestBody(required = false)`); si viene
  un horario, `400`. Se vuelve a validar `requireFuture(proposedStart)` (la propuesta pudo quedar
  vieja) y se crea el bloque con `createJobSchedule(job, proposedStart, proposedEnd)`; si el hueco se
  ocupó mientras tanto, falla y el trabajo sigue `PROPOSED`. Se genera el PIN, se guarda el hash y **se
  devuelve en la respuesta de esta aceptación**, la única vez que aparece. Se limpian `proposedStart`/`End`.
- En los dos casos el estado pasa a `ACCEPTED`.

**Rechazar — `POST /api/v1/job-requests/{id}/reject`:** también la parte que no propuso.

**Cancelar:** sin cambios; cualquiera de los dos. Para quien propuso, cancelar en `PROPOSED` es
"retirar la propuesta".

**Reagendar — lo pide cualquiera de los dos, responde el otro.** Hoy sólo lo pide el cliente
(`requestReschedule` chequea `jobRequest.getClient()`) y sólo responde el profesional
(`acceptReschedule` y `rejectReschedule` usan `findOwnedByProfessional`). El cambio:

- `JobRequest` suma `rescheduleRequestedBy` (`Role`, nullable): quién pidió el cambio. Se setea en
  `requestReschedule` y se limpia en `clearReschedule()`, junto con `rescheduleStart`/`End`.
- `POST /{id}/reschedule`: lo puede llamar **cualquiera de las dos partes** (`isParticipant`; si no,
  `403`). El resto de las reglas siguen como hoy:
  - sólo desde `ACCEPTED`;
  - con al menos `JOB_MIN_NOTICE_HOURS` (24 h por defecto) antes del inicio del bloque agendado
    (`requireNotice`), igual que para cancelar;
  - el nuevo horario tiene que estar en el futuro (`requireFuture`), ser distinto del actual
    (`requireDifferentTimeframe`) y estar libre en la agenda del profesional (`checkJobSlotAvailable`).
    Si lo pide el profesional, el chequeo de agenda es el mismo: es su propia agenda.
- `POST /{id}/reschedule/accept` y `/reject`: los responde **la parte que no lo pidió** (si no, `403`).
  Se cambia `findOwnedByProfessional` por un chequeo contra `rescheduleRequestedBy`. Aceptar mueve el
  bloque (`moveJobSchedule`), igual que hoy.
- Las filas que ya están `RESCHEDULE_REQUESTED` al hacer el deploy tienen `rescheduleRequestedBy` en
  null: se toman como pedidas por el cliente, que es lo único que existía.
- `JobRequestResponse` suma `rescheduleRequestedBy`, para que el front sepa a quién mostrarle
  "Ver cambio" y a quién "Esperando respuesta".

**Lo que no cambia:** completar con PIN (el profesional), calificar (el cliente) y la visibilidad de los
datos de contacto en `JobRequestResponse`.

**Respuesta:** `JobRequestResponse` suma `proposedBy`, y `proposedStart`/`proposedEnd` mientras esté
`PROPOSED` por el profesional. El front lo usa para mostrar "Aceptar / Rechazar" a quien corresponde.

**Base:** las filas existentes quedan con `proposedBy=CLIENT` por el `@ColumnDefault` y
`confirmationPinHash` ya cargado, así que se siguen comportando exactamente como hoy.

**Javadoc:** actualizar el comentario del ciclo de vida en `JobRequestController` y los de `create`,
`accept`, `reject` y `reschedule` (hoy dice "The client proposes a new timeframe…").

### 5.7 La propuesta en el chat ("Trabajo propuesto")

Cada `JobRequest` nuevo, lo proponga quien lo proponga, deja en la conversación del par un mensaje
`JOB_PROPOSAL`. El front lo dibuja como una tarjeta:

```
┌────────────────────────────────────────────┐
│ Trabajo propuesto            [ Pendiente ] │
│ Plomería: cambiar la canilla de la cocina  │
│ 📅 Jue 16/10, 10:00 – 12:00                │
│ 📍 Av. Italia 1234   💲 $1.500             │
│                                            │
│ [ Aceptar ]  [ Rechazar ]                  │  ← sólo a quien no propuso, mientras PROPOSED
└────────────────────────────────────────────┘
```

**Cómo se crea:**

- `JobRequestServiceImpl.createJobRequest` publica `JobProposed(jobRequestId)` después de guardar el
  trabajo. Así `JobRequestServiceImpl` no depende de `ChatService`.
- `ChatJobListener` lo escucha con un `@EventListener` **síncrono** (no `AFTER_COMMIT`): corre dentro de
  la misma transacción, así que si falla la tarjeta falla la propuesta, y nunca queda un trabajo sin su
  tarjeta ni una tarjeta sin trabajo.
- Busca o crea la conversación del par (`findBetween`, con los roles del trabajo si es nueva). Que un
  cliente proponga desde el perfil sin haber escrito antes crea la conversación ahí; **no** cuenta para
  el límite de conversaciones nuevas, porque crear un trabajo ya pide bastante más que un mensaje.
- Guarda el `ChatMessage` con `type=JOB_PROPOSAL`, `sender` = quien propuso, `jobRequest` = el trabajo,
  `content=null`, y actualiza `lastMessageAt` y `lastMessagePreview` ("Trabajo propuesto").
- Publica `ChatMessageSent`, y el push sale después del commit por `/user/queue/messages`, igual que
  un mensaje de texto. Para el otro cuenta como no leído.

**Estado y horario siempre al día:**

- El mensaje no guarda ni estado ni horario: `ChatMessageResponse.job` se arma desde el `JobRequest`
  cada vez que se pide la página de mensajes.
- La etiqueta de estado la traduce el front: `PROPOSED` → "Pendiente", `ACCEPTED` → "Aceptado",
  `RESCHEDULE_REQUESTED` → "Cambio de horario pedido", `REJECTED` → "Rechazado", `CANCELLED` →
  "Cancelado", `COMPLETED` → "Completado".
- El horario (`start`/`end` de `ChatJobSummary`):

  | Estado | Horario que muestra |
  |---|---|
  | `PROPOSED`, propuso el profesional | `proposedStart` – `proposedEnd` |
  | `PROPOSED`, propuso el cliente | `null` → "Horario a confirmar por el profesional" |
  | `ACCEPTED`, `COMPLETED` | El bloque agendado (`scheduledStart` – `scheduledEnd`) |
  | `RESCHEDULE_REQUESTED` | El agendado, y además `rescheduleStart` – `rescheduleEnd` como "propuesto" |
  | `REJECTED`, `CANCELLED` | `proposedStart` – `proposedEnd` si los hay (tachado por el front); si no, `null` |

  Para el último caso, al rechazar o cancelar un `PROPOSED` del profesional **no** se limpian
  `proposedStart`/`End` (sólo se limpian al aceptar). Un `ACCEPTED` cancelado muestra `null`:
  `releaseJobSchedule` borra el bloque, y guardar una copia del horario sólo para la tarjeta no vale
  la pena; el estado "Cancelado" ya dice lo importante.
- Cada acción que cambia el trabajo (`accept`, `reject`, `cancel`, `requestReschedule`,
  `acceptReschedule`, `rejectReschedule`, `complete`) publica `JobStatusChanged(jobRequestId)`. Un
  `@TransactionalEventListener(AFTER_COMMIT)` arma el `ChatJobSummary` y lo manda a los dos por
  `/user/queue/job-updates`. **No** crea un mensaje nuevo ni mueve la conversación arriba en la bandeja:
  la tarjeta se actualiza en su lugar.
- Si el trabajo no tiene tarjeta (es de antes del deploy), el push sale igual y el front lo ignora si
  no encuentra la tarjeta.

**Botones de la tarjeta:** "Aceptar" y "Rechazar" llaman a los mismos endpoints de §5.6
(`/job-requests/{id}/accept` y `/reject`); el chat no tiene endpoints propios para eso. Si propuso el
cliente, "Aceptar" del profesional abre el selector de horario, como en "Mis solicitudes". Quien propuso
ve "Cancelar propuesta" mientras está `PROPOSED`.

**Privacidad:** `ChatJobSummary` no lleva el PIN ni los datos de contacto, y no se cifra (no tiene texto
del usuario más allá de las tareas, que ya están en claro en `job_request`).

### 5.8 Bloqueo y filtros de contenido

**Bloquear:**

- Cualquiera de los dos bloquea con `POST /conversations/{id}/block` (setea su `…BlockedAt`) y se
  desbloquea con `DELETE` (lo pone en null). Cada uno maneja sólo su propio bloqueo.
- Con al menos un bloqueo: nadie puede escribir (`403` "La conversación está bloqueada"), y ninguno de
  los dos puede proponerle un trabajo al otro (§5.6). Los dos siguen viendo el historial.
- Abrir desde el perfil o desde un trabajo devuelve la misma conversación bloqueada: el `UNIQUE` del par
  impide crear otra, así que bloquear no se puede esquivar.
- Los trabajos que ya existían no se tocan: se pueden aceptar, cancelar, completar, etc. desde
  "Mis solicitudes". Para cortar un trabajo, se cancela como siempre.
- No hay mails de no leídos en una conversación bloqueada.

**Filtros (en `ChatContentFilter`, antes de guardar):** si el mensaje no pasa, `400` con un mensaje
claro y **no se guarda**. Nunca se loguea el contenido rechazado.

| Filtro | Cuándo aplica | Cómo |
|---|---|---|
| **PIN** | Siempre | Si el mensaje tiene una secuencia de 6 dígitos seguidos (ignorando espacios, puntos y guiones entre ellos), se compara con `passwordEncoder.matches` contra el `confirmationPinHash` de cada trabajo `ACCEPTED` o `RESCHEDULE_REQUESTED` del par. Si coincide: `400` "Nunca compartas tu PIN por el chat". Sólo corre cuando hay 6 dígitos, así que no le cuesta nada a los mensajes normales. |
| **Teléfonos y mails** | Mientras el par **no** tenga un trabajo `ACCEPTED`, `RESCHEDULE_REQUESTED` o `COMPLETED` | Expresiones regulares para mails y para teléfonos de Uruguay (`09x xxx xxx`, `+598…`, fijos de 8 dígitos), tolerando espacios, puntos y guiones. Si coincide: `400` "No se pueden compartir teléfonos ni mails hasta que haya un trabajo aceptado". Es un freno, no una garantía: "cero nueve…" pasa. |

- El chat muestra un **aviso fijo** arriba: "Nunca compartas tu PIN por el chat". Lo dibuja el front;
  no es un mensaje guardado.
- Orden: primero el PIN (aunque haya trabajo aceptado), después el de contacto.

### 5.9 Mails y tareas periódicas

Las tres tareas siguen el patrón de `VerificationCodeCleanup` (`@Scheduled` ya está habilitado en
`OficiosYa`) y los mails usan `EmailSenderServiceImpl`.

**Mail de mensajes sin leer (`ChatMailNotifier`):**

- Cada 15 minutos busca, por lado de cada conversación: mensajes no leídos con más de 15 minutos, la
  conversación sin bloquear, y `…UnreadMailAt` null o anterior a `CHAT_UNREAD_MAIL_INTERVAL_HOURS`.
- Manda "Tenés mensajes sin leer de {nombre}" con un link a `/messages/{id}`, **sin el contenido** del
  mensaje (el mail no está cifrado). Actualiza `…UnreadMailAt`.
- Los 15 minutos evitan mandar un mail a alguien que está leyendo en ese momento.

**Mail de cambios del trabajo:**

- Un `@TransactionalEventListener(AFTER_COMMIT)` sobre `JobStatusChanged` (el mismo evento de §5.7) y
  sobre `JobProposed` manda un mail a **las dos partes** cuando el trabajo se propone, acepta, rechaza,
  cancela, reagenda (pedido, aceptado o rechazado) o completa.
- El mail dice qué pasó, quién lo hizo y el horario, con un link al trabajo. **Nunca** lleva el PIN.
- Si el envío falla, se loguea y no afecta al trabajo (ya se hizo el commit).

**Borrado de mensajes viejos (`ChatMessageCleanup`):**

- Una vez por día borra los `ChatMessage` con `createdAt` anterior a `CHAT_MESSAGE_RETENTION_DAYS`
  (con `-1` no borra nada). Incluye las tarjetas: el trabajo sigue en "Mis solicitudes".
- Si una conversación queda sin mensajes, pone `lastMessagePreview` y `lastMessageAt` en null (el
  preview también tiene texto del usuario). Si le quedan mensajes, recalcula el preview desde el último.
- **Cuentas borradas:** hoy no existe el borrado de cuentas. Cuando se agregue, se borran las
  conversaciones del usuario con todos sus mensajes, también para el otro participante.

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
- [ ] **`job_request`:** `update` agrega `proposed_by` (con default `'CLIENT'`, así las filas existentes
      quedan bien) y `proposed_start`/`proposed_end` nullable. Lo que **no** hace es sacar el
      `NOT NULL` de `confirmation_pin_hash`: lo hace solo `EnumCheckConstraintUpdater` en cada arranque
      (`ALTER TABLE job_request ALTER COLUMN confirmation_pin_hash DROP NOT NULL`, idempotente), igual
      que pasa a `CANCELLED` las filas que quedaron en `EXPIRED` antes de rehacer el check de `status`.
      No hay que correr nada a mano.
- [ ] **Variables nuevas** (en `application.properties`, `docker-compose.yml` y `.env.example`, con
      default):
  - `CHAT_MESSAGE_MAX_LENGTH=2000`
  - `RATE_LIMIT_CHAT_PER_MINUTE=30`
  - `RATE_LIMIT_CHAT_NEW_CONVERSATIONS_PER_DAY=20`
  - `CHAT_UNREAD_MAIL_INTERVAL_HOURS=4`
  - `CHAT_MESSAGE_RETENTION_DAYS=-1` (`-1`: no se borran)
  - `JOB_MIN_NOTICE_HOURS` ya existe (24); ahora también limita al profesional al reagendar.
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
  - En el workflow de Playwright, subir `RATE_LIMIT_CHAT_PER_MINUTE` y
    `RATE_LIMIT_CHAT_NEW_CONVERSATIONS_PER_DAY` igual que se hace con `RATE_LIMIT_AUTH_PER_MINUTE`.
- [ ] **Una sola instancia:** el simple broker, la tabla de sesiones y los contadores de rate limit
      viven en memoria. Mientras `docker compose` levante una sola réplica de `app`, está bien. Dejarlo
      anotado en el README.
- [ ] **Reinicio en un deploy:** al hacer `up -d --build`, todos los sockets se cortan. El front
      tiene que reconectar con backoff y volver a pedir el estado (ver §5.3).
- [ ] **CI de Playwright:** ya levanta `app` con Docker. Los tests E2E usan dos `browser.newContext()`
      (cliente y profesional):
      - el cliente abre el chat desde el perfil del profesional y el mensaje le llega sin recargar;
      - el profesional le propone un trabajo desde el chat, al cliente le aparece la tarjeta "Trabajo
        propuesto" sin recargar, la acepta desde la tarjeta y ve el PIN; en la pantalla del profesional
        la tarjeta pasa a "Aceptado" sola.
- [ ] **Logs:** loguear los `CONNECT` rechazados (sin el token) y los errores del push.
      Nunca loguear el contenido de los mensajes.

---

## 7. Contrato para el frontend

Lo mínimo que necesita quien haga la UI:

**Chat**

1. Conectar con `@stomp/stompjs` a `ws(s)://<host>/ws/chat`, mandando `Authorization: Bearer <token>` en
   los `connectHeaders`. Usar heartbeat de 10 s y reconexión automática.
2. Suscribirse a `/user/queue/messages` y `/user/queue/job-updates`. No hay "visto": no se muestra
   si el otro leyó.
3. Para enviar: `POST /api/v1/conversations/{id}/messages` con un `clientMessageId` (`crypto.randomUUID()`).
   Mostrar el mensaje como "enviando" y reemplazarlo cuando llega la respuesta o el push con el mismo
   `clientMessageId`.
4. **En el perfil público de un profesional**, un botón "Enviar mensaje" (oculto en el propio perfil):
   `POST /api/v1/conversations { professionalId }` y luego navegar a `/messages/{id}`. Si responde `429`,
   avisar que se alcanzó el límite de conversaciones nuevas por hoy.
5. En el detalle de un trabajo (y en su tarjeta en "Mis solicitudes"), un botón "Mensajes" para las
   dos partes: `POST /api/v1/job-requests/{jobId}/conversation` y luego navegar a `/messages/{id}`.
   Al enviar desde ahí, mandar `jobRequestId` para que el mensaje quede asociado al trabajo.
6. Al abrir una conversación, y cada vez que llega un mensaje con la conversación a la vista:
   `POST /api/v1/conversations/{id}/read`.
7. Al reconectar el socket, volver a pedir la bandeja y la conversación abierta.
8. Al hacer logout, desconectar el cliente STOMP.
9. **Aviso fijo** arriba de cada conversación: "Nunca compartas tu PIN por el chat".
10. Si un envío responde `400` por PIN o por datos de contacto, mostrar el mensaje del back y dejar el
    texto en el campo para que lo edite (no se guardó).
11. **Bloquear:** en el menú de la conversación, "Bloquear" (`POST …/block`) o, si `blockedByMe`,
    "Desbloquear" (`DELETE …/block`). Con `canWrite: false`, campo deshabilitado y sin "Proponer
    trabajo"; el aviso dice "Bloqueaste esta conversación" o "No puedes escribir en esta conversación"
    según `blockedByMe`.

**Propuestas de trabajo**

12. **En la conversación, si el usuario logueado es profesional**, un botón "Proponer trabajo" (no
   depende de `myRole`: un profesional que le escribió a otro también puede proponerle). Es el mismo formulario de crear trabajo,
   con `clientId` = el otro participante y un horario (`startTimestamp`, `endTimestamp`) obligatorio. El
   PIN **no** aparece en esa respuesta.
   En la conversación, el botón "Pedir trabajo" para el cliente sigue usando `professionalId`.
13. En "Mis solicitudes", los botones "Aceptar" y "Rechazar" se muestran a quien **no** propuso
    (`proposedBy` distinto de mi rol en ese trabajo), no siempre al profesional:
    - si propuso el cliente, el profesional acepta eligiendo el horario, como hoy;
    - si propuso el profesional, el cliente ve el horario propuesto (`proposedStart`/`proposedEnd`) y
      acepta con un clic, sin body. **La respuesta trae el PIN**: mostrarlo igual que hoy después de crear
      un trabajo, con el aviso de que no se vuelve a mostrar.
14. Quien propuso ve su propuesta como "Esperando respuesta" y puede retirarla con "Cancelar".
    Las propuestas vencidas aparecen como canceladas; no hay un estado nuevo en el front.

**Reagendar**

- El botón "Reagendar" (`RescheduleModal`) aparece para **las dos partes** en un trabajo `ACCEPTED`,
  no sólo para el cliente. Si faltan menos de `JOB_MIN_NOTICE_HOURS` para el inicio, el back responde
  `400` con el mensaje de anticipación.
- "Ver cambio" (`RescheduleReviewModal`) se muestra a quien **no** pidió el cambio
  (`rescheduleRequestedBy` distinto de mi rol), no siempre al profesional. Quien lo pidió ve "Esperando
  respuesta". Hay que ajustar los textos de `RequestsPage` que hoy dicen "esperá la respuesta del
  profesional".

**Tarjeta "Trabajo propuesto" en el chat (§5.7)**

15. Un mensaje con `type === "JOB_PROPOSAL"` no se dibuja como burbuja de texto sino como tarjeta, con
    los datos de `message.job`: título "Trabajo propuesto", etiqueta de estado (traducida del `status`),
    tareas, ubicación, monto y horario (`start`/`end`; si es `null` y está `PROPOSED`, "Horario a
    confirmar por el profesional"; si está `RESCHEDULE_REQUESTED`, mostrar también el horario pedido).
16. En la tarjeta, mientras `status === "PROPOSED"`: "Aceptar" y "Rechazar" a quien no propuso (mismas
    llamadas y mismo manejo del PIN que el punto 13), y "Cancelar propuesta" a quien propuso. En otro
    estado, sin botones (o "Ver trabajo", que lleva al detalle).
17. Al recibir `/user/queue/job-updates`, buscar en la conversación cargada la tarjeta con ese
    `job.id` y reemplazar su `job`. Si no está cargada (es de una página vieja), no hacer nada: al
    volver a pedirla, ya viene actualizada.
18. Después de aceptar, rechazar o cancelar desde la tarjeta, actualizarla con la respuesta del `POST`
    sin esperar al push.
19. En la bandeja, una propuesta se ve como "Trabajo propuesto" (es el `lastMessagePreview`).

---

## 8. Plan por fases

| Fase | Tareas | Entregable | Estimación |
|---|---|---|---|
| **1. Modelo y servicio del chat** | Entidades, repositorios, DTOs, mapper, `ChatContentConverter` (cifrado en reposo), `ChatServiceImpl` con todas las reglas (incluidos los rate limits), tests unitarios | Servicio probado sin HTTP | 2 a 2,5 días |
| **2. API REST del chat** | `POST /conversations`, `POST /job-requests/{id}/conversation`, `ConversationController`, excepciones, Swagger, tests de controller | Chat funcional "a recargar", usable desde Swagger | 1 día |
| **3. Propuestas y reagendar en los dos sentidos** | `proposedBy`, `proposedStart`/`End`, PIN al aceptar, crear con `clientId`, aceptar y rechazar por la contraparte, `rescheduleRequestedBy` (reagendar lo pide cualquiera, responde el otro), tests de servicio y controller, `ALTER` de `confirmation_pin_hash` | El profesional puede proponer y el cliente aceptar; cualquiera reagenda, desde Swagger | 2 días |
| **4. Tarjeta en el chat** | `ChatMessageType`, `ChatJobSummary`, eventos `JobProposed` y `JobStatusChanged`, `ChatJobListener` (crear la tarjeta en la misma transacción), `job` en la página de mensajes, tests | Cada propuesta aparece en el chat con su estado y horario, desde Swagger | 1 día |
| **5. Bloqueo, filtros, mails y tareas** | Bloquear/desbloquear, `canWrite`, `ChatContentFilter` (PIN y contacto), `ChatMessageCleanup`, `ChatMailNotifier` y mails de cambios del trabajo, variables, tests | Reglas de seguridad y avisos completos, desde Swagger y Mailpit | 2,5 días |
| **6. Tiempo real** | `WebSocketConfig`, `/ws` en `SecurityConfig`, endurecer `JwtChannelInterceptor`, eventos + push después del commit (mensajes y `job-updates`), cierre de sesiones al revocar, tests | Push en vivo, probado con un cliente STOMP de consola | 2 días |
| **7. Deploy a dev** | Variables, `.env.example`, backup, `ALTER` en dev, deploy, verificar el `101` en `/ws/chat`, probar con dos navegadores | Funcionando en `dev.oficiosya.duckdns.org` | 0,5 día |
| **8. Integración con el front** | Acompañar la integración, ajustar el contrato, E2E de Playwright con dos contextos | Feature completa en `dev` | 1,5 a 2,5 días (en paralelo con el front) |
| **9. Release** | Backup de la DB de release, `ALTER` en release, merge `dev → main`, smoke test en producción | En producción | 0,5 día |

Las fases 1 a 5 no bloquean al front: con el contrato de §7 se puede empezar la UI mockeando
las respuestas, como ya se hace en los tests de Playwright. La fase 3 depende de la 1 sólo por
`ConversationRepository.findBetween` (para exigir la conversación previa), la 4 de la 1 y la 3, y la 5 de la 3 y la 4.

---

## 9. Decisiones tomadas y pendientes

### Decididas (ya reflejadas en el plan)

| # | Tema | Decisión | Dónde |
|---|---|---|---|
| 1 | PIN en el chat | Se **rechaza** (`400`) un mensaje con el PIN de un trabajo activo del par, y hay un aviso fijo en el chat | §5.8, §7 |
| 2 | Cambios del trabajo en el chat | **Sólo la tarjeta** "Trabajo propuesto", que se actualiza en el lugar; no se agregan líneas por cada cambio. El aviso de cambios llega por mail. | §5.7, §5.9 |
| 3 | "Visto" | **No hay visto.** El "leído" se guarda sólo para el conteo de no leídos. | §4, §5.2, §5.3 |
| 4 | Retención | `CHAT_MESSAGE_RETENTION_DAYS` (`-1` = no se borran), contado desde la fecha de cada mensaje. Si se borra una cuenta (cuando exista), se borran sus conversaciones. | §5.9, §6 |
| 5 | Horario | Al crear, igual que antes. Una vez `ACCEPTED`, **cualquiera de los dos pide reagendar** con `JOB_MIN_NOTICE_HOURS` de anticipación, y responde el otro. | §5.6, §7 |
| 6 | Contraoferta | No hay: se rechaza y se vuelve a proponer. | §5.6 |
| 7 | Spam | Rate limits y **botón de bloquear** (en el MVP). El bloqueo también impide proponer trabajos. | §5.2, §5.8 |
| 8 | Mails | En el MVP: "Tenés mensajes sin leer" (como mucho uno cada `CHAT_UNREAD_MAIL_INTERVAL_HOURS` por conversación) y mails a las dos partes en cada cambio del trabajo. | §5.9 |
| 9 | Datos de contacto | Se rechazan teléfonos y mails mientras el par no tenga un trabajo `ACCEPTED`, `RESCHEDULE_REQUESTED` o `COMPLETED`. | §5.8 |
| 10 | Propuestas viejas | **No vencen**: quedan `PROPOSED` hasta que se respondan o cancelen. Una con horario ya pasado no se puede aceptar. | §4 |

### Pendientes (no bloquean el MVP)

- **Admin leyendo conversaciones.** Se decidió que sí, pero **después del MVP**. Cuando se haga: un
  endpoint de admin aparte (`/api/v1/admin/conversations/…`), sólo lectura, con un registro de auditoría
  de qué admin leyó qué conversación y cuándo. No abrir los endpoints actuales.
- **Términos y condiciones.** Los mensajes son datos personales (Ley 18.331 de Uruguay). Se van a
  agregar más adelante a los términos de la página. Tienen que decir que el admin puede leer las
  conversaciones ante un reclamo y cuánto tiempo se guardan (`CHAT_MESSAGE_RETENTION_DAYS`). Conviene
  tenerlo antes de que el admin pueda leer.
- **Retención vs. reclamos.** Si `CHAT_MESSAGE_RETENTION_DAYS` es corto, la evidencia de un reclamo
  se puede borrar antes de que el admin la lea. Elegir el valor de release pensando en eso.
- **Reportar usuarios.** Queda fuera del MVP; hoy la salida es bloquear.
- **Arreglos por fuera de la plataforma.** Con el chat pueden acordar y pagar por fuera, salteando
  `paymentAmount`. El filtro de contacto lo dificulta antes del primer trabajo, no después.
