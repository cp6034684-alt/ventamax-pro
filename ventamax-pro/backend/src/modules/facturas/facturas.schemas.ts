import { z } from 'zod';

export const facturaCrearSchema = z.object({
  clienteId: z.string().uuid(),
  // idLocal: UUID generado en el teléfono del vendedor. Si la red falla
  // y el frontend reintenta, el backend detecta el duplicado y no crea
  // la venta dos veces (idempotencia).
  idLocal: z.string().uuid().optional(),
  descuento: z.number().min(0).default(0),
  metodoPago: z.enum(['EFECTIVO', 'TRANSFERENCIA', 'CREDITO']).optional(),
  notas: z.string().max(500).optional(),
  items: z.array(z.object({
    productoId: z.string().uuid(),
    cantidad: z.number().int().positive(),
  })).min(1, 'La factura debe tener al menos un producto'),
});

export const facturaEstadoSchema = z.object({
  estado: z.enum(['PENDIENTE', 'ENTREGADA', 'PAGADA', 'CREDITO', 'ANULADA']),
  pagado: z.number().min(0).optional(),
});
