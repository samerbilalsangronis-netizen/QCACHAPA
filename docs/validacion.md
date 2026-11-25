# Validación y alcance

## Comprobaciones ejecutadas

- `npm run build` verifica TypeScript y construye los recursos de Vite.
- `npm test` aplica las migraciones a PostgreSQL embebido con PGlite y reproduce el pedido público, su reintento, el cambio de precio, el acceso por rol, la transición por cocina, el seguimiento, el cobro único y el arqueo de un turno que cruza la medianoche. También verifica el historial de cancelación, la privacidad de apuntes y un consolidado de más de 1.000 cobros.
- Chromium abrió el portal y el acceso del personal con tamaños de 390×844, 768×1024 y 1440×900. Se comprobó que la foto carga, que los enlaces de menú y personal funcionan y que se abre el formulario de recuperación. Este recorrido usa el sitio sin credenciales. Se verificó también el manifest y la recarga de la portada sin conexión desde el service worker.

- Un ensayo de Chromium con PostgreSQL 17, GoTrue y PostgREST locales recorrió pedido desde móvil, autenticación en caja y cocina, comanda, llamada al audio, preparación por producto, seguimiento, entrega, cobro en USD, arqueo y resumen administrativo. También se comprobó la persistencia de un apunte y la visualización de un compromiso en el calendario. El ensayo de cocina utilizó el sondeo de respaldo. La conexión WebSocket se abrió, pero la instalación local de PostgreSQL carecía del plugin wal2json y no verificó la entrega de cambios por Realtime.

## Pendiente para completar la especificación

- Verificar la entrega de cambios por Realtime, el audio en dispositivos reales, la recuperación de acceso por correo y el recorrido en un proyecto Supabase alojado. Aplicar las migraciones y validar la PWA en HTTPS. El despliegue de Netlify queda por realizar.
- Incorporar el logo oficial y los datos comerciales al recibirlos. Implementar carga administrada de imágenes y comprobantes, promociones, cupones, adicionales con restricciones, variantes, «Arma tu cachapa» y configuración de modalidades y pagos web.
- Completar mesas, turnos con movimientos de caja, pagos mixtos, divisas y tasas históricas, reembolsos y anulaciones de ventas cobradas, edición auditada de comandas, prioridades, incidencias y configuración de alertas de cocina.
- Completar personal y permisos individuales en el panel, recordatorios de agenda, etiquetas, adjuntos, asignación, subtareas, comentarios, recurrencia y permisos explícitos por apunte.
- Implementar inventario, recetas, proveedores, compras, clientes, finanzas, delivery y despacho. Ampliar el dashboard y añadir exportaciones PDF y Excel.
- Desarrollar cola IndexedDB de operaciones POS, sincronización y resolución de conflictos, y probar desconexiones reales. La PWA actual conserva la estructura del sitio y el carrito público se conserva en el navegador. La operación de caja requiere conexión.
