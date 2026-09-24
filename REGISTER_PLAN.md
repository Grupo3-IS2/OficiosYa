# Plan de implementación: verificación de correo con PIN y acceso con Google

Rama de trabajo: `feat/email-verification-google-signin`.

## 1. Objetivo

1. **Registro con PIN**: al registrarse, el backend manda un PIN de 6 dígitos al correo y **la cuenta no se crea hasta que el usuario lo ingresa bien**.
2. **Google**: poder registrarse e iniciar sesión con una cuenta de Google, como alternativa al correo y contraseña.
3. **Vinculación opcional**: si el usuario ya tiene una cuenta con contraseña, **elige** si la vincula con Google o no. Nunca se vincula sola.

Fuera de alcance (queda como seguimiento, ver sección 9): recuperar contraseña, y usar el PIN al cambiar el correo desde el perfil.

## 2. Estado actual

### Ya hecho en la rama (sin commitear)

| Pieza | Archivo | Estado |
|---|---|---|
| Dependencia de mail | `pom.xml` (`spring-boot-starter-mail`) | Listo |
| Config SMTP y de códigos | `application.properties` (`app.mail.*`, `app.verification.*`) | Listo |
| Entidad y enum | `VerificationCode`, `VerificationPurpose` (`REGISTER`, `EMAIL_CHANGE`) | Listo, **hay que ajustar** (ver 3.1) |
| Repositorio | `VerificationCodeRepository` | Listo |
| Envío de correo | `EmailSenderService` / `EmailSenderServiceImpl` | Listo |
| Generar y verificar códigos | `EmailVerificationService` / `EmailVerificationServiceImpl` (HMAC-SHA256 + salt + pepper, expiración, intentos máximos, cooldown de reenvío) | Listo, **hay un bug** (ver 3.2) |
| Test unitario | `EmailVerificationServiceImplTest` | Listo |

### Cómo funciona hoy el registro

`POST /api/v1/auth/register-client` y `/register-professional` llaman a `ClientServiceImpl.createClient` / `ProfessionalServiceImpl.createProfessional`, que guardan el usuario al toque, y `AuthServiceImpl.register` devuelve un `LoginResponse` con el JWT. El frontend (`authService.register`) guarda ese token y listo. No se verifica que el correo sea del usuario.

## 3. Ajustes necesarios a lo que ya está hecho

### 3.1 El código guarda un `userId`, pero la cuenta todavía no existe

`VerificationCode.userId` es `nullable = false` y el comentario dice "la cuenta se crea antes de verificarla". Eso contradice lo que pediste (PIN **antes** de crear la cuenta). Cambios:

- `userId` pasa a `nullable = true` (solo lo usará `EMAIL_CHANGE`).
- Se agrega `payload` (`TEXT`, nullable): los datos del registro pendiente serializados a JSON (`accountType`, `name`, `passwordHash`, y `phoneNumber` / `workingLocation` si es profesional). Solo se usa con `REGISTER`.
- **La contraseña se guarda ya hasheada con Argon2**, nunca en texto plano. Se hashea en el paso 1, con el mismo `PasswordEncoder` que hoy.
- `EmailVerificationService.verifyCode` pasa a devolver un pequeño resultado `VerificationResult(UUID userId, String payload)` en vez de solo `UUID`. Se actualizan la interfaz, la implementación y el test.

Alternativa descartada: una tabla `pending_registrations` aparte. Es más tipada, pero obliga a mantener dos tablas y dos limpiezas para el mismo ciclo de vida.

### 3.2 Bug: el contador de intentos no se guarda

`verifyCode` es `@Transactional`. Cuando el código es incorrecto hace `attempts++`, `save(...)` y **lanza** `ResponseStatusException` (es `RuntimeException`), lo que hace **rollback** de la transacción. Resultado: el contador nunca sube y se puede probar los 1.000.000 de PINs sin que se bloquee. Lo mismo pasa con el `delete` del código expirado o agotado.

Arreglo: `@Transactional(noRollbackFor = ResponseStatusException.class)` en `verifyCode`. Los tests con mocks actuales no lo detectan, hace falta un test de integración (ver sección 7).

