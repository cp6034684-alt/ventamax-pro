/**
 * Migración única: lee los blobs JSON de la tabla `ventamax_data`
 * del Supabase antiguo y los inserta en las tablas normalizadas.
 *
 * Uso:
 *   1. Configura SUPABASE_URL y SUPABASE_ANON_KEY en backend/.env
 *   2. npm run migrar:supabase
 *
 * Es idempotente para usuarios (upsert) y omite facturas ya migradas.
 * Ajusta el mapeo de campos según tus datos reales — imprime una
 * muestra de cada entidad antes de insertar.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const db = new PrismaClient();
const URL = process.env.SUPABASE_URL!;
const KEY = process.env.SUPABASE_ANON_KEY!;

async function leerClave(k: string): Promise<any[]> {
  const r = await fetch(`${URL}/rest/v1/ventamax_data?select=value&key=eq.${k}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  const rows = await r.json();
  if (!rows?.[0]?.value) return [];
  const v = rows[0].value;
  return typeof v === 'string' ? JSON.parse(v) : v;
}

async function main() {
  console.log('→ Leyendo datos del Supabase antiguo…');
  const [usuarios, clientes, productos, facturas] = await Promise.all([
    leerClave('users'), leerClave('clientes'), leerClave('productos'), leerClave('facturas'),
  ]);
  console.log(`  usuarios: ${usuarios.length}, clientes: ${clientes.length}, productos: ${productos.length}, facturas: ${facturas.length}`);
  console.log('  Muestra cliente:', JSON.stringify(clientes[0])?.slice(0, 300));
  console.log('  Muestra factura:', JSON.stringify(facturas[0])?.slice(0, 300));

  // 1. Usuarios — el PIN antiguo estaba en texto plano; aquí se hashea.
  const mapaUsuarios = new Map<string, string>(); // idViejo → idNuevo
  for (const u of usuarios) {
    const creado = await db.usuario.upsert({
      where: { usuario: String(u.usuario ?? u.nombre).toLowerCase().replace(/\s+/g, '') },
      update: {},
      create: {
        nombre: u.nombre ?? 'Sin nombre',
        usuario: String(u.usuario ?? u.nombre).toLowerCase().replace(/\s+/g, ''),
        pinHash: await bcrypt.hash(String(u.pin ?? '0000'), 10),
        rol: (String(u.rol ?? 'vendedor').toUpperCase() as any),
        zona: u.zona ?? null,
      },
    });
    mapaUsuarios.set(String(u.id), creado.id);
  }

  // 2. Clientes
  const mapaClientes = new Map<string, string>();
  for (const c of clientes) {
    const creado = await db.cliente.create({
      data: {
        nombre: c.nombre ?? 'Sin nombre',
        contacto: c.contacto ?? null,
        telefono: c.telefono ?? null,
        direccion: c.direccion ?? null,
        barrio: c.barrio ?? null,
        lat: c.lat ?? null,
        lng: c.lng ?? null,
      },
    });
    mapaClientes.set(String(c.id), creado.id);
  }

  // 3. Productos
  const mapaProductos = new Map<string, string>();
  for (const p of productos) {
    const creado = await db.producto.create({
      data: {
        nombre: p.nombre ?? 'Sin nombre',
        codigo: p.codigo || null,
        categoria: p.categoria ?? null,
        precioCompra: Number(p.precioCompra ?? p.costo ?? 0),
        precioVenta: Number(p.precioVenta ?? p.precio ?? 0),
        stock: Number(p.stock ?? 0),
      },
    });
    mapaProductos.set(String(p.id), creado.id);
  }

  // 4. Facturas + items (por lotes)
  let migradas = 0, omitidas = 0;
  for (const f of facturas) {
    const clienteId = mapaClientes.get(String(f.clienteId ?? f.cliente));
    const vendedorId = mapaUsuarios.get(String(f.vendedorId ?? f.vendedor));
    if (!clienteId || !vendedorId) { omitidas++; continue; }

    const items = (f.items ?? f.productos ?? []).map((i: any) => ({
      productoId: mapaProductos.get(String(i.productoId ?? i.id))!,
      cantidad: Number(i.cantidad ?? 1),
      precioUnit: Number(i.precio ?? i.precioUnit ?? 0),
      total: Number(i.total ?? (i.precio ?? 0) * (i.cantidad ?? 1)),
    })).filter((i: any) => i.productoId);

    await db.factura.create({
      data: {
        clienteId, vendedorId,
        idLocal: f.id ? String(f.id) : undefined,
        subtotal: Number(f.subtotal ?? f.total ?? 0),
        descuento: Number(f.descuento ?? 0),
        total: Number(f.total ?? 0),
        pagado: Number(f.pagado ?? f.total ?? 0),
        estado: f.anulada ? 'ANULADA' : (f.credito ? 'CREDITO' : 'PAGADA'),
        creadoEn: f.fecha ? new Date(f.fecha) : new Date(),
        items: { create: items },
      },
    });
    migradas++;
  }

  console.log(`✅ Migración completa. Facturas migradas: ${migradas}, omitidas (sin cliente/vendedor): ${omitidas}`);
}

main().catch(console.error).finally(() => db.$disconnect());
