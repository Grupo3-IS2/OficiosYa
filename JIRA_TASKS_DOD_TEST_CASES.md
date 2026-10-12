# OficiosYa — Especificaciones Jira: DoD y casos de prueba

Documento base para copiar cada sección a su ticket. Las prioridades son sugeridas y deben ajustarse al backlog del equipo. Cada caso define el resultado esperado; no significa que la implementación ya lo cumpla.

## Reglas comunes de aceptación

- **Resultado verificable:** toda aserción debe poder observarse en UI, respuesta HTTP, base persistida o correo de Mailpit. No cerrar una tarea por inspección visual aislada.
- **Validación:** el frontend evita envíos inválidos y el backend vuelve a validar los datos recibidos directamente por API.
- **Seguridad:** endpoints privados requieren JWT válido y rol/propiedad correctos; endpoints públicos no filtran email, teléfono, PIN, datos de cliente ni identificadores internos que no correspondan.
- **Persistencia:** después de una operación exitosa, consultar nuevamente el recurso o recargar para verificar que el cambio quedó guardado.
- **Errores:** respuesta y mensaje coherentes, sin cambios parciales de estado. Registrar método, URL, status y body sanitizado en defectos.
- **Automatización:** Playwright pasa el grupo asociado; los tests `fixme`/`skip` tienen causa y seguimiento. No rebajar una aserción solamente para volver verde la suite.

## Convenciones del entorno de pruebas

- API base: `http://localhost:8080`; frontend: `http://localhost:5173`; Mailpit: `http://localhost:8025`.
- Registro y cambios de email usan códigos de Mailpit. Cuenta nueva: `POST /api/v1/auth/register-client` o `register-professional` → `202`; verificar con el código antes de usar la cuenta.
- Términos del código configurables: 6 dígitos, expiración 15 minutos, cinco intentos y cooldown 60 segundos por defecto. Tests de reenvío deben usar cooldown corto y documentado.
- Fixtures de email, nombre, zona e identificadores deben ser únicos. Para UI que no prueba servicios externos, mockear Google/mapas y las respuestas que no formen parte del caso.
- JWT de UI debe tener payload `exp` futuro válido para el frontend; no usar strings como `dummy-token`.

---

## SCRUM-9 — Registro de usuario

**Prioridad sugerida:** Alta.  
**Historia:** Como usuario, quiero registrarme como Cliente o Profesional para usar la plataforma según mi rol.

**Alcance**

- Alta Cliente y Profesional, términos, validaciones, correo de verificación y sesión posterior.
- Los datos específicos del Profesional incluyen teléfono y zona.
- Un email existente no debe poder generar una segunda cuenta ni revelar al solicitante si está registrado.
- La interfaz selecciona Cliente por defecto. La regla “no seleccionar rol” requiere confirmación de producto porque hoy no existe estado sin rol.

**Definition of Done**

- Campos requeridos, formato de email, teléfono, política de contraseña, confirmación y términos se validan antes de enviar.
- Cliente y Profesional inician el flujo con rol/datos correctos y respuesta pendiente `202` sin JWT ni cuenta activa.
- Código correcto crea la cuenta, devuelve sesión y permite el acceso correspondiente.
- Código incorrecto, vencido, usado por segunda vez o bloqueado no crea cuenta ni sesión.
- Email duplicado, incluidas variantes de capitalización, conserva respuesta genérica `202` y no envía un nuevo correo.
- Errores de validación son visibles por campo o formulario; el backend rechaza los mismos payloads inválidos.

**Casos de prueba**

**TC-09-01 — Alta Cliente correcta** — Tipo: UI/API. Precondición: email nuevo. Pasos: completar nombre, email, contraseña, confirmación y términos; enviar; extraer PIN de Mailpit; verificar. Esperado: primera respuesta `202` sin sesión; verificación `200`, rol `CLIENT`, token válido y acceso a `/api/v1/users/me`.

**TC-09-02 — Alta Profesional correcta** — Tipo: UI/API. Precondición: email nuevo. Pasos: elegir Profesional, ingresar teléfono válido y zona, enviar y verificar PIN. Esperado: rol `PROFESSIONAL`; teléfono/zona persistidos; sesión válida.

**TC-09-03 — Formulario vacío** — Tipo: UI. Enviar sin completar. Esperado: campos requeridos identificados por el navegador/UI; cero requests de registro.

