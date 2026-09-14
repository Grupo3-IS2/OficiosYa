# Plan de pruebas QA - OficiosYa

## 1. Alcance

Este documento consolida la batería completa de pruebas para validar que la aplicación cumple con el Definition of Done y los casos de prueba del documento de requisitos.

Se cubren los siguientes flujos:
- Registro de usuario
- Login
- Logout
- Editar perfil
- Perfil profesional
- Validaciones de formato, seguridad y errores

## 2. Estado actual verificado del proyecto

Se verificó la rama `dev` del repositorio y la aplicación frontend actual.

### Evidencia funcional revisada
- [frontend/src/App.tsx](frontend/src/App.tsx): existen rutas para login, registro y edición de perfil.
- [frontend/src/pages/LogIn/Login.tsx](frontend/src/pages/LogIn/Login.tsx): pantalla de login con mostrar/ocultar contraseña y manejo de errores.
- [frontend/src/pages/Register/Register.tsx](frontend/src/pages/Register/Register.tsx): pantalla de registro con selección de tipo de cuenta.
- [frontend/src/pages/EditProfile/EditProfilePage.tsx](frontend/src/pages/EditProfile/EditProfilePage.tsx): pantalla de edición de perfil.
- [frontend/src/services/authService.ts](frontend/src/services/authService.ts): servicios de autenticación y almacenamiento local.

### Estado general
- Frontend: presente y compilando.
- Backend: implementado parcialmente con autenticación y endpoints.
- Revisión: no se puede afirmar que todo el DoD está completamente validado sin ejecutar la app y probar casos reales en entorno funcional.

## 3. Criterios de aceptación globales

Se aceptará la historia si se cumplen estos criterios:
- El sistema permite elegir rol Cliente o Profesional antes o durante el registro.
- Los formularios validan campos obligatorios y mensajes individuales por campo.
- Los formatos cumplen validación real de email, celular, contraseña, nombre y cédula.
- No se permiten duplicados de email o cédula.
- El usuario puede iniciar sesión de inmediato tras registrarse.
- La sesión se invalida correctamente al cerrar sesión.
- El perfil puede editarse y persistir cambios.
- El perfil profesional cumple validaciones y muestra estado publicado/disponible.
- El acceso está restringido por rol.

## 4. Matriz de pruebas

### 4.1 Registro

| ID | Caso de prueba | Precondición | Pasos | Resultado esperado | Estado actual |
| --- | --- | --- | --- | --- | --- |
| REG-01 | Registro exitoso Cliente | Email y cédula inexistentes | 1. Ir a registro 2. Elegir Cliente 3. Completar campos válidos 4. Crear cuenta | La cuenta se crea, muestra confirmación y redirige al flujo del cliente | Parcial |
| REG-02 | Registro exitoso Profesional | Email y cédula inexistentes | 1. Ir a registro 2. Elegir Profesional 3. Completar campos válidos 4. Crear cuenta | La cuenta se crea con rol Profesional, confirma y permite continuar | Parcial |
| REG-03 | Registro sin seleccionar tipo de usuario | Usuario en formulario | 1. Completar todos los campos 2. No elegir rol 3. Enviar | El sistema rechaza el formulario y muestra advertencia | Parcial |
| REG-04 | Formulario con campos vacíos | Usuario en registro | 1. Elegir rol 2. Dejar campos vacíos 3. Enviar | No se envía la solicitud, se muestran errores por campo | Parcial |
| REG-05 | Cédula inválida | Usuario en registro | 1. Completar formulario 2. Ingresar cédula inválida 3. Enviar | Se marca error y se bloquea registro | No implementado |
| REG-06 | Email inválido | Usuario en registro | 1. Completar formulario 2. Ingresar email mal formado 3. Enviar | Se muestra error individual de email | Parcial |
| REG-07 | Celular inválido | Usuario en registro | 1. Completar formulario 2. Ingresar teléfono con letras o muy corto 3. Enviar | Se muestra error de formato de teléfono | Parcial |
| REG-08 | Contraseña insuficiente | Usuario en registro | 1. Probar contraseñas menos de 8, sin mayúscula, sin minúscula, sin número, sin símbolo | La app rechaza la clave y muestra requisitos faltantes | Parcial |
| REG-09 | Contraseña con fortaleza visual | Usuario en registro | 1. Escribir contraseña 2. Observar indicador visual | El sistema muestra fortaleza real en tiempo real | No implementado |
| REG-10 | Email duplicado | Cuenta existente | 1. Registrar email ya usado 2. Enviar | El sistema rechaza y muestra error de duplicado | Parcial |
| REG-11 | Cédula duplicada | Cuenta existente | 1. Registrar otra cuenta con la misma cédula 2. Enviar | El sistema rechaza con mensaje de duplicado | No implementado |
| REG-12 | Registro exitoso con inicio inmediato | Cuenta nueva | 1. Completar registro correcto 2. Confirmar usuario autenticado | El sistema redirige al login o al panel principal y permite acceso | Parcial |