### 3.3 Cosas menores

- `app.verification.secret` tiene por defecto `change-me-in-prod`. Hacer que la app **no arranque** con ese valor si el perfil es de producción (o al menos loguear un `WARN` fuerte).
- Agregar un `@Scheduled` (con `@EnableScheduling` en `OficiosYa`) que borre los códigos vencidos, por ejemplo cada hora. Sin esto la tabla `verification_codes` crece con registros abandonados.

## 4. Parte A: registro con PIN

### 4.1 Nuevo flujo

```
Frontend                              Backend
   │  POST /auth/register-client        │
   │  (datos del formulario)  ────────▶ │ valida DTO (igual que hoy)
   │                                    │ ¿el correo ya existe? → misma respuesta, no manda nada
   │                                    │ hashea contraseña, guarda payload + código hasheado
   │  ◀──────── 202 {email, ...} ────── │ manda el PIN por correo
   │                                    │
   │  POST /auth/verify-email           │
   │  {email, code}           ────────▶ │ verifyCode(...)
   │                                    │ crea Client/Professional desde el payload
   │  ◀──────── 200 LoginResponse ───── │ genera JWT (login automático)
```

### 4.2 Endpoints (`AuthController`, todos públicos bajo `/api/v1/auth/**`)

| Método y ruta | Cambio | Entrada | Salida |
|---|---|---|---|
| `POST /register-client` | **Cambia**: ya no crea la cuenta | `ClientCreateRequest` | `202` + `PendingRegistrationResponse` |
| `POST /register-professional` | **Cambia**: ya no crea la cuenta | `ProfessionalCreateRequest` | `202` + `PendingRegistrationResponse` |
| `POST /verify-email` | Nuevo | `VerifyEmailRequest { email, code }` | `200` + `LoginResponse` |
| `POST /resend-code` | Nuevo | `ResendCodeRequest { email }` | `202` + `PendingRegistrationResponse` |

(No se llama `/verify` porque ese ya existe y valida el JWT.)

DTOs nuevos (en `dto/request` y `dto/response`, mensajes en español):

- `VerifyEmailRequest`: `email` (mismo normalizado a minúsculas que usa `LoginRequest`), `code` solo dígitos (`@Pattern("\\d+")`, máx. 10; el largo exacto lo define `app.verification.code-length`).
- `ResendCodeRequest`: `email`.
- `PendingRegistrationResponse`: `email`, `message`, `codeLength`, `expiresInSeconds`, `resendCooldownSeconds` (para que el frontend arme el campo y los contadores sin hardcodear valores).

### 4.3 Lógica en el backend

**`AuthServiceImpl`** (o un `RegistrationService` nuevo si `AuthServiceImpl` se hincha):

- `startRegistration(ClientCreateRequest)` / `startRegistration(ProfessionalCreateRequest)`:
  1. Si `userRepository.existsByEmail(email)`: **no** lanzar error ni mandar correo, y devolver la misma respuesta `202`. Así no se puede usar el formulario para averiguar qué correos están registrados (hoy el mensaje ya es genérico por esa misma razón; se mantiene el criterio). Se pidió, se probó y se **revirtió** avisar con un `409` "ya existe una cuenta": se decidió mantener este comportamiento, aunque quien ya tiene cuenta llega al paso del código y no le llega nada.
  2. Hashear la contraseña, armar el `payload` y llamar a `emailVerificationService.sendCode(email, REGISTER, null, payload)`. Se agrega el parámetro `payload` a `sendCode`.
  3. Si vuelve a registrarse con el mismo correo antes de verificar, `sendCode` ya reemplaza el pendiente (respetando el cooldown), así puede corregir un dato mal escrito.
- `verifyEmail(VerifyEmailRequest)`:
  1. `verifyCode(email, REGISTER, code)`.
  2. Deserializar el `payload` y crear la cuenta. Para no duplicar validaciones ni volver a hashear, en `ClientServiceImpl` y `ProfessionalServiceImpl` se extrae el paso de persistir a un método que recibe la contraseña **ya hasheada** (hoy `createClient`/`createProfessional` hacen `encode` y `save` juntos).
  3. Volver a chequear `existsByEmail` (otro pudo registrarse con ese correo mientras tanto). La constraint `unique` de `users.email` es la red de seguridad final; `GlobalExceptionHandler` ya traduce `DataIntegrityViolationException` a `409`.
  4. Devolver `LoginResponse` (reusar `loginResponseFor`).