**TC-09-04 — Email inválido** — Tipo: UI/API. Enviar `correo-invalido`. Esperado: error de formato; no se inicia registro ni llega email.

**TC-09-05 — Teléfono Profesional inválido** — Tipo: UI/API. Probar vacío, letras, menos de 9 dígitos y prefijo inválido. Esperado: mensaje específico; cero llamadas de registro desde UI y `400` en API.

**TC-09-06 — Contraseña/confirmación/términos** — Tipo: UI/API. Probar contraseña bajo política, confirmación distinta y términos no aceptados. Esperado: bloqueo y error; no se crea registro pendiente.

**TC-09-07 — Email duplicado** — Tipo: API. Verificar primera cuenta y volver a iniciar registro con igual email y con capitalización distinta. Esperado: respuesta genérica `202`, sin token ni segundo correo; login sigue correspondiendo a una única cuenta.

**TC-09-08 — Rol predeterminado** — Tipo: UI. Sin cambiar selector, completar formulario. Esperado actual: rol Cliente. Si el producto requiere selección explícita, cambiar requisito y UI; no afirmar rechazo hasta definirlo.

**TC-09-09 — Campos de cédula** — Tipo: producto/API. Confirmar primero si la cuenta debe recolectar cédula: los DTOs actuales no la incluyen. Si aplica, definir formato/unicidad y agregar UI, validación, persistencia y pruebas antes de aceptar la historia.

**Cobertura relacionada:** `tests/auth/auth-ui.spec.ts`, `tests/auth/registration-pin.spec.ts`, `tests/scrum/oficiosya.spec.ts`.

## SCRUM-10 — Inicio de sesión

**Prioridad sugerida:** Crítica.  
**Historia:** Como usuario registrado y verificado, quiero iniciar sesión para acceder a las funciones permitidas por mi rol.

**Definition of Done**

- Credenciales válidas de ambos roles establecen sesión, guardan JWT y usuario mínimo y muestran Home autenticado.
- Email se recorta y normaliza a minúsculas antes de autenticar.
- Credenciales erróneas no generan sesión; mensaje no revela si falló email o contraseña.
- El botón indica loading y bloquea doble envío.
- El token permite acceder a los endpoints autorizados del rol; token vencido/malformado se rechaza.

**Casos de prueba**

**TC-10-01 — Login Cliente** — Tipo: E2E. Registrar/verificar Cliente, iniciar desde UI. Esperado: redirección a Home, almacenamiento de token/rol `CLIENT`, consulta privada `200`.

**TC-10-02 — Login Profesional** — Tipo: E2E. Registrar/verificar Profesional, iniciar desde UI. Esperado: rol `PROFESSIONAL`, consulta `/api/v1/professionals/me` responde `200`.

**TC-10-03 — Normalización del email** — Tipo: UI/API. Probar mayúsculas y espacios al inicio/final. Esperado: mismo usuario autenticado y email de respuesta normalizado.

**TC-10-04 — Credenciales inválidas** — Tipo: UI/API. Probar usuario inexistente y contraseña incorrecta. Esperado: error visible/estándar, no se guardan token ni usuario.

**TC-10-05 — Formulario vacío/email inválido** — Tipo: UI. Intentar enviar vacío y con formato inválido. Esperado: validación nativa por campo y cero llamada al backend.

**TC-10-06 — Loading/doble envío** — Tipo: UI. Demorar la respuesta. Esperado: estado “Ingresando…”, botón deshabilitado y solo una petición.

**TC-10-07 — JWT inválido/vencido** — Tipo: API/UI. Usar JWT vencido y malformado en ruta protegida. Esperado: `401`, sesión limpiada y navegación a login según el origen del error.

**Cobertura relacionada:** `tests/auth/auth-ui.spec.ts`, `tests/auth/google.spec.ts`, `tests/scrum/oficiosya.spec.ts`.

## SCRUM-11 — Cierre de sesión

**Prioridad sugerida:** Crítica (seguridad).  
**Historia:** Como usuario autenticado, quiero cerrar la sesión para que otras personas no accedan a mi cuenta.

**Definition of Done**

- Cliente y Profesional pueden salir desde el menú.
- UI limpia token, usuario y perfil local y redirige al Home público.
- La UI informa logout al backend; JWT previamente válido queda revocado en rutas protegidas.
- Navegar atrás no expone pantalla privada; logout en una pestaña se refleja en las otras.
- Logout repetido sigue el contrato acordado (idempotente `200` o error documentado) y nunca reactiva el token.

