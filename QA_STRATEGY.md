# OficiosYa — Estrategia de QA

**Propósito:** establecer cómo se previene, detecta, registra y acepta la calidad de cada historia y release de OficiosYa. Este documento puede enlazarse desde Jira y complementa [QA_TEST_PLAN.md](QA_TEST_PLAN.md) y [JIRA_TASKS_DOD_TEST_CASES.md](JIRA_TASKS_DOD_TEST_CASES.md).

**Alcance:** frontend React/Vite, API Spring Boot, persistencia PostgreSQL, autenticación/JWT, correo de verificación, agenda, búsquedas, mapas de zona e integraciones de terceros.

## 1. Principios

- **Probar el contrato y el riesgo:** validar resultados observables y reglas de negocio; no acoplar tests a detalles internos sin valor para el usuario.
- **Pirámide de pruebas:** tests unitarios rápidos abajo; pruebas de integración/API para contratos y persistencia; Playwright para recorridos críticos de extremo a extremo.
- **Sin falsos verdes:** no usar `fixme`, `skip`, mocks o status más permisivos para esconder un defecto. Cada excepción debe tener motivo, responsable y condición de reactivación.
- **Privacidad por defecto:** nunca imprimir, adjuntar ni versionar contraseñas, tokens, correos reales, PIN de verificación o datos de clientes.
- **Reproducibilidad:** registrar commit, entorno, comando y resultado; usar datos sintéticos y únicos, y limpiar recursos si el test los crea.
- **Separar defectos:** identificar si la causa es implementación, test desactualizado, infraestructura/configuración o datos contaminados antes de cambiar una expectativa.

## 2. Capas de calidad

| Capa | Qué verifica | Herramienta actual | Evidencia/gate actual |
| --- | --- | --- | --- |
| Unit tests backend | Servicios, reglas de negocio, validación, permisos, correo y transacciones | JUnit/Spring Boot Test/Mockito | SonarCloud ejecuta `mvn clean test`, excluyendo `OficiosYaTests`. |
| Unit tests frontend | Lógica de filtros, calendario, sesión, geocodificación y helpers | Node test runner (`node --experimental-strip-types --test`) | Script disponible en `frontend/package.json`; no está conectado como job independiente en los workflows revisados. |
| API/integración | Contratos REST, auth, persistencia, códigos, permisos y agenda | Playwright `request` contra Spring/PostgreSQL reales | En workflow Playwright en PR/push a `main` y `dev`. |
| E2E UI | Flujos visibles de registro/login, perfil, búsqueda, calendario y logout | Playwright + Chromium | En workflow Playwright en PR/push a `main` y `dev`; reporte HTML como artifact 30 días. |
| Calidad estática | Bugs, code smells, vulnerabilidades y cobertura nueva | SonarQube Cloud + JaCoCo | Workflow analiza PR/push a `main` y `dev`; verificar resultado en SonarCloud. No se encontró threshold/gate de cobertura declarado en YAML. |
| Dependencias | Versiones vulnerables/desactualizadas | Dependabot | Actualizaciones semanales npm, Maven y Docker Compose hacia `dev`; revisar ubicación Maven pendiente. |
| Build/deploy | Que el artefacto de frontend/backend compile y pueda desplegarse | Docker Compose/Vite/Maven | Deploy workflow se activa en push a `main`/`dev`, construye frontend y reinicia servicios; es un workflow separado de los tests. |
| Exploratoria | UX, responsive, teclado, accesibilidad, estados límite y navegadores | Revisión manual guiada por Jira/QA plan | Registrar evidencia en el ticket; no reemplaza automatización de regresión. |

## 3. Entorno de QA

### E2E con backend real

- Backend Spring, PostgreSQL, frontend Vite y Mailpit se ejecutan con Docker Compose.
- Mailpit captura códigos de registro/cambio de email; no se envían a direcciones reales.
- Playwright levanta Vite en `5173` si no existe otro servidor. La suite usa Chromium; algunos tests cambian viewport para mobile.
- Configuración para el lote de tests en `.env` de QA/CI:
  - `RATE_LIMIT_AUTH_PER_MINUTE=100000` evita `429` por los muchos registros desde una IP compartida.
  - `VERIFICATION_RESEND_COOLDOWN_SECONDS=3` permite cubrir el reenvío sin esperar 60 segundos.