- `resendCode(ResendCodeRequest)`: reusa el payload del código pendiente, genera uno nuevo y lo manda. Si no hay pendiente, responde igual `202` sin hacer nada (mismo criterio anti-enumeración). Para poder reenviar un código **vencido o agotado**, `verifyCode` ya no los borra (los limpia el job de la sección 3.3); se sigue rechazando igual.
- `verifyEmail` **no es `@Transactional`** a propósito: si lo fuera, el rollback por la excepción de un código malo desharía el contador de intentos que `verifyCode` acaba de guardar (el bug de 3.2 otra vez).

Todos los mensajes al usuario en español, como pide el README.

### 4.4 Seguridad

- PIN de 6 dígitos, 15 minutos de validez, 5 intentos, un solo uso, y guardado como HMAC con sal y pepper (ya implementado). Comparación en tiempo constante (ya implementado).
- Cooldown de reenvío de 60 s por correo (ya implementado). Como es por correo y no por IP, un atacante podría pedir códigos a muchos correos distintos y usar tu SMTP para spam. **Hecho** (`RequestRateLimiter`, en memoria, 10 pedidos por minuto por IP, configurable con `RATE_LIMIT_AUTH_PER_MINUTE`, compartido por `register-*`, `verify-email` y `resend-code`). La IP sale de `X-Real-IP`, que nginx pisa con `$remote_addr`. **No** se puede usar `X-Forwarded-For`: nginx le agrega la IP al final de lo que mande el cliente, y con `forward-headers-strategy=framework` Spring toma la *primera* entrada, que el cliente controla (se comprobó en vivo: rotándola se esquivaba el límite). El límite es por instancia; con más de una réplica haría falta un contador compartido.
- Los errores de `verify-email` no deben revelar si el correo existe: mismo `400` "Código incorrecto o vencido" para "no hay pendiente" y para "no coincide". **Hecho.**
- Limitación conocida: `register-*` con un correo ya registrado responde igual pero **no manda correo**, así que tarda menos que uno nuevo (unos cientos de ms de SMTP). Se ve con mediciones de tiempo; taparlo requeriría mandar el correo en segundo plano, y se perdería el `503` cuando el SMTP falla.

### 4.5 Infra y configuración

- `docker-compose.yml`: el servicio `app` **no pasa** ninguna variable `SMTP_*` ni `VERIFICATION_*` hoy. Agregar `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_AUTH`, `SMTP_STARTTLS`, `MAIL_FROM` y `VERIFICATION_SECRET` al bloque `environment` de `app`, leídas del `.env`.
- Agregar un servicio `mailpit` en el perfil `dev` (SMTP en `1025`, bandeja web en `8025`) para ver los PIN sin mandar correos reales. Con eso el default `SMTP_HOST=localhost:1025` de `application.properties` funciona en local.
- `.env.example`: documentar las variables nuevas. Para producción hace falta un SMTP real (Gmail con contraseña de aplicación, Brevo, Resend, etc.) con `SMTP_AUTH=true` y `SMTP_STARTTLS=true`, y un remitente (`MAIL_FROM`) de un dominio con SPF/DKIM configurado o los correos caen en spam.
- `README.md`: agregar una sección corta con las variables.

### 4.6 Frontend (`frontend/src/pages/Register/Register.tsx`)

La app usa ruteo manual por `window.location.pathname` en `App.tsx`, así que **no hace falta una ruta nueva**: el PIN es un segundo paso dentro de `Register`.

