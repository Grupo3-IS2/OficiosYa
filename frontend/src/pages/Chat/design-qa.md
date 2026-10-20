# Chat de OficiosYa — implementación y alcance de validación

Fecha: 2026-10-19.

## Referencia e implementación

- Fuente visual: mockups adjuntos al pedido (escritorio expandido, contraído, menú y vistas móviles).
- Implementación: ruta existente `/chat`, componentes y hooks de esta carpeta.
- Capturas de implementación: no obtenidas. El usuario indicó expresamente «No utilices el navegador para probar la aplicación».
- Viewports, dimensiones de captura y normalización de densidad: pendientes de comparación renderizada.
- Se conserva el informe anterior de la raíz, perteneciente a Editar perfil; este informe solo cubre Chat.

## Decisiones de implementación

- Colores de los mockups expresados en variables locales; se mantiene la fuente global Inter y el sistema Icon existente.
- Layout de altura dinámica, columnas de escritorio, barra contraíble y vistas separadas a 700px o menos.
- Avatares, nombres, mensajes, montos y propuestas provienen de las APIs. No se incorporaron contactos ni retratos ficticios.
- Se muestran hasta dos oficios y el excedente; si el perfil público no está disponible, se omiten las píldoras y sus acciones profesionales.
- La existencia del perfil se consulta por UUID, sin usar el rol histórico del chat como tipo de cuenta.
- La respuesta de apertura se conserva en sessionStorage, con clave por usuario y conversación, para chats aún ausentes del inbox.
- «Ver solicitud» abre el detalle existente en `/mis-solicitudes?request=ID`.
- La carga anterior se realiza con un botón y conserva un ancla de scroll. Los mensajes se ordenan y deduplican por ID.
- Los mensajes nuevos y cambios de solicitudes conservan la conexión y eventos existentes de chatSocket.
- La lectura exige final del historial visible, ventana enfocada, documento visible y ausencia del modal de solicitud.

## Validación técnica

- Compilación TypeScript y build Vite satisfactorios.
- Pruebas Node sin navegador: selección de conversación, búsqueda local, orden y deduplicación, actualización de propuestas, fechas de Uruguay, reintentos y condiciones de lectura.
- Pruebas de servicio con fetch simulado: cursor before/limit, UUID estable, apertura y recuperación de datos, aislamiento por usuario, almacenamiento malformado, bloqueo/desbloqueo y notificación de lectura tras confirmación del servidor.
- Las pruebas de lógica no certifican el comportamiento del scroll, teclado móvil ni renderizado real.
- Lint sin errores; los avisos restantes corresponden a archivos ajenos a los cambios del chat.
- No se ejecutaron comandos Git, navegador, cambios de backend ni infraestructura.

## Archivos creados o modificados

Dentro de `frontend/src/pages/Chat/`:

- `ChatPage.tsx` (reemplaza la interfaz de prueba), `ChatPage.css`.
- `chatModel.ts`, `chatDelivery.ts`.
- `hooks/useChatInbox.ts`, `hooks/useChatMessages.ts`, `hooks/useChatProfiles.ts`.
- `components/ChatSidebar.tsx`, `components/ChatIdentity.tsx`, `components/ConversationHeader.tsx`, `components/ConversationPanel.tsx`, `components/MessageHistory.tsx`, `components/MessageComposer.tsx`.
- Este informe `design-qa.md`.

Integraciones modificadas dentro de `frontend/src/`:

- `services/chatService.ts`: DTOs completos, cursor, UUID de envío, memoria de apertura, lectura y bloqueo.
- `services/professionalService.ts`: consulta pública opcional para enriquecer contactos.
- `pages/ProfessionalProfile/components/ProfessionalProfileHeader.tsx`: conserva la respuesta al abrir el chat.
- `components/Header/useUnreadChats.ts`: actualiza el contador tras lectura y descarta respuestas antiguas.
- `components/Icon/Icon.tsx`: amplía el sistema existente con enviar, opciones, volver y bloqueo.
- `pages/Requests/RequestsPage.tsx`: abre el detalle enlazado.

Pruebas creadas: `frontend/tests/chatModel.test.ts` y `frontend/tests/chatService.test.ts`.

## Límites pendientes del backend

- Sin endpoint GET de conversación por ID: un enlace a una conversación vacía desde otra sesión necesita reabrirse desde el perfil o una solicitud para obtener metadatos.
- Sin oficios en el DTO de conversación: dependen de que el perfil profesional público sea accesible.
- Sin paginación del inbox, presencia, escritura, confirmación de entrega o visto.
- Sin evento específico para lectura o bloqueo entre pestañas: lectura local actualiza contadores y un resync recupera el estado del servidor.

## Revisión visual pendiente

No se compararon capturas ni se certifican coincidencia visual, interacciones renderizadas o consola del navegador. Tipografía, espaciados, proporciones, contraste, avatares y contenido deberán compararse con los mockups a igual viewport. No hay iteraciones visuales registradas.

final result: blocked

Motivo: validación visual pendiente por la restricción explícita de no utilizar navegador; esto no bloqueó la implementación ni las comprobaciones técnicas autorizadas.