**Casos de prueba**

**TC-11-01 — Logout Cliente** — Tipo: E2E/API. Iniciar sesión real, confirmar acceso privado `200`, salir desde menú y volver a usar ese JWT. Esperado: estado local limpio, Home público y endpoint protegido `401`.

**TC-11-02 — Logout Profesional** — Tipo: E2E/API. Repetir flujo Cliente para Profesional y `/professionals/me`.

**TC-11-03 — Navegación atrás** — Tipo: UI. Abrir perfil protegido, salir, browser-back. Esperado: no se muestra contenido privado; redirect/login y sin JWT.

**TC-11-04 — Múltiples pestañas** — Tipo: UI/API. Abrir dos pestañas autenticadas; salir en A e intentar usar/recargar B. Esperado: B detecta el evento de almacenamiento y redirige a login; API responde `401` al JWT revocado.

**TC-11-05 — Logout repetido** — Tipo: API. Logout dos veces con el mismo JWT y luego llamar ruta protegida. Esperado: status de repetición según contrato, token siempre rechazado.

**Estado conocido:** tests anteriores observaron limpieza local sin revocación remota y falta de sincronización cross-tab. No cerrar esta historia hasta corregir y pasar TC-11-01/04.

**Cobertura relacionada:** `tests/auth/session-logout.spec.ts`, `tests/scrum/oficiosya.spec.ts`.

## SCRUM-12 — Edición de perfil Cliente (alcance a confirmar)

**Prioridad sugerida:** Alta.  
**Supuesto:** la matriz actual no identifica SCRUM-12. Esta especificación interpreta el ticket como edición del perfil básico Cliente. Confirmar descripción original del ticket antes de copiar como compromiso final.

**Definition of Done**

- Usuario autenticado consulta y actualiza datos permitidos del propio perfil.
- Cambios exitosos se guardan y permanecen tras recarga.
- Email requiere contraseña actual y verificación del código enviado al nuevo correo.
- Contraseña requiere contraseña actual, política vigente y confirmación coincidente.
- Avatar valida tipo y tamaño; propiedad/rol se verifica en backend.

**Casos de prueba**

**TC-12-01 — Consultar perfil** — Tipo: API. Sin token `GET /api/v1/users/me` → `401`; Cliente válido → `200` con datos propios.

**TC-12-02 — Editar nombre** — Tipo: API/UI. `PATCH /api/v1/users/me` con nombre válido → `200`; consultar nuevamente y recargar UI conserva el valor.

**TC-12-03 — Email** — Tipo: API/E2E. `PUT /api/v1/users/me/email` con contraseña incorrecta → `400`; válida → `202`, email antiguo sigue vigente hasta código correcto; verificación → `200` y email nuevo sirve para login.

**TC-12-04 — Email conflictivo** — Tipo: API. Usar email de otro usuario; inicio o verificación rechaza con conflicto acordado (`409`) y no cambia cuenta.

**TC-12-05 — Contraseña** — Tipo: API/UI. Validar contraseña actual incorrecta, confirmación distinta, nueva igual a actual y cambio exitoso. Cada rechazo deja credenciales sin cambios.

**TC-12-06 — Foto de perfil** — Tipo: API/UI. Subir imagen permitida; probar vacío, texto renombrado a imagen y archivo superior al límite. Esperado: validación clara y persistencia solo para imagen válida.

**TC-12-07 — Seguridad** — Tipo: API. Token de otro rol o usuario no puede modificar el perfil de esta cuenta; anónimo recibe `401`.

**Cobertura relacionada:** `tests/scrum/oficiosya.spec.ts`, `tests/auth/email-change.spec.ts`.

## SCRUM-13 — Creación/publicación de perfil Profesional

**Prioridad sugerida:** Alta.  
**Historia:** Como Profesional, quiero completar perfil/oficios y publicarlo para aparecer ante clientes.

**Definition of Done**

- Perfil se crea con rol, teléfono y zona tras verificar registro.
- Para publicar se requiere descripción y al menos un oficio con tarifas válidas.
- Perfil publicado aparece en consulta/búsqueda pública; perfil no publicado permanece privado.
- Respuestas públicas no exponen contacto privado.

**Casos de prueba**