- Estado nuevo: `step: 'form' | 'verify'`.
- Al enviar el formulario, `register()` ahora devuelve `PendingRegistrationResponse` y **no** guarda token. Se pasa a `step = 'verify'`.
- Paso `verify`: campo de 6 dígitos (`inputMode="numeric"`, `autoComplete="one-time-code"`, `maxLength=6`), botón **Verificar**, botón **Reenviar código** deshabilitado con cuenta regresiva de `resendCooldownSeconds`, y link **Cambiar correo** que vuelve al formulario conservando los datos.
- Al verificar bien: se guardan `TOKEN_KEY` / `USER_KEY` (la misma lógica que hoy tiene `register`, extraída a un helper `storeSession(response)` que también usen `login` y Google) y se redirige como hoy.
- `authService.ts`: `register` (nuevo tipo de retorno), `verifyEmail`, `resendCode`. Tipos en `types/Auth.ts`. El paso vive en `VerifyEmailStep.tsx`, con `useCountdown.ts` y la lógica pura en `verificationCode.ts` (testeada en `frontend/tests/verificationCode.test.ts`).
- Si el usuario recarga la página en el paso del PIN pierde el formulario; no pasa nada grave: se registra de nuevo y el pendiente se reemplaza.

## 5. Parte B: Google

### 5.1 Elección técnica

Como el frontend es una SPA que ya usa **su propio JWT**, la opción más simple y limpia es **Google Identity Services**: el botón de Google en el navegador devuelve un **ID token** (`credential`) y el backend lo verifica y emite el JWT propio. No hace falta `spring-boot-starter-oauth2-client`, ni sesiones, ni redirects del lado del servidor, y no cambia `SecurityConfig` (`/api/v1/auth/**` ya es público).

### 5.2 Pasos previos fuera del código

1. Google Cloud Console → *APIs y servicios* → *Credenciales* → crear **ID de cliente de OAuth**, tipo **Aplicación web**.
2. *Orígenes autorizados de JavaScript*: `http://localhost:5173` y el dominio de producción (y el de dev si existe). No hace falta URI de redireccionamiento con este flujo.
3. Configurar la pantalla de consentimiento (nombre de la app, correo de contacto). Mientras esté en modo "Testing" solo pueden entrar los correos agregados como usuarios de prueba.
4. El **Client ID** no es un secreto. Va en:
   - backend: variable `GOOGLE_CLIENT_ID` (`app.google.client-id` en `application.properties`), pasada también en `docker-compose.yml`;
   - frontend: `VITE_GOOGLE_CLIENT_ID`. Ojo: la build de producción corre en el contenedor `frontend-build`, así que hay que pasarla en su `environment` en `docker-compose.yml`, si no queda vacía en el `dist`.

### 5.3 Cambios en la base de datos (`User`)

- `authProvider` (`LOCAL` | `GOOGLE`), con default `LOCAL`. Como `ddl-auto=update` agrega la columna sobre filas existentes, declararla con `columnDefinition = "varchar(20) default 'LOCAL'"` (o nullable) para que Postgres no falle con `NOT NULL` sobre datos viejos.
- `googleSubject` (`String`, `unique`, nullable): el claim `sub` de Google, que es el identificador estable (el correo puede cambiar). **Que sea distinto de `null` es lo que significa "cuenta vinculada con Google"**.
- `authProvider` dice cómo nació la cuenta y no cambia al vincular: una cuenta `LOCAL` que se vincula sigue siendo `LOCAL` (tiene contraseña real), una `GOOGLE` nunca la tuvo.
- `password` sigue siendo `NOT NULL`: para cuentas de Google se guarda el hash de un UUID aleatorio, igual que hace `AuthServiceImpl` con `dummyPasswordHash`. Nadie puede loguearse con esa contraseña.

### 5.4 Endpoints

| Método y ruta | Entrada | Comportamiento |
|---|---|---|
| `POST /api/v1/auth/google/login` | `{ credential }` | Solo entra a cuentas **ya vinculadas** con ese Google. Si no hay cuenta con ese correo: `404` "No encontramos una cuenta con ese correo, registrate primero". Si hay una cuenta con contraseña sin vincular: `409` "Ya existe una cuenta con este correo. Confirmá tu contraseña si querés vincularla con Google" (no vincula ni devuelve token). |
| `POST /api/v1/auth/google/link` | `{ credential, password }` | Es el "sí, vincular" del `409` anterior: verifica el token y la contraseña de la cuenta con ese correo, guarda `googleSubject` y devuelve `LoginResponse`. Contraseña incorrecta: `400` "Contraseña incorrecta". |
| `POST /api/v1/auth/google/register-client` | `{ credential }` | Crea un `Client`. |
| `POST /api/v1/auth/google/register-professional` | `{ credential, phoneNumber, workingLocation }` | Crea un `Professional`. |

