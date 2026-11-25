# QCACHAPA

Base operativa para Q'Cachapas. El portal, caja, cocina y administración comparten un backend PostgreSQL en Supabase. La aplicación usa USD y presenta las horas operativas en America/Caracas. La base inicia con los pedidos web cerrados y el catálogo vacío.

## Instalación

Requiere Node.js 22.12 o superior y npm. Desde la raíz del repositorio:

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Configura `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` con los valores de un proyecto Supabase nuevo para QCACHAPA. La clave publicable se distribuye con el frontend. Las credenciales administrativas se mantienen en el panel de Supabase. Sin variables se puede abrir la portada y consultar su estado inicial.

- [Arquitectura y orden técnico](docs/arquitectura.md)
- [Supabase, primer administrador, Netlify y recuperación](docs/operacion.md)
- [Manuales básicos para caja, cocina y administración](docs/manual.md)
- [Pruebas y alcance pendiente](docs/validacion.md)