- No cambiar secretos/keys de producción ni borrar volúmenes de datos compartidos para “limpiar” tests. Usar datos únicos y un entorno aislado.

### Aislamiento de servicios externos

- Google Identity se reemplaza por un cliente/script de prueba y respuestas controladas; no hace falta una cuenta Google real.
- Nominatim, Photon y tiles de OpenStreetMap se interceptan salvo en los tests que prueban mapa; la suite no debe depender de disponibilidad externa.
- Para pruebas de UI, mockear únicamente la dependencia fuera del alcance del caso. Mantener backend real para validar contratos de seguridad, persistencia o negocio.

## 4. Flujo recomendado por cambio

1. **Definir aceptación en Jira:** actor/rol, precondiciones, resultado esperado, códigos HTTP cuando aplique, datos privados y escenarios negativos.
2. **Diseñar pruebas antes de implementar:** un caso exitoso, validaciones, límites/bordes, autorización y efectos secundarios relevantes.
3. **Validación local rápida:** ejecutar tests unitarios, lint y build del módulo tocado.
4. **Validación integrada:** API/Playwright focalizado con DB y Mailpit reales cuando el flujo dependa de ellos.
5. **Regresión:** correr las suites de dominio tocadas y el comando global antes de cerrar una épica/release.
6. **Revisión automática:** revisar Playwright, SonarCloud y alertas de Dependabot en el PR.
7. **Triage:** si falla, clasificar causa antes de editar: implementación, contrato/test obsoleto, ambiente o fixture. No ocultar el fallo con retry, skip o expectativa genérica.
8. **Cierre Jira:** enlazar PR/commit, comando, resumen de tests y defects residuales. Marcar DoD solo si se cumplen criterios o las excepciones están aceptadas y asignadas.

## 5. Comandos de referencia

Desde la raíz del repositorio:

```sh
# Backend: tests y reporte JaCoCo
./mvnw -B test

# Windows PowerShell
.\mvnw.cmd -B test

# Frontend: unit tests, lint y build
cd frontend
npm test
npm run lint
npm run build

# Playwright: suite completa y grupos
cd ../test
npm run test:e2e:all
npm run test:e2e:auth
npm run test:e2e:scrum
npm run test:e2e:professionals
npm run test:e2e:zones

# Test único o filtro por título
npx playwright test tests/professional/schedules.spec.ts
npx playwright test --grep "TC-16"
```

El workflow Sonar excluye `OficiosYaTests` porque inicia el contexto completo y requiere base de datos. Ese test/contexto se debe ejecutar en un entorno que tenga sus dependencias. Confirmar los comandos exactos según runner/OS antes de enlazarlos como branch-protection checks.

## 6. Cobertura funcional actual

| Dominio | Alcance automatizado existente |
| --- | --- |
| Registro/código | Cliente y Profesional, código correcto/incorrecto, intentos, un solo uso, cooldown, Mailpit y UI. |
| Login/Google | Login de roles, validación, JWT, vinculación/desvinculación con Google simulado. |
| Perfil/cuenta | Consulta/edición, email con código, contraseña, avatar y controles de perfil. |
| Profesional | Publicación, múltiples oficios, precios, límites de descripción, perfil público y privacidad. |
| Búsqueda | Texto, trade(s), rango, zona, rating/filtros de Home, paginación, orden y empty state. |
| Agenda | Crear/editar/borrar, permisos, rango/offset, bloque reservado y privacidad de solicitud. |
| Zona/mapa | Selector en registro y perfil, geocodificación simulada, errores, zoom, fallback y persistencia. |
| Sesión | Logout real UI/API, navegación atrás, multi-pestaña y rutas protegidas; algunas aserciones detectan gaps conocidos. |

Specs organizadas en `test/tests/auth`, `scrum`, `professional`, `work-zone` y helpers en `test/tests/support`. El índice y comandos están en [test/README.md](test/README.md).

## 7. Criterios de entrada y salida

### Entrada a prueba

- Criterios Jira revisados por PO/QA y testables.
- Ambiente/DB/mail disponibles o dependencias mockeadas explícitamente.
- Variables configuradas y sin datos personales reales.
- Build instalable y migraciones compatibles con la base de QA.

### Salida/aceptación

