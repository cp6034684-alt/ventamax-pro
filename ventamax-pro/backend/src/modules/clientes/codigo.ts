import { db } from '../../config/db';

// Devuelve el mayor código de cliente asignado (0 si no hay ninguno).
// Sirve para generar el siguiente código del sistema (VMX-####).
export async function maxCodigoCliente(): Promise<number> {
  const r = await db.cliente.aggregate({ _max: { codigo: true } });
  return r._max.codigo ?? 0;
}
