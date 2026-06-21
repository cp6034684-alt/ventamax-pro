import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

/** Valida req.body contra un esquema Zod y devuelve 400 con detalles si falla. */
export function validarBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Datos inválidos',
        detalles: result.error.issues.map(i => ({
          campo: i.path.join('.'),
          mensaje: i.message,
        })),
      });
    }
    req.body = result.data;
    next();
  };
}
