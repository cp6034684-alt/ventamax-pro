# Arquitectura de VentaMax Pro

## Por qué se reestructuró

El sistema anterior era **un solo archivo HTML de 18.000 líneas** con tres problemas de fondo:

1. **Escalabilidad**: Supabase se usaba como almacén clave-valor — TODAS las facturas
   vivían en un único JSON. Cada venta nueva reescribía el blob completo. Con 450.000
   facturas/mes ese blob superaría cientos de MB y cada venta tardaría minutos o fallaría.
2. **Seguridad**: la API key estaba en el HTML y la tabla era pública — cualquier persona
   con el archivo podía leer, modificar o borrar toda la base de datos. El PIN se validaba
   en el navegador (puenteable) y se guardaba en texto plano.
3. **Trabajo en equipo**: imposible que dos personas editaran el mismo archivo de 1.7 MB
   sin conflictos constantes.

## Decisiones técnicas

| Decisión | Razón |
|---|---|
| **PostgreSQL** + tablas normalizadas | 5.4 M facturas/año exigen índices reales. `facturas` tiene índices por vendedor+fecha, cliente+fecha, estado+fecha. |
| **Node.js + TypeScript en todo el stack** | Un solo lenguaje: cualquier dev del equipo puede tocar backend y frontend. |
| **Express + capas (rutas → servicio → Prisma)** | Patrón simple y conocido; cada módulo es autocontenido. |
| **JWT con PIN hasheado (bcrypt)** | El servidor valida la identidad; el rol viaja firmado en el token y se verifica en cada request. |
| **Paginación obligatoria** | Ningún endpoint devuelve tablas completas. |
| **Idempotencia con `idLocal`** | El vendedor en campo puede reintentar una venta sin riesgo de duplicarla. |
| **React Query** | Caché y revalidación de datos sin estado global complejo. |

## Flujo de una venta (caso crítico)

```
Vendedor (móvil, señal intermitente)
  └─ POST /api/facturas  { clienteId, idLocal: uuid, items[] }
       ├─ ¿Ya existe idLocal? → devolver la factura existente (no duplica)
       └─ Transacción SQL:
            1. Congelar precios actuales en factura_items
            2. Crear factura con consecutivo automático
            3. Descontar stock + registrar movimientos
            4. Si es crédito → sumar saldoPendiente del cliente
  Si la red falla → la venta entra a la cola offline del navegador
  y se reenvía sola al detectar conexión (evento `online`).
```

## Cómo agregar un módulo nuevo (patrón)

1. Crear `backend/src/modules/<dominio>/` con tres archivos:
   - `<dominio>.schemas.ts` — validación Zod del body
   - `<dominio>.service.ts` — lógica de negocio (transacciones aquí)
   - `<dominio>.routes.ts` — endpoints, siempre con `requiereAuth` y paginación
2. Registrar el router en `src/app.ts`.
3. En el frontend: carpeta `src/features/<dominio>/` + funciones en `src/api/servicios.ts`.

## Escalamiento futuro (cuando crezca el volumen)

- **Particionar `facturas` por mes** (PostgreSQL native partitioning) cuando supere ~10 M filas.
- **Réplica de lectura** para reportes pesados.
- **Tabla de agregados diarios** (ventas_por_dia) materializada por un job nocturno,
  para que los dashboards no recorran millones de filas.
- Mover la cola offline del frontend a **IndexedDB + Service Worker** (PWA completa)
  para sobrevivir cierres del navegador.