Se mantienen `login` y `register` separados (igual que el flujo local) para no tener un estado intermedio "falta elegir tipo de cuenta": en `Register` el usuario ya elige cliente o profesional (y completa teléfono y ubicación) **antes** de apretar el botón de Google.

Y desde el perfil (requieren sesión, van en `UserController` junto a `/me/email` y `/me/password`):

| Método y ruta | Entrada | Comportamiento |
|---|---|---|
| `PUT /api/v1/users/me/google` | `{ credential, currentPassword }` | Vincula Google a la cuenta logueada. Pide la contraseña actual porque es un cambio de seguridad. El correo de Google **tiene que ser el de la cuenta** (igual que al vincular desde el login): `400` "Esa cuenta de Google usa otro correo…" si no coincide. Se probó y se descartó permitir otro correo: dejaba la cuenta atada a un Google que el perfil no dice cuál es, y ese Google no podía registrarse ni entrar por sí mismo. `400` también si ese Google ya está vinculado a otra cuenta o si ya hay uno vinculado. |
| `DELETE /api/v1/users/me/google` | `{ currentPassword }` | Desvincula. Solo cuentas con contraseña real (`authProvider == LOCAL`): una cuenta creada con Google se quedaría sin forma de entrar, así que responde `400` "Tu cuenta usa Google para iniciar sesión, no se puede desvincular". |

Los de `/auth/google/*` devuelven `LoginResponse`; los de `/users/me/google` devuelven `UserResponse` actualizado. Los cuatro de `/auth/google/*` comparten un límite por IP propio (`RequestRateLimiter`, bucket `google`).

### 5.5 Lógica (`GoogleAuthService` nuevo, interfaz + impl como el resto)

1. **Verificar el ID token.** Usar `GoogleIdTokenVerifier` de `com.google.api-client:google-api-client`: valida firma con las claves públicas de Google (las cachea), `iss` (acepta `accounts.google.com` y `https://accounts.google.com`), `aud == GOOGLE_CLIENT_ID` y `exp`. Si falla: `401` "No pudimos validar tu cuenta de Google".
2. Exigir `email_verified == true`; si no, `400`.
3. `login`: buscar por `googleSubject`; si existe, entra directo (aunque el correo de la cuenta sea otro). Si no, buscar por correo:
   - hay cuenta con contraseña **sin vincular** → `409`, no se toca nada. El usuario decide en el frontend (ver 5.7); si acepta, usa `link`;
   - hay cuenta con ese correo ya vinculada a **otro** `sub` → `400` genérico;
   - no hay cuenta → `404`.

   Si el usuario rechaza vincular, no queda ningún rastro: sigue entrando con su contraseña y el `409` volverá a aparecer si usa el botón de Google otra vez.
3b. `link`: verificar el token (pasos 1 y 2), buscar la cuenta por el correo del token, comprobar la contraseña con `passwordEncoder.matches` (si no hay cuenta se hace igual una comparación contra un hash falso, como hace `AuthServiceImpl.login`, para no revelar si el correo existe), verificar que ese `sub` no esté en otra cuenta, guardar `googleSubject` y devolver el JWT. Como es una prueba de contraseña sin sesión, le aplica el mismo límite por IP que `register-*` (4.4).
4. `register-*`: si ya existe cuenta (por `googleSubject` o correo) → `400` con mensaje genérico (no se vincula desde acá: quien tiene cuenta usa `login`); si no, crear el usuario con `authProvider = GOOGLE`, `name` del claim `name`, correo del claim `email`. El nombre de Google **no** pasa por `@FullName` (puede venir de una sola palabra); si falta, usar la parte local del correo. No pide PIN: Google ya verificó el correo.
5. Generar el JWT con `jwtService.generateToken(user)` y devolver `LoginResponse` (mismo camino que `loginResponseFor`).

