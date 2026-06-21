import { z } from 'zod';

export const productoSchema = z.object({
  codigo: z.string().optional(),
  nombre: z.string().min(1),
  categoria: z.string().optional(),
  marca: z.string().optional(),
  linea: z.string().optional(),
  segmento: z.string().optional(),
  subsegmento: z.string().optional(),
  unidad: z.string().optional(),
  iva: z.number().min(0).optional(),
  precioCompra: z.number().min(0).default(0),
  precioVenta: z.number().min(0),
  precioGeneral: z.number().min(0).optional(),
  precioMayorista: z.number().min(0).optional(),
  precioTat: z.number().min(0).optional(),
  precioDroguerias: z.number().min(0).optional(),
  precioTatViajeros: z.number().min(0).optional(),
  precioEntreSede: z.number().min(0).optional(),
  stock: z.number().int().default(0),
  stockMinimo: z.number().int().min(0).default(0),
});

export const productoUpdateSchema = productoSchema.partial();
