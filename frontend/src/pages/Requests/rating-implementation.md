# Valoración de profesionales

## Alcance y contrato verificado

Implementación exclusivamente frontend, basada en los tres mockups aprobados. No se
modificaron backend, esquema, datos históricos, infraestructura ni dependencias.

- Envío: `POST /api/v1/job-requests/{id}/review`, mediante `apiRequest`, con su
  autenticación y renovación de sesión existentes. Cuerpo: `{ rating, review }`.
- Respuesta: `200 JobRequestResponse`. Se utiliza el objeto devuelto por la API;
  no se marca una valoración como guardada antes de recibirlo.
- Reconciliación de conflictos: `GET /api/v1/job-requests/{id}`.
- El backend continúa admitiendo enteros de 1 a 10. La presentación divide por 2
  y permite diez niveles entre 0,5 y 5 estrellas; no modifica los valores originales.
- Los promedios se dividen por 2 solo al mostrarlos y se formatean con hasta un
  decimal. El filtro de Home convierte las estrellas a escala interna multiplicando
  por 2 (4,5 estrellas envía `minRating=9`).

## Componentes y navegación

Se reutilizan `RequestDetailModal`, `Button`, `Icon`, el placeholder de avatar,
`JobRequest`, `serviceSummary`, los servicios HTTP y la actualización de solicitudes
existentes. Los datos de identidad provienen de la solicitud real.

`RequestsPage` conserva la solicitud, el origen (detalle/listado) y el scroll del
detalle. Mientras existe un destino de valoración, el detalle no se monta. El nuevo
dialog utiliza una única capa nativa de fondo; el éxito y el descarte reemplazan
su contenido, sin montar otro modal. Los efectos de layout cierran el diálogo
saliente antes de abrir el entrante y restauran el bloqueo de scroll y el foco.

El cierre vuelve al detalle de la misma solicitud, restaurando su scroll hasta
donde permita el contenido. Si se abrió desde el listado, vuelve solo al listado.
Una valoración existente se determina por `request.rating`, también al recargar.

## Selección, validación y errores

- Cinco iconos reutilizados con interior vacío: contorno base gris y superposición
  dorada recortada por mitades. Diez radios nativos, con etiquetas accesibles,
  selección con teclado, focos visibles y zonas táctiles por mitad.
- El hover del mouse es una previsualización separada de la selección. Al salir
  del selector se vuelve al valor confirmado. El toque confirma directamente.
- Elegibilidad: UUID del cliente correspondiente, `COMPLETED`, sin rating previo.
  No depende del rol global: un profesional también puede ser cliente de un trabajo.
- Comentario obligatorio, no blanco, sin mínimo adicional, máximo 1000 caracteres;
  contador sobre el borrador y recorte de extremos únicamente en el payload.
- Botón deshabilitado si el formulario es inválido. Bloqueo síncrono con ref más
  estado de carga para evitar duplicados y cierre durante el envío.
- X/Escape sin cambios cierra; con cambios muestra confirmación dentro del mismo
  popup. Continuar conserva el formulario, descartar vuelve al origen.
- 400 conserva el mensaje de negocio/validación de la API; 403 y 404 dejan de
  ofrecer envío. 409 recupera el estado real y nunca sobrescribe una valoración.
  Errores de red conservan el borrador; si el primer envío se guardó pero se perdió
  su respuesta, un reintento puede reconciliarse mediante 409 y GET.

## Datos actualizados

Después de un envío confirmado se reemplazan solicitud y detalle con la respuesta
real y se refresca `/mine`. Una revisión de mutaciones evita que una lectura
anterior al guardado reemplace ese resultado. Un evento local y una notificación
de storage invalidan las solicitudes y los promedios montados en Home/perfil,
incluidas otras pestañas; la restauración desde bfcache también solicita datos.
No se calcula ni se persiste un promedio profesional en el navegador.

## Inventario de archivos de esta funcionalidad

Creados:

- `frontend/src/pages/Requests/ProfessionalRatingModal.tsx`
- `frontend/src/pages/Requests/ProfessionalRatingModal.css`
- `frontend/src/pages/Requests/StarRatingInput.tsx`
- `frontend/src/pages/Requests/ratingForm.ts`
- `frontend/src/services/ratingEvents.ts`
- `frontend/src/utils/ratingScale.ts`
- `frontend/tests/ratingForm.test.ts`
- `frontend/tests/ratingService.test.ts`
- `frontend/src/pages/Requests/rating-implementation.md` (este documento)

Modificados:

- `frontend/src/pages/Requests/RequestsPage.tsx`
- `frontend/src/pages/Requests/RequestDetailModal.tsx`
- `frontend/src/pages/Requests/RequestDetailModal.css`
- `frontend/src/services/jobRequestService.ts`
- `frontend/src/pages/Home/components/Rating.tsx`
- `frontend/src/pages/Home/professionalSearch.ts`
- `frontend/src/pages/Home/useProfessionalSearch.ts`
- `frontend/src/pages/ProfessionalProfile/ProfessionalProfilePage.tsx`
- `frontend/src/pages/ProfessionalProfile/components/ProfessionalProfileHeader.tsx`
- `frontend/src/pages/ProfessionalProfile/components/ReviewsSection.tsx`
- `frontend/tests/professionalSearch.test.ts`

## Verificación y pendientes

Pruebas de Node sin servicios reales: diez equivalencias, precisión de promedios,
límites del formulario, UUID/estado/valoración previa, payload y ruta HTTP reales,
errores 400/403/404/409, red, notificaciones y limpieza de suscripciones. El test
del filtro se actualizó intencionalmente al contrato de conversión de estrellas.

`npm test`: 151 pruebas aprobadas. `npm run build`: compilación aprobada (aviso de
bundle mayor a 500 kB). `npm run lint`: sin errores, ocho advertencias existentes
en componentes ajenos al nuevo formulario y en la carga de búsqueda existente.

La aplicación y el navegador no se ejecutaron. No se verificaron visualmente
capturas, interacción real con teclado/touch, scroll con el teclado móvil ni
operaciones contra un backend real. La validación visual de la guía de imagen a
código queda bloqueada por la restricción explícita del usuario.

Limitación del backend sin modificar: `JobRequestReviewRequest.review` sigue
siendo opcional (`@Size(max = 1000)` sin `@NotBlank`), por lo que otro cliente HTTP
puede enviar un comentario vacío. La obligatoriedad implementada aquí solo cubre
esta interfaz. Las reglas de propietario, estado, una valoración por trabajo,
inmutabilidad y promedio siguen correspondiendo al backend existente.

final result: blocked (solo validación visual; implementación y comprobación estática completadas)
