import 'dotenv/config';
import { z } from 'zod';

// Valida las variables de entorno al arrancar: si falta algo,
// la app falla de inmediato con un mensaje claro.
const esquema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET debe tener al menos 16 caracteres'),
  JWT_EXPIRA: z.string().default('12h'),
  PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  IMPORT_TOKEN: z.string().default(''), // token para el auto-import del inventario
});

export const env = esquema.parse(process.env);