- Cero defectos bloqueantes/críticos abiertos para el alcance.
- Casos críticos de happy path, validación, permisos y privacidad aprobados.
- Tests modificados/agregados ejecutados; fallos restantes explicados, asignados y no confundidos con `skipped`.
- No hay errores nuevos de build/lint ni findings críticos/high de Sonar sin excepción aprobada.
- Reporte, evidencia visual/logs y commit/PR adjuntos en Jira.
- Al menos una persona distinta del autor revisa la aceptación en PR.

## 8. Clasificación y gestión de defectos

| Severidad | Criterio | Ejemplo |
| --- | --- | --- |
| Bloqueante | No se puede completar un flujo central o hay pérdida/corrupción grave de datos. | No es posible registrar o usar la app. |
| Crítica | Bypass de autenticación/rol, exposición de PII/PIN o acceso a cuenta ajena. | JWT sigue autorizado después del logout si logout promete revocarlo. |
| Alta | Función central incorrecta sin workaround razonable. | Profesional publicado no aparece en búsqueda con filtros válidos. |
| Media | Error localizado con alternativa. | Estado vacío o error visual no claro. |
| Baja | Presentación/copy sin impacto funcional. | Etiqueta o alineación menor. |

Cada issue Jira debe incluir: ambiente/commit, rol, precondición y fixture, pasos mínimos, esperado/actual, status/body sanitizado, frecuencia, screenshot/video/trace si aplica, severidad, componente/owner y test de regresión vinculado.

## 9. SonarQube Cloud, cobertura y política de dependencias

### SonarQube Cloud

- El workflow corre en push y pull request hacia `main` y `dev`, además de `workflow_dispatch`.
- Usa Java 25, historial Git completo, Maven y `SONAR_TOKEN` como secret.
- Ejecuta tests Maven salvo `OficiosYaTests`, genera JaCoCo (`target/site/jacoco/jacoco.xml`) y envía análisis a SonarCloud.
- El scanner espera hasta 600 segundos el resultado del Quality Gate; un gate fallido devuelve error en el workflow.
- En cada PR revisar Quality Gate, bugs, vulnerabilidades, code smells, duplicación y cobertura de código nuevo; justificar/excluir solo con acuerdo explícito.
- **Umbral de cobertura:** configurar en SonarCloud el Quality Gate con `Coverage on New Code >= 80%`. El workflow espera el gate, pero la condición y el porcentaje se administran en el proyecto SonarCloud, no en este YAML. Confirmar también que el check aparezca como requerido en la protección de `dev`/`main`.
- La cobertura agregada es principalmente backend Java; frontend necesita mantener `npm test`, `npm run lint` y `npm run build` como checks CI explícitos si se quiere garantizar ese gate automáticamente.

### Dependabot

- `.github/workflows/dependabot.yml` configura actualizaciones semanales para npm, Maven y Docker Compose con destino `dev`.
- Revisar y mergear PR solo después de comprobar changelog/advisories, tests, build, lockfiles y compatibilidad de imágenes.
- Tratar alertas critical/high como prioritarias; no cerrar alerta solo por actualizar versión sin repetir validación.
- El ecosistema Maven apunta a `/`, donde reside `pom.xml`; tras el siguiente ciclo semanal verificar que Dependabot publique propuestas de actualización para backend.

## 10. Riesgos y temas abiertos

- Revocación de token en logout desde UI y sincronización de sesión entre pestañas deben pasar tests reales antes de cerrar seguridad de sesión.
- Resolver pruebas heredadas con endpoints/fixtures antiguos; actualizar contrato, no debilitar asserts útiles.
- Acordar estado HTTP del logout repetido y semántica de precio cero.
- Confirmar SCRUM-12, rol predeterminado y requisito de cédula con producto.
- Aclarar si `query` público busca solo nombre o también descripción.
- Completar responsive, teclado y accesibilidad con criterios WCAG concretos y matriz de dispositivos/navegadores. Actualmente Playwright configura Chromium como proyecto automatizado principal.
- Asegurar política de branch protection para checks CI, Sonar y aprobación revisora antes del merge.

## 11. Plantilla de evidencia de QA para pegar en Jira

```text
Estado: PASS / FAIL / BLOCKED / SKIPPED
Ticket / criterio:
Commit / PR:
Entorno y navegador:
Comando ejecutado:
Resultado: N passed / N failed / N skipped
Precondición y datos sintéticos:
Pasos ejecutados:
Esperado:
Actual:
Evidencia: enlace a CI, reporte, screenshot, video o trace
Defectos vinculados:
Riesgo residual / motivo de skip:
QA / fecha:
```