### 4.2 Login

| ID | Caso de prueba | Precondición | Pasos | Resultado esperado | Estado actual |
| --- | --- | --- | --- | --- | --- |
| LOG-01 | Login exitoso Cliente | Existe cuenta de cliente | 1. Ir a login 2. Ingresar email/clave válidos 3. Enviar | El usuario entra a la app y se muestra la pantalla principal del cliente | Parcial |
| LOG-02 | Login exitoso Profesional | Existe cuenta de profesional | 1. Ir a login 2. Ingresar credenciales válidas 3. Enviar | El usuario entra con rol profesional | Parcial |
| LOG-03 | Contraseña incorrecta | Cuenta existente | 1. Ingresar correo válido 2. Contraseña incorrecta 3. Enviar | Se muestra mensaje de error claro | Parcial |
| LOG-04 | Correo no registrado | Usuario sin cuenta | 1. Ingresar correo inexistente 2. Contraseña válida 3. Enviar | Se muestra error de usuario no encontrado | Parcial |
| LOG-05 | Formulario vacío | Usuario en login | 1. Dejar email y contraseña vacíos 2. Intentar enviar | El sistema no envía la request y muestra validación | Parcial |
| LOG-06 | Email con formato inválido | Usuario en login | 1. Ingresar email mal escrito 2. Enviar | Error de formato o validación | Parcial |
| LOG-07 | Correo con espacios extra | Usuario en login | 1. Escribir ` correo@ejemplo.com ` 2. Ingresar clave válida | La app limpia espacios y permite entrar | No implementado |
| LOG-08 | Mostrar / ocultar contraseña | Usuario en login | 1. Escribir contraseña 2. Activar icono del ojo 3. Repetir | La contraseña se vuelve visible y luego oculta | Implementado |
| LOG-09 | Botón deshabilitado durante carga | Login en curso | 1. Simular demora de red 2. Presionar iniciar sesión | El botón se deshabilita para evitar doble clic | Parcial |

### 4.3 Logout

| ID | Caso de prueba | Precondición | Pasos | Resultado esperado | Estado actual |
| --- | --- | --- | --- | --- | --- |
| OUT-01 | Cerrar sesión Cliente | Usuario autenticado | 1. Abrir perfil 2. Presionar Cerrar sesión | Se cierra la sesión y redirige a login | Parcial |
| OUT-02 | Cerrar sesión Profesional | Usuario autenticado | 1. Abrir perfil 2. Presionar Cerrar sesión | Se cierra la sesión y redirige a login | Parcial |
| OUT-03 | Navegación atrás después de cerrar sesión | Sesión cerrada | 1. Cerrar sesión 2. Presionar atrás | No se puede volver a contenido protegido | No implementado |
| OUT-04 | Cierre de sesión en múltiples pestañas | Dos pestañas abiertas | 1. Cerrar sesión en una pestaña 2. Intentar actuar en otra | La otra pestaña redirige a login | No implementado |
| OUT-05 | Limpieza de credenciales y sesión | Usuario autenticado | 1. Cerrar sesión | Se borran token y datos locales de sesión | Parcial |

### 4.4 Perfil / edición de datos

| ID | Caso de prueba | Precondición | Pasos | Resultado esperado | Estado actual |
| --- | --- | --- | --- | --- | --- |
| PERF-01 | Edición exitosa de datos básicos sin cambiar correo ni contraseña | Usuario autenticado | 1. Entrar a Editar Perfil 2. Modificar nombre y celular 3. Guardar | Se guardan cambios y se muestra confirmación | Parcial |
| PERF-02 | Cambio exitoso de correo con contraseña actual | Usuario autenticado | 1. Cambiar email 2. Ingresar clave actual 3. Guardar | El correo cambia y se valida la contraseña actual | Parcial |
| PERF-03 | Cambio exitoso de contraseña con confirmación | Usuario autenticado | 1. Ingresar contraseña actual 2. Nueva clave válida 3. Confirmar 4. Guardar | Se actualiza la contraseña | Parcial |
| PERF-04 | Cambio de correo con clave actual incorrecta | Usuario autenticado | 1. Intentar cambiar email 2. Ingresar contraseña incorrecta | El sistema bloquea el cambio y muestra error | Parcial |
| PERF-05 | Cambio de contraseña con contraseña actual vacía | Usuario autenticado | 1. Cambiar clave 2. Dejar clave actual vacía 3. Guardar | No se envía el formulario y se muestra error | Parcial |
| PERF-06 | Cambio de correo a uno ya existente | Usuario autenticado | 1. Probar email usado por otro usuario 2. Guardar | El sistema rechaza el cambio | Parcial |
| PERF-07 | Validación de formato en campos editados | Usuario autenticado | 1. Ingresar celular corto, email inválido, contraseña débil | Se muestran errores bajo cada campo afectado | Parcial |
| PERF-08 | Intentar guardar sin cambios | Usuario autenticado | 1. Entrar a editar perfil 2. No tocar nada 3. Guardar | El botón permanece deshabilitado o se muestra error | Parcial |
| PERF-09 | Persistencia tras recarga | Usuario autenticado | 1. Guardar cambios 2. Recargar página | Los datos guardados siguen visibles | Parcial |

