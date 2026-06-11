import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../../config/db';
import { env } from '../../config/env';

export async function login(usuario: string, pin: string) {
  const u = await db.usuario.findUnique({ where: { usuario } });
  if (!u || !u.activo) return null;

  const pinValido = await bcrypt.compare(pin, u.pinHash);
  if (!pinValido) return null;

  const token = jwt.sign(
    { id: u.id, rol: u.rol, nombre: u.nombre },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRA } as jwt.SignOptions,
  );

  return {
    token,
    usuario: { id: u.id, nombre: u.nombre, rol: u.rol, zona: u.zona },
  };
}