**TC-13-01 — Alta mínima** — Tipo: API/E2E. Registro Profesional, verificar código, consultar perfil propio. Esperado: rol, teléfono y zona correctos.

**TC-13-02 — Publicación incompleta** — Tipo: API. Intentar publicar sin descripción y/o sin oficio. Esperado: `400` con requisito faltante, perfil no público.

**TC-13-03 — Publicación válida** — Tipo: API. Añadir descripción y uno o más oficios; publicar. Esperado: `published=true`, `GET /professionals/{id}` y búsqueda incluyen perfil.

**TC-13-04 — Privacidad/publicación** — Tipo: API. Antes de publicar el perfil no aparece en búsqueda ni consulta pública (`404`); después sí, sin email/teléfono en body.

**TC-13-05 — Rol** — Tipo: API. Cliente intenta editar/publicar como Profesional. Esperado: denegación (`403`) o recurso no disponible según contrato del endpoint; nunca cambia datos.

**Cobertura relacionada:** `tests/auth/registration-pin.spec.ts`, `tests/professional/professional-profile.spec.ts`, `tests/scrum/oficiosya.spec.ts`.

## SCRUM-14 — Edición de perfil Profesional

**Prioridad sugerida:** Alta.  
**Historia:** Como Profesional, quiero mantener actualizados descripción, zona, oficios, precios y disponibilidad.

**Definition of Done**

- Solo el dueño edita el propio perfil.
- Descripción acepta 20–500 caracteres inclusive.
- Varios oficios se guardan individualmente; agregar/quitar uno no altera los demás.
- Tarifa mínima no supera máxima; negativas se rechazan. **Decisión requerida:** la implementación actual acepta `0` (`PositiveOrZero`), aunque la matriz vieja dice rechazarlo.
- Cambios de zona/precio se reflejan inmediatamente en perfil y búsqueda pública.
- Si un perfil publicado queda sin requisitos de publicación, no se presenta como disponible.

**Casos de prueba**

**TC-14-01 — Límites de descripción** — Tipo: API/UI. Longitudes 19 y 501 → `400`; 20 y 500 → `200`, verificando persistencia.

**TC-14-02 — Tarifas** — Tipo: API. `0` mínimo/máximo permitido según regla actual; valores negativos → `400`; mínimo > máximo → `400`.

**TC-14-03 — Múltiples oficios** — Tipo: API/UI. Agregar dos trades, consultar perfil y comprobar ambas tarifas por trade.

**TC-14-04 — Quitar oficio** — Tipo: API. Borrar uno de dos; perfil/búsqueda ya no lo devuelven, el otro sigue presente.

**TC-14-05 — Cambio visible** — Tipo: E2E. Cambiar zona y luego tarifa; búsqueda con valores anteriores excluye y con valores nuevos incluye el perfil inmediatamente.

**TC-14-06 — Permisos** — Tipo: API. Segundo Profesional y Cliente no pueden cambiar datos/oficios ajenos.

**Cobertura relacionada:** `tests/professional/professional-profile.spec.ts`, `tests/scrum/oficiosya.spec.ts`.

## SCRUM-15 — Perfil público del Profesional

**Prioridad sugerida:** Alta.  
**Historia:** Como visitante/Cliente, quiero inspeccionar el perfil para decidir si contratar al Profesional.

**Definition of Done**

- Perfil publicado muestra nombre, imagen o fallback, descripción, zona, servicios/precios y calificación o estado vacío.
- La API pública no expone email, teléfono, PIN, identificadores ni datos de cliente/reserva privados.
- Perfil inexistente/no publicado muestra `404` y la UI presenta error recuperable.
- La UI muestra estado de carga sin contenido parcial engañoso.

**Casos de prueba**

**TC-15-01 — Perfil completo** — Tipo: UI/API. Abrir URL pública y validar todos los campos presentes.

**TC-15-02 — Imagen/calificación opcionales** — Tipo: UI. Con valores presentes renderizar imagen/rating; con `null`, avatar fallback y mensajes de ausencia.

**TC-15-03 — Privacidad** — Tipo: API/UI. Buscar email/teléfono del fixture en respuesta y DOM; no deben estar presentes.

**TC-15-04 — Perfil no encontrado/no publicado** — Tipo: API/UI. UUID inexistente y Profesional no publicado; API `404`, texto de “perfil no encontrado”, acción de regreso visible.