> **Implementado tal cual, con estos detalles:** la verificación del token va detrás de la interfaz `GoogleTokenVerifier` (impl `GoogleTokenVerifierImpl`, que envuelve `GoogleIdTokenVerifier` 2.9.1); sin `GOOGLE_CLIENT_ID` la app arranca igual, con un `WARN`, y los endpoints de Google responden `503`. La cuenta vinculada con otro Google responde `400`; el `409` es solo para "cuenta con contraseña sin vincular". `UserResponse` (y por herencia `ProfessionalResponse`) ya trae `hasPassword` y `googleLinked`. El `StoredUser` del frontend todavía no.

### 5.6 Cuentas de Google y las pantallas de perfil

`UserServiceImpl.changeEmail` y `changePassword` piden la contraseña actual, y un usuario creado con Google no la tiene. Para esta entrega: si `authProvider == GOOGLE`, esos endpoints responden `400` "Tu cuenta usa Google, no tiene contraseña", y `SecuritySection.tsx` oculta esas opciones para esos usuarios. Poder "crear una contraseña" queda como seguimiento.

Para eso `UserResponse` y `StoredUser` exponen dos campos nuevos: `hasPassword` (`authProvider == LOCAL`) y `googleLinked` (`googleSubject != null`). El resto de las cuentas (las locales, vinculadas o no) no cambian su comportamiento.

### 5.7 Frontend

- Cargar `https://accounts.google.com/gsi/client` (script async) desde un componente `GoogleButton` nuevo en `components/GoogleButton/`. Llama a `google.accounts.id.initialize({ client_id, callback })` y `renderButton(...)`. Recibe una prop `onCredential(credential)`.
- `Login.tsx`: `GoogleButton` bajo el formulario, con separador "o". El callback llama `authService.googleLogin(credential)`. Si la respuesta es `ApiError` con `status === 409`, se abre un cuadro (mismo estilo que `UnsavedChangesModal`): *"Ya tenés una cuenta con este correo. ¿Querés vincularla con Google para poder entrar con un solo click?"*, con campo de contraseña y dos botones, **Vincular y entrar** (llama `googleLink(credential, password)`) y **No, gracias** (cierra el cuadro, no manda nada). El `credential` se guarda en estado mientras el cuadro está abierto (dura ~1 hora, alcanza).
- `Register.tsx`: `GoogleButton` en el paso `form`. El callback llama `googleRegister(credential, accountType, profile)`. Si el usuario eligió profesional y falta teléfono o ubicación, mostrar el error del formulario en vez de llamar al backend.
- `SecuritySection.tsx`: bloque **Cuenta de Google** debajo del cambio de contraseña. Sin vincular (`googleLinked=false`): texto *"Podés vincular tu cuenta con Google para entrar más rápido"* y `GoogleButton` + campo de contraseña actual → `PUT /users/me/google`. Vinculada: *"Vinculada"* y botón **Desvincular** (pide contraseña actual → `DELETE /users/me/google`). Para cuentas creadas con Google (`hasPassword=false`) no se muestra nada de esto ni el cambio de contraseña. Este bloque tiene que respetar el guardado de `useProfileEditor` / `UnsavedChangesModal`: son acciones inmediatas, no parte del formulario del perfil.
- `authService.ts`: `googleLogin`, `googleRegister`, `googleLink`; `userService.ts`: `linkGoogle`, `unlinkGoogle`. Los de `/auth/google/*` reusan el helper `storeSession`.
- Si no hay `VITE_GOOGLE_CLIENT_ID`, no renderizar el botón (así la app sigue funcionando sin Google configurado).

