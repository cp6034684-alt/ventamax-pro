import { z } from 'zod';

export const loginSchema = z.object({
  usuario: z.string().min(1, 'Usuario requerido'),
  pin: z.string().regex(/^\d{4,6}$/, 'El PIN debe tener entre 4 y 6 dígitos'),
});
