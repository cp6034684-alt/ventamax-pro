import { z } from 'zod';

export const clienteSchema = z.object({
  nombre: z.string().min(1),
  contacto: z.string().optional(),
  telefono: z.string().optional(),
  direccion: z.string().optional(),
  barrio: z.string().optional(),
  ciudad: z.string().optional(),
  correo: z.string().optional(),
  nit: z.string().optional(),
  zona: z.string().optional(),
  segmento: z.string().optional(),
  razonSocial: z.string().optional(),
  tipologia: z.string().optional(),
  listaPrecio: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  diaVisita: z.number().int().min(1).max(7).optional(),
  cupoCredito: z.number().min(0).default(0),
});

// Crear cliente: TODOS los datos obligatorios (incluye GPS, correo y dia de visita).
export const clienteCrearSchema = z.object({
  nombre: z.string().min(1),
  nit: z.string().min(1),
  telefono: z.string().min(1),
  direccion: z.string().min(1),
  barrio: z.string().min(1),
  ciudad: z.string().min(1),
  correo: z.string().email(),
  diaVisita: z.number().int().min(1).max(7),
  lat: z.number(),
  lng: z.number(),
  contacto: z.string().optional(),
  razonSocial: z.string().optional(),
  zona: z.string().optional(),
  segmento: z.string().optional(),
  tipologia: z.string().optional(),
  listaPrecio: z.string().optional(),
  cupoCredito: z.number().min(0).default(0),
});

export const clienteUpdateSchema = clienteSchema.partial();
