# Arquitectura de QCACHAPA

React, TypeScript, Vite y Tailwind sirven el portal y los paneles internos. Supabase Auth identifica al personal. PostgreSQL aplica permisos por rol, calcula importes y ejecuta cambios de estado en transacciones. Realtime difunde cambios en una proyección de cocina sin datos personales ni importes. El seguimiento público consulta únicamente un estado mediante un secreto aleatorio. Netlify sirve la PWA.

## Referencia funcional de Habibis

Se revisó Habibis en el commit `c7c8c2c`. Su aplicación Next.js separa la tienda, el carrito lateral, el formulario de pedido y el seguimiento. El área de personal usa un menú por rol con rutas para pedidos, pedidos manuales, catálogo, reportes y ajustes. El tablero distingue el avance de la comanda y el estado de cobro.

QCACHAPA aplica esa separación en React y Vite:

| Flujo | Acceso en QCACHAPA |
| --- | --- |
| Menú, carrito y confirmación | `/` y `/checkout/`. El cliente recupera su carrito al navegar. |
| Seguimiento | `/pedido/#…`. El token permanece en el fragmento del navegador. |
| Pedidos y pedido manual | `/personal/pedidos/` y `/personal/pedidos/nuevo/`. Los filtros actúan sobre los últimos 80 pedidos visibles para el usuario. |
| Turno de caja y cocina | `/personal/caja/` y `/personal/cocina/`. Conservan los permisos y acciones existentes de cada módulo. |
| Administración | `/personal/menu/`, `/personal/reportes/`, `/personal/ajustes/` y `/personal/organizador/`. |

El acceso heredado `/personal/` abre el flujo correspondiente al rol. Supabase sigue autorizando cada consulta y operación crítica. Los comprobantes, modificadores, tasas de cambio y despacho que aparecen en Habibis requieren su propia implementación para el modelo de QCACHAPA.

## Modelo inicial

- Configuración comercial, categorías y productos con precios en USD.
- Perfiles vinculados a Auth con roles activos.
- Pedidos con identificadores de idempotencia, secreto de seguimiento, líneas con instantáneas de precios y eventos de estado.
- Proyección de comandas para cocina. Pedidos y pagos permanecen restringidos.
- Turnos de caja, pagos y apuntes, pendientes, eventos y novedades administrativas.

## Límites de las operaciones

| Operación | Validación del servidor | Efecto |
| --- | --- | --- |
| Crear pedido | Canal habilitado, turno para caja, productos disponibles, precio aceptado y UUID de reintento | Pedido y líneas con precios históricos, evento inicial y secreto de seguimiento |
| Confirmar pedido | Perfil de caja o administración y estado recibido | Evento de confirmación y proyección de cocina |
| Preparar | Perfil de cocina o administración y estado compatible | Cambio de comanda, evento del pedido y seguimiento actualizado |
| Cobrar | Perfil de caja o administración, turno abierto y pedido cobrable | Pago único por pedido, asociado al turno correspondiente |
| Cerrar turno | Turno propio y efectivo contado | Arqueo con fondo inicial, cobros en efectivo y diferencia |
| Registrar una nota privada | Perfil administrativo | Lectura y edición restringidas al autor |

El pedido público emplea un límite global de 30 pedidos nuevos por minuto en la base. La aplicación queda cerrada inicialmente. Para operar con tráfico público sostenido se necesita protección adicional por cliente en el perímetro y monitoreo de solicitudes.

## Orden técnico

1. Crear la migración, las políticas y el acceso de personal.
2. Conectar catálogo, carrito, registro y seguimiento.
3. Conectar caja, turnos y cobro.
4. Conectar cocina, estados, alertas y reconexión.
5. Conectar edición del catálogo y organizador.
6. Ampliar recetas, inventario, compras y contabilidad mediante movimientos transaccionales.
7. Completar delivery, promociones, sincronización offline y reportes. Verificar permisos, idempotencia y consistencia antes de habilitar cada módulo.
