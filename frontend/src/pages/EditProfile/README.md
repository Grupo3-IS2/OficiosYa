# Editar perfil

Ruta: `/profile/edit`, enlazada desde el menú de perfil. Esta versión representa únicamente un perfil profesional habilitado. Sin sesión muestra datos de prueba que nunca se envían al servidor.

- El correo se cambia con `PUT /api/v1/user/me/email`, que pide la contraseña actual. Al cambiarlo se cierra la sesión porque el token identifica el correo anterior. No existe un flujo de verificación integrado.
- Foto (JPG/PNG, hasta 5 MB) se sube con `POST /api/v1/user/me/profile-image` al guardar la sección; hasta entonces se muestra una vista previa cuya URL se libera al reemplazar la foto, guardarla, descartar los cambios o salir. La foto guardada llega en `profileImageUrl` de `/api/v1/user/me`.
- El teléfono, la descripción y la ubicación del profesional llegan en `/api/v1/user/me`. El cliente no tiene teléfono en el servidor.
- Nombre y teléfono se guardan en el endpoint del rol, `PUT /api/v1/client/me` o `PUT /api/v1/professional/me`; el backend toma la cuenta del token. El backend ignora los campos vacíos, así que la respuesta manda sobre lo que quedó guardado. El nombre todavía no es editable en el formulario.
- Seguridad usa `PUT /api/v1/user/me/password`. Valida los mismos requisitos que el backend y limpia los tres campos únicamente después de recibir una respuesta exitosa. Las contraseñas no se guardan en almacenamiento local ni de sesión.
- Descripción y ubicación se guardan mediante `PUT /api/v1/professional/me`. El catálogo de oficios llega de `GET /api/v1/trade`; cada oficio del perfil se guarda con `POST /api/v1/professional/me/expertise-trade` y sus tarifas horarias. Los oficios quitados se eliminan con `DELETE /api/v1/professional/me/expertise-trade/{expertiseTradeId}`. Para cambiar tarifas, la API exige quitar el oficio y volver a agregarlo.
- La opción «Ofrecer mis servicios» representa `published`. Después de guardar descripción, ubicación y oficios, el editor llama a `POST /api/v1/professional/me/publish`; al desactivarla llama a `/unpublish`. Si un perfil publicado cambia sus oficios o tarifas, se despublica antes del cambio y se vuelve a publicar al final. La publicación exige descripción y al menos un oficio. Los datos del perfil se cargan desde la API y no se guardan en `sessionStorage` ni en `localStorage`; solo el token y los datos mínimos de sesión permanecen en `localStorage`.

Cada sección tiene su propio formulario. Se reutilizan Button, Icon y el avatar existente. No se incluyen conversión a profesional, estado sin perfil profesional ni modal de cambios sin guardar.