> **Implementado con estas diferencias respecto de lo escrito arriba:** `hasPassword` y `googleLinked` no van en `StoredUser` (`localStorage`): `useProfileEditor` los toma de `GET /users/me` cada vez que se abre el perfil, y la sección de Google no se muestra hasta que llegan (si no, aparecería un instante en el estado equivocado). El bloque de Google es su propio componente, `GoogleAccountSection`, y no parte de `SecuritySection`. En cuentas creadas con Google el correo queda de solo lectura y se oculta el cambio de contraseña.
>
> **Google Cloud:** para desarrollo local hay que autorizar **los dos** orígenes, `http://localhost` y `http://localhost:5173`. Con un origen no autorizado el botón no aparece y el único aviso es en la consola del navegador (*"The given origin is not allowed for the given client ID"*): el error queda dentro del iframe de Google y `GoogleButton` no lo puede detectar. Los cambios en Google pueden tardar unos minutos en aplicarse.

## 6. Orden de implementación

Cada fase deja la app funcionando y se puede commitear sola.

| # | Fase | Contenido |
|---|---|---|
| 1 | Arreglos de base | 3.1, 3.2 y 3.3; actualizar `EmailVerificationServiceImplTest`. **Hecha** (sin commitear) |
| 2 | Infra local | Variables en `docker-compose.yml`, servicio `mailpit`, `.env.example`, README | **Hecha** (sin commitear) |
| 3 | Backend registro con PIN | DTOs, `startRegistration`, `verifyEmail`, `resendCode`, refactor de creación en `ClientServiceImpl` / `ProfessionalServiceImpl`, endpoints, límite por IP. **Hecha** (sin commitear); el frontend queda roto hasta la fase 4 |
| 4 | Frontend registro con PIN | `authService`, tipos, paso `verify` en `Register.tsx`. **Hecha** (sin commitear) |
| 5 | Backend Google | Credenciales, columnas en `User`, dependencia, `GoogleAuthService` (`login`, `link`, `register-*`), endpoints `/auth/google/*` y `/users/me/google`, bloqueo en `changeEmail` / `changePassword`, campos `hasPassword` / `googleLinked` **Hecha** (sin commitear) |
| 6 | Frontend Google | `GoogleButton`, `Login.tsx` (con el cuadro de vincular), `Register.tsx`, bloque de Google en `SecuritySection.tsx` **Hecha** (sin commitear) |
| 7 | Pruebas y documentación | Sección 7 y actualizar `QA_TEST_PLAN.md` **Hecha** (sin commitear) |

Las fases 5 y 6 no dependen de 3 y 4: si hace falta, Google se puede hacer en paralelo por otra persona.

## 7. Pruebas

### Backend (JUnit + Mockito, como el test existente)

- `EmailVerificationServiceImplTest`: agregar el caso de `payload` en `sendCode` y en el resultado de `verifyCode`.
- `EmailVerificationTransactionTest` (**hecho**): corre `verifyCode` detrás del proxy transaccional real con un `PlatformTransactionManager` mockeado y comprueba que un código incorrecto o vencido termina en `commit` y no en `rollback`. Falla si se quita `noRollbackFor`. Lo que sigue sin cubrirse es la persistencia real contra una base; queda para cuando exista un test con base (H2 o Testcontainers).
- `AuthServiceImplTest` nuevo:
  - registro con correo nuevo → no crea usuario, guarda el pendiente, se manda el correo;
  - registro con correo existente → misma respuesta, no manda correo;
  - `verifyEmail` correcto → crea `Client` o `Professional` según el payload y devuelve JWT;
  - `verifyEmail` con código malo / vencido / sin pendiente → `400`, sin usuario creado;
  - `verifyEmail` cuando el correo se registró en el medio → no duplica.
- `GoogleAuthServiceImplTest` con el verificador mockeado: token inválido, `email_verified=false`, login sin cuenta (`404`), login con cuenta local sin vincular (`409` y **`googleSubject` sigue en `null`**), login con cuenta vinculada, `link` con contraseña correcta / incorrecta / correo inexistente, `link` con un `sub` que ya está en otra cuenta, vincular y desvincular desde el perfil (incluido el `400` al desvincular una cuenta creada con Google), registro cliente y profesional, registro con cuenta existente.

### Frontend

- Tests con `node --test` (como `professionalFilters.test.ts`) para la lógica pura: la cuenta regresiva del reenvío y el helper de validación del PIN.

### E2E (`test/tests/oficiosya.spec.ts`, Playwright)

