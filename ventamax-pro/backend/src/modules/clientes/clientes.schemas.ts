import { z } from 'zod';

export const clienteSchema = z.object({
  nombre: z.string().min(1),
  contacto: z.string().optional(),
  telefono: z.string().optional(),
  direccion: z.string().optional(),
  barrio: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  diaVisita: z.number().int().min(1).max(7).optional(),
  cupoCredito: z.number().min(0).default(0),
});

export const clienteUpdateSchema = clienteSchema.partial();
