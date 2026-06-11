import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface UsuarioToken {
  id: string;
  rol: 'ADMIN' | 'COADMIN' | 'VENDEDOR' | 'ENTREGADOR';
  nombre: string;
}

declare global {
  namespace Express {
    interface Request {
      usuario?: UsuarioToken;
    }
  }
}

/** Exige un JWT válido en el header Authorization: Bearer <token>. */
export function requiereAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }
  try {
    req.usuario = jwt.verify(header.slice(7), env.JWT_SECRET) as UsuarioToken;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

/** Restringe la ruta a ciertos roles. Úsalo después de requiereAuth. */
export function requiereRol(...roles: UsuarioToken['rol'][]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.usuario || !roles.includes(req.usuario.rol)) {
      return res.status(403).json({ error: 'No tienes permiso para esta acción' });
    }
    next();
  };
}
