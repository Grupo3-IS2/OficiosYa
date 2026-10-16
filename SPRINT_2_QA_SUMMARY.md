# Resumen de QA — Sprint 2

**Fecha del resumen:** 2026-10-01  
**Resultado general:** validación parcial; no cerrar el sprint como QA aprobado hasta completar la corrida integral y resolver los defectos funcionales abiertos.

## Alcance probado

- Registro Cliente/Profesional con código de correo, login y validaciones de formulario.
- Logout, sesión JWT, navegación protegida y múltiples pestañas.
- Cambio de email/contraseña y edición de perfil.
- Perfil público Profesional, privacidad de contacto, imagen/calificación y estados de carga/error.
- Servicios/oficios, tarifas, filtros, búsqueda, paginación, orden y categorías de Home.
- Agenda, filtros temporales, offsets, permisos del dueño y privacidad de reservas.
- Google simulado y selección/mapa de zona con servicios externos interceptados.

## Evidencia de ejecución

- Playwright descubre **206 tests únicos en 12 archivos** después de quitar la copia redundante de `oficiosya.spec.ts`.
- Corridas focalizadas verificadas: formulario/auth UI **7/7**, perfil Profesional **4/4**, búsqueda dedicada **6/6**, agenda **3/3**, perfil público **5/5**, categorías **2/2**.
- En la validación focalizada de contratos de la suite Scrum, **27/28 pasaron**; el caso restante es búsqueda por query + ubicación.
- **La suite completa de 206 tests no se volvió a ejecutar** después de eliminar el duplicado y actualizar los contratos heredados. Los reportes completos anteriores incluían dos copias de la suite Scrum y no representan la base única actual.

## Hallazgos bloqueantes

1. **Logout no revoca el JWT desde la UI.** En login real de Cliente y Profesional, la UI limpia el almacenamiento local, pero el backend sigue aceptando el token en una ruta protegida. Resultado observado: `200` donde se esperaba `401`.
2. **Logout no sincroniza pestañas.** Después de cerrar sesión en una pestaña, la segunda conserva la UI autenticada y no redirige a login.
3. **Búsqueda por query + ubicación.** El perfil público confirma nombre y zona guardados, pero la búsqueda combinada devuelve una lista vacía y no incluye el ID esperado.

## Contratos ya alineados en los tests

- Los endpoints de perfil usan las rutas actuales `/api/v1/users/me`, `/api/v1/clients/me` y `/api/v1/professionals/me`.
- El email duplicado se trata de forma genérica con `202` para no revelar si la cuenta existe.
- El login recorta y normaliza el email.
- El cambio de email inicia con `202`; la dirección cambia recién al verificar el código enviado.
- Las sesiones UI de test usan JWT con expiración válida; las APIs ajenas al escenario se simulan cuando corresponde.

## Omisiones y limitaciones

Los tests `fixme` y los skips condicionales no cuentan como aprobados. Los casos de reenvío de código requieren `VERIFICATION_RESEND_COOLDOWN_SECONDS` bajo (CI usa `3` segundos); los tests de Google UI requieren que el frontend tenga `VITE_GOOGLE_CLIENT_ID`, aunque la identidad y respuestas se simulan.

## Acciones para cerrar QA

- [ ] Hacer que el logout UI invoque la revocación del backend y conservar una prueba con JWT real para ambos roles.
- [ ] Sincronizar logout entre pestañas y aprobar el caso de almacenamiento compartido.
- [ ] Diagnosticar y corregir la búsqueda combinada query + ubicación; mantener el test de regresión.
- [ ] Reconciliar cualquier expectativa legacy restante con contrato vigente, sin suavizar criterios funcionales.
- [ ] Ejecutar `npm run test:e2e:all -- --retries=0` contra el stack CI/QA configurado; adjuntar report/artifact y clasificar todos los fallos/omisiones.
- [ ] Confirmar que checks de Playwright, SonarCloud y aprobación revisora sean requeridos antes de merge según la política del repositorio.

## Especificaciones vinculadas

