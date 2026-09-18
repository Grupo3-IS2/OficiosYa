# Editar perfil

Ruta: `/profile/edit`, enlazada desde el menú de perfil. Esta versión representa únicamente un perfil profesional habilitado. Sin sesión muestra datos de prueba que nunca se envían al servidor.

- El correo se cambia con `PUT /api/v1/user/me/email`, que pide la contraseña actual. Al cambiarlo se cierra la sesión porque el token identifica el correo anterior. No existe un flujo de verificación integrado.
- Foto (JPG/PNG, hasta 5 MB) se sube con `POST /api/v1/user/me/profile-image` al guardar la sección; hasta entonces se muestra una vista previa cuya URL se libera al reemplazar la foto, guardarla, descartar los cambios o salir. La foto guardada llega en `profileImageUrl` de `/api/v1/user/me`.
- El teléfono del profesional llega en `phoneNumber` de `/api/v1/user/me`, que responde con la forma del rol: un profesional agrega `phoneNumber` y `workingLocation` a los campos de usuario. El cliente no tiene teléfono en el servidor, el suyo sigue siendo temporal.
- Nombre y teléfono se guardan en el endpoint del rol, `PUT /api/v1/client/{id}` o `PUT /api/v1/professional/{id}`. El `id` es el publicId, que se guarda en la sesión al iniciarla y se refresca desde `/api/v1/user/me`. El backend ignora los campos vacíos, así que la respuesta manda sobre lo que quedó guardado. El nombre todavía no es editable en el formulario. `workingLocation` no tiene campo: se define al registrarse.
- Seguridad usa `PUT /api/v1/user/me/password`. Valida los mismos requisitos que el backend y limpia los tres campos únicamente después de recibir una respuesta exitosa. Las contraseñas no se guardan en almacenamiento local ni de sesión.
- Descripción, zonas y disponibilidad usan estado React y se restablecen al salir o recargar. El acceso al panel muestra un aviso porque aún no existe esa página.

Cada sección tiene su propio formulario. Se reutilizan Button, Icon y el avatar existente. No se incluyen conversión a profesional, estado sin perfil profesional ni modal de cambios sin guardar.