**TC-15-05 — Estados async** — Tipo: UI. Retrasar respuesta muestra loading; `500` muestra error, no datos parciales, y permite volver.

**Cobertura relacionada:** `tests/scrum/oficiosya.spec.ts`.

## SCRUM-16 — Agenda y disponibilidad

**Prioridad sugerida:** Alta.  
**Historia:** Como Cliente/visitante, quiero consultar disponibilidad; como Profesional, quiero gestionar bloques y reservas.

**Definition of Done**

- Dueño crea, actualiza y elimina bloques permitidos; intervalos son válidos, no solapados y `start < end`.
- Visitante consulta agenda pública por `professionalId` y rango `from/to`; offsets se comparan como instantes.
- `SCHEDULED_JOB` se crea al aceptar una solicitud, no manualmente.
- Visitante recibe datos anonimizados (`jobRequestId` nulo y sin identidad/contacto/PIN/monto/localización del Cliente); propietario autorizado puede administrar usando el flujo del trabajo.
- Cancelar trabajo aceptado libera el bloque.

**Casos de prueba**

**TC-16-01 — Crear disponibilidad** — Tipo: API. Dueño crea `URGENT_AVAILABLE` y `USER_RESERVED`; anónimo no puede crear/editar/borrar.

**TC-16-02 — Filtrar rango/timezone** — Tipo: API. Crear bloques dentro/fuera del rango con distintos offsets; solicitar `from/to`; solo retornan solapamientos correctos y timestamps equivalen al instante esperado.

**TC-16-03 — Solapamiento/inversión** — Tipo: API. Inicio >= fin, solapamiento y tipo `SCHEDULED_JOB` manual se rechazan con status acordado.

**TC-16-04 — Propiedad** — Tipo: API. Otro Profesional no puede editar/borrar; dueño sí puede parchear parcialmente y borrar.

**TC-16-05 — Reserva privada** — Tipo: API. Cliente crea trabajo, Profesional acepta con fecha; visitante ve bloque sin datos del job, dueño ve `jobRequestId`; cancelación libera agenda.

**Cobertura relacionada:** `tests/professional/schedules.spec.ts`.

## SCRUM-17 — Categorías de la Home

**Prioridad sugerida:** Media.  
**Historia:** Como Cliente, quiero elegir una categoría para reducir los perfiles a los oficios que busco.

**Definition of Done**

- Cada tarjeta está ligada al `tradeId` correcto.
- Selección se refleja visualmente/semánticamente (`aria-pressed`); repetir click la quita.
- El filtro incluye solo perfiles con ese oficio; la selección no confunde nombre de categoría y servicio ofrecido.
- Categoría sin perfiles muestra estado vacío y acción que recupera lista.

**Casos de prueba**

**TC-17-01 — Correspondencia oficio/categoría** — Tipo: UI. Fixture multioficio + perfil de un solo trade; elegir Electricista/Plomería y comprobar la lista exacta.

**TC-17-02 — Alternar selección** — Tipo: UI. Elegir y deseleccionar; `aria-pressed`, título y cantidad vuelven al estado general.

**TC-17-03 — Categoría vacía** — Tipo: UI. Elegir trade sin perfil; mostrar empty state; deseleccionar restaura perfiles.

**TC-17-04 — Carga/error catálogo** — Tipo: UI. Demorar o fallar `GET /trades`; mostrar loading/error y no renderizar tarjetas incorrectas.

**Cobertura relacionada:** `tests/scrum/oficiosya.spec.ts`, `tests/professional/professional-search.spec.ts`.

## SCRUM-18 — Búsqueda de Profesionales

**Prioridad sugerida:** Alta.  
**Historia:** Como Cliente, quiero buscar por nombre/oficio/zona/precio y obtener resultados pertinentes.

**Definition of Done**

- Solo perfiles publicados; filtros combinables por query, múltiples `tradeIds`, ubicación, precio y rating.
- Mínimos/máximos inclusivos; precio debe pertenecer al mismo oficio que satisface `tradeId`.
- Parámetros inválidos/rango invertido responden `400`; consulta válida sin resultados responde página vacía `200`.
- Paginación y orden estables, sin duplicados/pérdidas entre páginas.
- Cambios recientes de zona/precio se ven en la siguiente consulta.

**Casos de prueba**