Los tests de registro actuales esperan quedar logueados al enviar el formulario, van a fallar. Actualizarlos: enviar formulario → leer el PIN de la API de Mailpit (`http://localhost:8025/api/v1/messages`) → ingresarlo → quedar logueado. Agregar casos de PIN incorrecto y reenvío. El botón de Google no se automatiza (requiere una sesión real de Google); se prueba a mano.

> **Hecho:** `test/tests/support/registration.ts` completa el registro leyendo el código de Mailpit, y `registerClient` / `registerProfessional` del spec grande hacen los dos pasos, así que los ~60 casos que solo necesitan una cuenta siguen igual. Casos nuevos en `registro-pin.spec.ts` (API y UI) y `google.spec.ts` (API, y UI con el script de Google y la API simulados). CI: `playwright.yml` levanta `mailpit`, sube `RATE_LIMIT_AUTH_PER_MINUTE` y baja `VERIFICATION_RESEND_COOLDOWN_SECONDS` a 3. Los dos casos de reenvío se saltan con un aviso si el cooldown es largo. Suite completa: 110 pasan, 5 `fixme` que ya estaban. Los `test.fixme` de "email duplicado con distinta capitalización" pasaron a ser un caso normal (con el registro en dos pasos el email se normaliza y ya se trata como el mismo). El plan de QA (`QA_TEST_PLAN.md`) suma las secciones 4.1.1 (verificación) y 4.1.2 (Google).

### Manual

1. Registrarse como cliente y como profesional: llega el correo, el PIN entra, se crea la cuenta.
2. Confirmar en la base que **no** existe el usuario antes de ingresar el PIN.
3. PIN incorrecto 5 veces → se bloquea y pide uno nuevo.
4. PIN vencido (bajar `VERIFICATION_EXPIRATION_MINUTES` a 1 para probar).
5. Reenviar antes de 60 s → mensaje de espera.
6. Google: alta como cliente, alta como profesional, login, login sin cuenta previa (404 amigable).
7. Cuenta local + botón de Google en el login: aparece el cuadro de vincular. **No, gracias** → no pasa nada y se puede entrar con contraseña; repetir y elegir **Vincular y entrar** con contraseña mala (error) y luego buena (entra); cerrar sesión y volver a entrar con Google directo.
8. Desde el perfil: vincular, desvincular, y verificar que una cuenta creada con Google no ve el cambio de contraseña ni el botón de desvincular.

## 8. Riesgos y decisiones abiertas

| Tema | Decisión propuesta |
|---|---|
| Cambio de contrato de `register-*` (ya no devuelven token) | Rompe a cualquier cliente que dependa del token inmediato. Hoy solo lo usa este frontend, así que se actualiza todo en el mismo PR. |
| Cuentas creadas antes de esta funcionalidad | Quedan como están (se consideran verificadas). No hay columna `emailVerified`; todo usuario que existe en `users` es verificado por construcción. |
| Vincular Google a una cuenta local existente | **Nunca automático**: el usuario elige (cuadro en el login o bloque en el perfil) y siempre confirma con su contraseña. Esto también evita que alguien con un Google del mismo correo tome una cuenta vieja sin verificar. |
| Proveedor SMTP en producción | Falta decidir cuál usar y el dominio remitente. Sin eso no se puede probar el envío real. |
| Google en modo "Testing" | Solo entran correos agregados como usuarios de prueba hasta publicar la app en Google Cloud. |
| Foto de perfil de Google (`picture`) | No se usa por ahora; el almacenamiento de imágenes es local (`ProfileImageStorage`). |

## 9. Seguimiento (no incluido acá)

- **Cambio de correo con PIN**: `VerificationPurpose.EMAIL_CHANGE` y la infraestructura ya soportan el flujo. Falta cambiar `UserServiceImpl.changeEmail` para que guarde el correo nuevo pendiente, mande el PIN y solo cuando se confirme haga `user.setEmail(...)`.
- **Recuperar contraseña** con el mismo mecanismo (nuevo `VerificationPurpose.PASSWORD_RESET`).
- **Crear contraseña** para cuentas de Google.
