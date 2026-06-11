import { z } from 'zod';

export const productoSchema = z.object({
  codigo: z.string().optional(),
  nombre: z.string().min(1),
  categoria: z.string().optional(),
  precioCompra: z.number().min(0).default(0),
  precioVenta: z.number().min(0),
  stock: z.number().int().default(0),
  stockMinimo: z.number().int().min(0).default(0),
});

export const productoUpdateSchema = productoSchema.partial();
