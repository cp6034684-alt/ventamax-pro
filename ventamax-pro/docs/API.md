# Referencia de la API

Base: `/api` — Todas las rutas (salvo login) requieren header `Authorization: Bearer <token>`.

## Autenticación
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/auth/login` | `{ usuario, pin }` → `{ token, usuario }` |
| GET | `/auth/yo` | Datos del usuario autenticado |
| PATCH | `/auth/mi-pin` | `{ pinActual, pinNuevo }` — cambiar el propio PIN |

## Clientes
| Método | Ruta | Notas |
|---|---|---|
| GET | `/clientes?busqueda=&dia=&pagina=&porPagina=` | Paginado, máx 100/página |
| GET | `/clientes/:id` | Incluye últimas 10 facturas |
| POST / PUT | `/clientes[/:id]` | Acepta lat/lng para el mapa |
| DELETE | `/clientes/:id` | Borrado lógico — solo ADMIN/COADMIN |

## Productos
| Método | Ruta | Notas |
|---|---|---|
| GET | `/productos?busqueda=&categoria=` | |
| POST / PUT / DELETE | `/productos[/:id]` | Solo ADMIN/COADMIN |

## Facturas
| Método | Ruta | Notas |
|---|---|---|
| GET | `/facturas?desde=&hasta=&estado=&clienteId=&pagina=` | VENDEDOR solo ve las suyas; ENTREGADOR ve la cola PENDIENTE |
| GET | `/facturas/cola-entrega` | Pendientes con coordenadas del cliente (mapa del entregador) |
| POST | `/facturas` | Crear venta — idempotente por `idLocal`, transaccional (stock + cartera) |
| PATCH | `/facturas/:id/estado` | ENTREGADA/PAGADA/ANULADA — anular repone stock y descuenta cartera |
| POST | `/facturas/:id/abono` | `{ monto }` — abono a crédito; actualiza cartera del cliente |

## Inventario
| Método | Ruta | Notas |
|---|---|---|
| GET | `/inventario/bajo-stock` | Productos en o bajo el mínimo |
| GET | `/inventario/movimientos?productoId=&pagina=` | Trazabilidad completa |
| POST | `/inventario/movimientos` | ENTRADA / AJUSTE (conteo físico) / DEVOLUCION — solo admins |

## Proveedores (solo ADMIN/COADMIN)
| GET / POST / PUT / DELETE | `/proveedores[/:id]` | CRUD con borrado lógico |

## Importación masiva (solo ADMIN/COADMIN)
| POST | `/importar/clientes` | `{ filas: [...] }` — hasta 2.000 por lote |
| POST | `/importar/productos` | Omite códigos duplicados |

## Gastos
| GET / POST | `/gastos` | VENDEDOR solo ve los suyos |

## Usuarios (solo ADMIN/COADMIN)
| GET / POST / PATCH | `/usuarios[/:id]` | Crear, cambiar PIN, activar/desactivar, rol, zona |

## Reportes
| GET | `/reportes/resumen?desde=&hasta=` | Ventas, gastos, ranking de vendedores, top productos (ADMIN) |
| GET | `/reportes/semana` | Ventas por día últimos 7 días (propias, o globales si admin) |
| GET | `/reportes/cartera` | Clientes con saldo pendiente (ADMIN) |
| GET | `/reportes/mi-dia` | Resumen de hoy del usuario autenticado |
| GET | `/reportes/exportar-facturas?desde=&hasta=` | Filas planas para Excel, máx 10.000 (ADMIN) |
