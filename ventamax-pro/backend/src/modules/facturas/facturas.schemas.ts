import { z } from 'zod';

export const facturaCrearSchema = z.object({
  clienteId: z.string().uuid(),
  // idLocal: UUID generado en el teléfono del vendedor. Si la red falla
  // y el frontend reintenta, el backend detecta el duplicado y no crea
  // la venta dos veces (idempotencia).
  idLocal: z.string().uuid().optional(),
  descuento: z.number().min(0).default(0),
  metodoPago: z.enum(['EFECTIVO', 'TRANSFERENCIA', 'CREDITO']).optional(),
  listaPrecio: z.enum(['GENERAL', 'MAYORISTA', 'TAT', 'DROGUERIAS', 'TAT_VIAJEROS', 'ENTRE_SEDE']).optional(),
  notas: z.string().max(500).optional(),
  items: z.array(z.object({
    productoId: z.string().uuid(),
    cantidad: z.number().int().positive(),
  })).min(1, 'La factura debe tener al menos un producto'),
});

// Devolución (nota crédito): mismos productos, se registran como negativos.
export const devolucionCrearSchema = z.object({
  clienteId: z.string().uuid(),
  listaPrecio: z.enum(['GENERAL', 'MAYORISTA', 'TAT', 'DROGUERIAS', 'TAT_VIAJEROS', 'ENTRE_SEDE']).optional(),
  notas: z.string().max(500).optional(),
  items: z.array(z.object({
    productoId: z.string().uuid(),
    cantidad: z.number().int().positive(),
  })).min(1, 'La devolución debe tener al menos un producto'),
});

export const facturaEstadoSchema = z.object({
  estado: z.enum(['PENDIENTE', 'ENTREGADA', 'PAGADA', 'CREDITO', 'DEVUELTA', 'ANULADA']),
  pagado: z.number().min(0).optional(),
});

// Devolución TOTAL o PARCIAL sobre una venta (la registra el entregador/admin).
export const devolverSchema = z.object({
  tipo: z.enum(['PARCIAL', 'TOTAL']),
  causal: z.string().min(1),
  obs: z.string().max(500).optional(),
  items: z.array(z.object({
    productoId: z.string().uuid(),
    cantidad: z.number().int().positive(),
  })).optional(),
});

// Editar un pedido pendiente.
export const facturaEditarSchema = z.object({
  items: z.array(z.object({
    productoId: z.string().uuid(),
    cantidad: z.number().int().positive(),
  })).min(1, 'El pedido debe tener al menos un producto'),
  descuento: z.number().min(0).optional(),
  metodoPago: z.enum(['EFECTIVO', 'TRANSFERENCIA', 'CREDITO']).optional(),
  notas: z.string().max(500).optional(),
});