- [QA_TEST_PLAN.md](QA_TEST_PLAN.md): matriz de aceptación.
- [JIRA_TASKS_DOD_TEST_CASES.md](JIRA_TASKS_DOD_TEST_CASES.md): DoD y casos por historia.
- [QA_STRATEGY.md](QA_STRATEGY.md): estrategia, herramientas, CI y gestión de defectos.

## Guion oral extendido — Estrategia de QA

**Duración sugerida:** 4–5 minutos.

> En esta parte voy a explicar cómo organizamos QA en OficiosYa y cómo acompañamos una funcionalidad desde que se define hasta que queda lista para integrarse.
>
> Nuestro proceso empieza en Jira. Antes de desarrollar una tarea, documentamos su objetivo, los criterios de aceptación, la Definition of Done y los casos de prueba que se van a ejecutar. De esta manera, desarrollo, QA y producto comparten la misma definición de qué significa que la funcionalidad esté terminada y qué evidencia vamos a pedir para aprobarla.
>
> También acordamos que cada integrante prueba su parte antes de abrir el pull request. Según el tipo de cambio, ejecuta sus tests unitarios o de lógica, valida los casos principales y negativos, corre lint y build, y deja el resultado en la descripción del PR. El pull request no reemplaza esa verificación individual: sirve para revisar e integrar el trabajo con el resto del sistema. Después, QA vuelve a recorrer los criterios de aceptación sobre la versión integrada y ejecuta la regresión relacionada.
>
> Probamos en varias capas. En backend usamos JUnit, Spring Boot Test y Mockito para reglas de negocio, controladores, permisos y errores. En frontend tenemos pruebas de lógica con el runner de Node, además de lint y build. Para los recorridos completos usamos Playwright con Chromium, conectando con el backend y PostgreSQL reales cuando el escenario necesita validar persistencia o seguridad. Mailpit recibe los códigos de registro y cambio de correo sin mandar mensajes a direcciones reales. Google Identity y los servicios de mapas se simulan cuando no son el objetivo del caso, para evitar depender de cuentas externas o de la disponibilidad de esos servicios.
>
> En la integración continua se ejecutan las pruebas E2E en pull requests y cambios hacia `dev` y `main`. También usamos SonarQube Cloud para analizar el código, revisar bugs, vulnerabilidades, duplicación y mantenibilidad, y consultar la cobertura que genera JaCoCo. Nuestro criterio para aprobar código es alcanzar como mínimo un **80% de cobertura del código nuevo**. Si no se llega a ese porcentaje o quedan findings críticos sin resolver o justificar, el cambio no se aprueba.
>
> Complementamos ese control con Dependabot, que nos avisa sobre actualizaciones de librerías e imágenes. Cuando se genera una propuesta, revisamos el cambio, su compatibilidad y el impacto en el proyecto; después ejecutamos las pruebas afectadas antes de integrarla. No mergeamos una actualización solo porque la herramienta la propuso.
>
> Durante la ejecución comprobamos tanto los caminos exitosos como los límites y errores: campos vacíos, formatos inválidos, precios en los bordes, permisos por rol, datos privados, estados de carga y respuestas sin resultados. Si una prueba falla, primero reproducimos el caso y clasificamos la causa: puede ser un defecto de implementación, un test que quedó desactualizado, un problema de ambiente o datos de prueba contaminados. Registramos el defecto en Jira con pasos, resultado esperado y obtenido, evidencia, severidad y responsable.
>
> Al terminar cada sprint, mantenemos separados dos registros. En cada tarea de Jira quedan su DoD, los casos previstos y la evidencia de esa historia. En otro documento consolidamos el resultado del sprint: qué suites se ejecutaron, cuántas pasaron o fallaron, qué se omitió, qué defectos siguen abiertos y cuáles son las acciones siguientes. Si una tarea no cumple sus criterios o conserva un defecto, no se marca Done: queda en **“Revisado con errores”** hasta que se corrija y se vuelva a probar.
>
> Para cerrar, buscamos que la calidad sea responsabilidad compartida: cada persona prueba su cambio antes del pull request, el revisor confirma que el código cumple los acuerdos técnicos y QA valida el comportamiento integrado. Solo damos una tarea por terminada cuando sus criterios se cumplen, la evidencia queda registrada y no hay defectos bloqueantes pendientes.
