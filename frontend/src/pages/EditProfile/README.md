# Editar perfil

Ruta: `/profile/edit`, enlazada desde el menú de perfil. Esta versión representa únicamente un perfil profesional habilitado. Sin sesión muestra datos de prueba que nunca se envían al servidor.

- Nombre y correo reutilizan `updateUser`. El backend admite campos omitidos: no se envía contraseña desde este formulario. Al cambiar el correo se cierra la sesión porque el token identifica el correo anterior. No existe un flujo de verificación integrado.
- Foto (JPG/PNG, hasta 5 MB) se sube con `POST /api/v1/user/me/profile-image` al guardar la sección; hasta entonces se muestra una vista previa cuya URL se libera al reemplazar la foto, guardarla, descartar los cambios o salir. La foto guardada llega en `profileImageUrl` de `/api/v1/user/me`.
- El teléfono es temporal.
- Seguridad usa `PUT /api/v1/user/me/password`. Valida los mismos requisitos que el backend y limpia los tres campos únicamente después de recibir una respuesta exitosa. Las contraseñas no se guardan en almacenamiento local ni de sesión.
- Descripción, zonas y disponibilidad usan estado React y se restablecen al salir o recargar. El acceso al panel muestra un aviso porque aún no existe esa página.

Cada sección tiene su propio formulario. Se reutilizan Button, Icon y el avatar existente. No se incluyen conversión a profesional, estado sin perfil profesional ni modal de cambios sin guardar.
