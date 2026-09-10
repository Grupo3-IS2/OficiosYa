# Editar perfil — revisión

- Fuente: mockup adjunto en la conversación, 958 × 1642 píxeles.
- Implementación: capturas del navegador incluidas en la conversación; `/profile/edit`.
- Viewports solicitados: 958 × 1642 y 390 × 844 CSS px.
- Estado: vista de prueba, dos zonas iniciales, descripción de 179 caracteres, disponibilidad activada y contraseñas vacías.
- Evidencia visual: tres tarjetas con columna de avatar, contraseñas en dos columnas y acciones a la derecha. Las capturas móviles muestran campos apilados y botones del ancho del formulario.
- Diferencias conocidas: avatar predeterminado del proyecto en lugar del retrato; tipografía global conservada; contraseñas vacías.
- Interacciones verificadas: abrir zonas, agregar y eliminar Las Piedras, cambiar disponibilidad, editar descripción (contador actualizado a 37), guardar perfil profesional (mensaje temporal), mostrar contraseña actual.
- Consola: sin errores registrados durante la prueba.
- Build, lint y diff --check correctos.
- Pendiente: actualización con backend y cuenta de prueba, carga de archivos, validación de contraseñas en navegador y comparación de capturas exportadas a igual densidad.
- La captura final móvil presentó una escala inconsistente al restablecer el viewport. Las capturas anteriores permitieron inspeccionar datos personales y seguridad, pero no certificar toda la pantalla móvil.

final result: blocked

La certificación visual exhaustiva queda pendiente por la captura móvil final y la normalización de densidad. No se declara fidelidad pixel a pixel.
