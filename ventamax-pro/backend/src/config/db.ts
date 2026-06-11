import { PrismaClient } from '@prisma/client';

// Una sola instancia de Prisma para toda la app (pool de conexiones).
export const db = new PrismaClient({
  log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
});
