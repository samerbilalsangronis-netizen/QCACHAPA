# Configuración y recuperación

## Proyecto de Supabase

1. Crea un proyecto exclusivo para QCACHAPA. Copia la URL y la clave publicable del proyecto al archivo local de entorno.
2. Vincula el CLI de Supabase a ese proyecto y ejecuta `supabase db push`, o aplica cada archivo de `supabase/migrations` por orden desde el editor SQL. Las migraciones se ejecutan una vez por base de datos.
3. Configura la URL del sitio y las URL autorizadas de retorno en Authentication. Agrega el origen local y el de Netlify con la ruta `/personal/` para recuperación de acceso. Deshabilita altas públicas de Auth si solo se crearán cuentas desde el panel.
4. Crea un usuario de personal en Authentication con su correo individual. Copia el UUID y ejecuta en el editor SQL:

   ```sql
   insert into public.staff (id, role)
   values ('UUID-DEL-USUARIO', 'admin');
   ```

   Para empleados adicionales usa `cashier` o `kitchen`. Desactiva el acceso cambiando `active` a `false` en `public.staff`. Las políticas y funciones comprueban este campo durante las operaciones.
5. En **Ajustes**, selecciona archivos para el logo y la portada. En **Menú**, agrega la foto desde el formulario del producto. Puedes cargar JPG, PNG, WebP o AVIF de hasta 5 MB. Si ya aplicaste las dos primeras migraciones, ejecuta únicamente `202611250003_catalog_images.sql` en el SQL Editor del proyecto QCACHAPA. Esta migración crea el bucket público de imágenes y reserva las escrituras a administradores activos. Los archivos se publican al guardar el formulario.
6. Crea categorías y productos reales antes de habilitar pedidos web. Completa el flujo de validación con cuentas distintas de caja y cocina antes de abrirlo al público.

## Netlify

Importa el repositorio QCACHAPA en Netlify. `netlify.toml` declara el comando de compilación, la carpeta de salida y la redirección de SPA. Configura Node 22 o 24 y ambas variables públicas de entorno. Despliega y registra el dominio final en Supabase Auth. Verifica la instalación PWA en dispositivos compatibles bajo HTTPS y repite el flujo de operaciones en un entorno de ensayo antes de abrir pedidos reales.

## Respaldo y restauración

- Verifica en Supabase los backups disponibles para el plan y descarga o exporta periódicamente un respaldo PostgreSQL protegido. Registra la fecha, el origen y la versión de migraciones. Conserva aparte una copia de los archivos de Storage, una copia de migraciones y la configuración de Auth, redirecciones y hosting. El respaldo de la base de datos solo incluye metadatos de los objetos de Storage.
- Para restaurar, crea primero un proyecto de ensayo y sigue el procedimiento de restauración de Supabase compatible con el formato del respaldo. Restaura los archivos de Storage y vuelve a configurar las URL de Auth y las claves del proyecto. Comprueba la correspondencia entre las cuentas de Auth y `public.staff` antes de habilitar accesos.
- Compara conteos de pedidos, pagos y eventos con el respaldo. Verifica acceso por rol, comandas, reportes, fotos y seguimiento. Cambia las variables de Netlify al nuevo proyecto únicamente después de esa validación y verifica que el tráfico quede en una sola base.
