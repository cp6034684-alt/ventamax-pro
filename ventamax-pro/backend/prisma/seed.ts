import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const db = new PrismaClient();

async function main() {
  const pin = await bcrypt.hash('1234', 10);

  await db.usuario.upsert({
    where: { usuario: 'admin' },
    update: {},
    create: { nombre: 'Administrador', usuario: 'admin', pinHash: pin, rol: 'ADMIN' },
  });
  await db.usuario.upsert({
    where: { usuario: 'vendedor1' },
    update: {},
    create: { nombre: 'Vendedor Demo', usuario: 'vendedor1', pinHash: pin, rol: 'VENDEDOR', zona: 'Centro' },
  });

  console.log('✅ Seed listo. Usuarios: admin / vendedor1 — PIN: 1234 (cámbialo en producción)');
}

main().finally(() => db.$disconnect());
