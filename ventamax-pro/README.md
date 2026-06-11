# VentaMax Pro

Sistema de venta TAT (tienda a tienda) con vendedores en campo, entregadores y administración central.

Diseñado para **50 vendedores** generando hasta **9.000 facturas mensuales cada uno** (~450.000/mes).

## Arquitectura

```
ventamax-pro/
├── backend/    API REST — Node.js + TypeScript + Express + Prisma + PostgreSQL
├── frontend/   App web — React + TypeScript + Vite (móvil primero, soporte offline)
├── docs/       Arquitectura, guía de migración y convenciones
└── docker-compose.yml
```

## Inicio rápido con Docker (recomendado)

```bash
docker compose up --build
```

- Frontend: http://localhost:8080
- API: http://localhost:4000/api/salud

Crea el usuario inicial:
```bash
docker compose exec backend npx tsx prisma/seed.ts
# Usuarios: admin / vendedor1 — PIN: 1234
```

## Desarrollo local (sin Docker)

Requisitos: Node.js 20+, PostgreSQL 16+.

**Backend:**
```bash
cd backend
cp .env.example .env        # edita DATABASE_URL y JWT_SECRET
npm install
npm run prisma:migrate      # crea las tablas
npm run seed                # usuarios de prueba
npm run dev                 # http://localhost:4000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev                 # http://localhost:5173 (proxy a la API)
```

## Migrar los datos del sistema anterior

El sistema viejo guardaba todo como blobs JSON en Supabase. Para traer esos datos:

```bash
cd backend
# agrega SUPABASE_URL y SUPABASE_ANON_KEY al .env
npm run migrar:supabase
```

Ver detalles y mapeo de campos en `docs/MIGRACION.md`.

## Convenciones para el equipo

- **Un módulo por dominio** en `backend/src/modules/` (rutas + servicio + esquemas Zod).
- **Toda lista grande se pagina** — nunca devolver tablas completas (`utils/pagination.ts`).
- **Las agregaciones se hacen en SQL** (módulo `reportes`), no descargando datos al navegador.
- **Validación con Zod** en cada endpoint que recibe body.
- **Borrado lógico** (`activo: false`) para entidades con historial; nunca `DELETE` físico de facturas.
- Frontend: una carpeta por feature en `src/features/`, llamadas a la API solo a través de `src/api/`.

## Módulos incluidos (sistema completo)

| Módulo | Backend | Frontend | Roles |
|---|---|---|---|
| Login + JWT | ✅ | ✅ teclado PIN | todos |
| Dashboard | ✅ mi-día, semana | ✅ gráfico + cola offline | vendedor/admin |
| Venta (POS) | ✅ transaccional, idempotente | ✅ offline, descuento, crédito, recibo | vendedor/admin |
| Clientes | ✅ CRUD + GPS | ✅ con captura de ubicación | todos |
| Productos | ✅ CRUD | ✅ admins editan | todos |
| Inventario | ✅ entradas/ajustes/movimientos | ✅ + alerta bajo stock | admin |
| Proveedores | ✅ CRUD | ✅ | admin |
| Facturas | ✅ estados, abonos, anulación con reposición de stock | ✅ recibo imprimible + WhatsApp | todos |
| Entregador | ✅ cola con coordenadas | ✅ lista + mapa + "cómo llegar" | entregador/admin |
| Mapa de rutas | ✅ | ✅ Leaflet, filtro por día de visita | todos |
| Importar Excel | ✅ lotes validados | ✅ SheetJS + plantillas | admin |
| Reportes | ✅ agregaciones SQL | ✅ ranking, cartera, exportar Excel | admin |
| Gastos | ✅ | ✅ | vendedor/admin |
| Usuarios | ✅ | ✅ crear, PIN, activar/desactivar | admin |
| Perfil | ✅ cambio de PIN propio | ✅ | todos |