### 4.5 Perfil profesional

| ID | Caso de prueba | Precondición | Pasos | Resultado esperado | Estado actual |
| --- | --- | --- | --- | --- | --- |
| PROF-01 | Creación exitosa de perfil profesional | Profesional autenticado sin perfil | 1. Ir a Mi Perfil Profesional 2. Completar campos obligatorios 3. Guardar y publicar | El perfil se publica y queda visible para clientes | No implementado |
| PROF-02 | Guardar con campos obligatorios vacíos | Profesional autenticado | 1. Dejar categorías, descripción, zona, precio y disponibilidad vacíos 2. Guardar | El formulario no envía y marca cada campo faltante | No implementado |
| PROF-03 | Selección múltiple de oficios/categorías | Profesional autenticado | 1. Seleccionar varias categorías 2. Desmarcar una 3. Guardar | Solo quedan guardadas las categorías seleccionadas | No implementado |
| PROF-04 | Descripción corta | Profesional autenticado | 1. Ingresar menos de 20 caracteres 2. Guardar | Error por longitud mínima | No implementado |
| PROF-05 | Descripción muy larga | Profesional autenticado | 1. Ingresar más de 500 caracteres 2. Guardar | Error por longitud máxima | No implementado |
| PROF-06 | Precio inválido | Profesional autenticado | 1. Ingresar negativo, cero o letras 2. Guardar | El sistema rechaza el valor | No implementado |
| PROF-07 | Disponibilidad horaria incoherente | Profesional autenticado | 1. Elegir hora fin menor que hora inicio 2. Guardar | Se muestra advertencia y se bloquea | No implementado |
| PROF-08 | Visibilidad desde búsqueda de cliente | Perfil profesional publicado | 1. Loguearse como cliente 2. Buscar perfil | El profesional aparece y muestra datos guardados | No implementado |
| PROF-09 | Control de acceso por rol | Cliente autenticado | 1. Acceder manualmente a la URL del perfil profesional | El sistema deniega el acceso | No implementado |
| PROF-10 | Edición exitosa del perfil profesional | Profesional autenticado con perfil | 1. Cambiar categoría, descripción, zona, precio y disponibilidad 2. Guardar | Los cambios se aplican y se reflejan en la vista | No implementado |
| PROF-11 | Guardar sin categorías | Profesional autenticado en edición | 1. Desmarcar todas las categorías 2. Guardar | El formulario se bloquea y muestra error | No implementado |
| PROF-12 | Actualización inmediata en búsqueda del cliente | Profesional autenticado | 1. Editar zona o precio 2. Iniciar sesión como cliente 3. Buscar | El cliente ve la información nueva sin cache desactualizado | No implementado |

## 5. Casos de regresión recomendados

- Duplicado de email tras registro.
- Login con email con espacios.
- Contraseña con validación parcial.
- Error de sesión tras logout.
- Cambio de contraseña con confirmación errónea.
- Perfil profesional sin categorías.
- Cambio de rol Cliente/Profesional en registro.

## 6. Resultado de QA sugerido

### Estado actual del proyecto con evidencia
- Se encontró frontend funcional en la rama `dev`.
- El backend y algunas pantallas están presentes.
- No se puede cerrar la validación del DoD como completada sin pruebas funcionales reales ejecutadas en entorno de aplicación.

### Conclusión de QA
- El proyecto está en una etapa intermedia: frontend presente, pero aún requiere revisión y validación de casos críticos para cerrar aceptación final.
- La calidad final dependerá de la ejecución real de cada caso de prueba sobre la app levantada.

## 7. Siguiente paso recomendado

1. Levantar la app con backend + frontend.
2. Ejecutar los casos de prueba del plan en orden prioritario.
3. Registrar defectos por caso fallido.
4. Revalidar tras correcciones.
5. Aprobar solo cuando todos los casos CRÍTICOS y ALTA prioridad pasen.
