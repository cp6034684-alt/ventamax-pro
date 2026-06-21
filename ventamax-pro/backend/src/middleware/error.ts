import { Request, Response, NextFunction } from 'express';

/** Manejador global de errores: nunca filtra stack traces al cliente. */
export function manejadorErrores(err: any, _req: Request, res: Response, _next: NextFunction) {
  console.error(err);
  // Errores conocidos de Prisma
  if (err?.code === 'P2002') {
    return res.status(409).json({ error: 'Ya existe un registro con ese valor único' });
  }
  if (err?.code === 'P2025') {
    return res.status(404).json({ error: 'Registro no encontrado' });
  }
  res.status(err.status || 500).json({ error: err.expose ? err.message : 'Error interno del servidor' });
}