**TC-18-01 — Filtros simples/combinados** — Tipo: API. Publicar fixtures únicos; buscar por nombre, zona, trade, precio y combinación; verificar IDs exactos.

**TC-18-02 — Límites de precio** — Tipo: API. Consultar en el precio exacto y justo fuera en ambos extremos.

**TC-18-03 — Varios trades/precio cruzado** — Tipo: API. Un Profesional ofrece trades con precios disjuntos; múltiple trade incluye perfil; pedir tarifa alta con trade barato no lo incluye.

**TC-18-04 — Paginación/orden** — Tipo: API. Crear al menos 3 perfiles únicos; páginas no se solapan y `sort=name,asc` respeta orden.

**TC-18-05 — Parámetros y vacío** — Tipo: API. `tradeIds` no numérico, precio inválido y rango invertido → `400`; query/zona inexistente → `200` vacío.

**TC-18-06 — Solo publicados** — Tipo: API. Despublicar o no publicar fixture y verificar que no aparece.

**Cobertura relacionada:** `tests/professional/professional-search.spec.ts`, `tests/professional/professional-profile.spec.ts`, `tests/scrum/oficiosya.spec.ts`.

## SCRUM-19 — Filtros de Home

**Prioridad sugerida:** Media.  
**Historia:** Como Cliente, quiero combinar y limpiar filtros en Home sin resultados inconsistentes.

**Definition of Done**

- Filtros por categoría, zona, rango de precio y rating se aplican correctamente a los resultados.
- Los chips reflejan filtros activos y se pueden eliminar uno a uno.
- “Limpiar filtros” restaura resultados del contexto seleccionado; empty state tiene recuperación.
- Cambiar oficio limpia/normaliza precio anterior y no mezcla tarifas de distintos trades.

**Casos de prueba**

**TC-19-01 — Aplicar filtro** — Tipo: UI. Seleccionar categoría, completar zona/precio, aplicar; cards visibles satisfacen todos los filtros.

**TC-19-02 — Quitar chip** — Tipo: UI. Con varios filtros activos quitar uno; ese filtro desaparece, los restantes persisten.

**TC-19-03 — Limpiar desde empty state** — Tipo: UI. Aplicar zona imposible, comprobar vacío; limpiar y comprobar perfiles de la categoría original.

**TC-19-04 — Cambiar categoría** — Tipo: UI. Crear rangos disjuntos por oficio, aplicar rango a primero y seleccionar segundo; no conserva rango no válido y muestra solo el servicio coincidente.

**TC-19-05 — Modal y teclado** — Tipo: UI. Cerrar/aplicar/cancelar drawer; no quedan overlays interceptando acciones y navegación de teclado funciona.

**Cobertura relacionada:** `tests/professional/professional-search.spec.ts`, `tests/scrum/oficiosya.spec.ts`.

---

## Checklist para cerrar cada ticket

- [ ] DoD revisado con PO/QA; decisiones pendientes resueltas.
- [ ] Casos aprobados o defectos registrados con evidencia y severidad.
- [ ] Tests automatizados ligados al ticket y ejecución adjunta al PR/build.
- [ ] Verificación manual responsive/accesibilidad cuando el caso es UI.
- [ ] Permisos y exposición de datos comprobados cuando hay información privada.
- [ ] Sin errores nuevos de build/diagnósticos; documentación/API actualizada.
- [ ] Sin `fixme`/`skip` nuevos sin causa, responsable y criterio para reactivarlos.

## Decisiones de producto que bloquean aceptación

1. **SCRUM-12:** confirmar su título/alcance real; el documento lo propone como edición de perfil Cliente por falta de identificación en la matriz.
2. **Selector de rol:** hoy Cliente viene preseleccionado; decidir si eso satisface requisito o si hay que obligar una elección explícita.
3. **Cédula:** QA_TEST_PLAN la exige, pero DTO/UI actuales no la incluyen; definir si se agrega, si se valida/unifica, o si se retira del alcance.
4. **Tarifa cero:** el backend la acepta; decidir si un servicio gratuito es válido o cambiar regla a estrictamente positiva.
5. **Logout repetido:** acordar status idempotente y documentarlo; sí es obligatorio que el token revocado no acceda a rutas protegidas.
6. **Búsqueda por query:** verificar que la especificación indique si busca solo nombre o también descripción; existe una prueba legacy cuyo resultado por query+zona queda vacío aun con perfil publicado.
