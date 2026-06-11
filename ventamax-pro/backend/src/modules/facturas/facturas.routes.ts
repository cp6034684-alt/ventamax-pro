import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { db } from '../../config/db';
import { requiereAuth, requiereRol } from '../../middleware/auth';
import { validarBody } from '../../middleware/validate';
import { leerPaginacion, respuestaPaginada } from '../../utils/pagination';
import { facturaCrearSchema, facturaEstadoSchema } from './facturas.schemas';
import { crearFactura } from './facturas.service';

const abonoSchema = z.object({ monto: z.number().positive() });

export const facturasRouter = Router();
facturasRouter.use(requiereAuth);

// GET /api/facturas/cola-entrega — pendientes con coordenadas del cliente (mapa del entregador)
facturasRouter.get('/cola-entrega', async (_req, res, next) => {
  try {
    const datos = await db.factura.findMany({
      where: { estado: 'PENDIENTE' },
      orderBy: { creadoEn: 'asc' },
      take: 200,
      include: {
        cliente: { select: { id: true, nombre: true, direccion: true, barrio: true, telefono: true, lat: true, lng: true } },
        vendedor: { select: { nombre: true } },
        items: { include: { producto: { select: { nombre: true } } } },
      },
    });
    res.json(datos);
  } catch (e) { next(e); }
});

// GET /api/facturas?desde=&hasta=&estado=&clienteId=&vendedorId=&pagina=
// Un VENDEDOR solo ve sus propias facturas; ADMIN/COADMIN ven todas.
facturasRouter.get('/', async (req, res, next) => {
  try {
    const { pagina, porPagina, skip, take } = leerPaginacion(req);
    const where: any = {};

    if (req.usuario!.rol === 'VENDEDOR') {
      where.vendedorId = req.usuario!.id;
    } else if (req.query.vendedorId) {
      where.vendedorId = String(req.query.vendedorId);
    }
    if (req.usuario!.rol === 'ENTREGADOR') {
      where.estado = 'PENDIENTE'; // el entregador ve su cola
    } else if (req.query.estado) {
      where.estado = String(req.query.estado);
    }
    if (req.query.clienteId) where.clienteId = String(req.query.clienteId);
    if (req.query.desde || req.query.hasta) {
      where.creadoEn = {};
      if (req.query.desde) where.creadoEn.gte = new Date(String(req.query.desde));
      if (req.query.hasta) where.creadoEn.lte = new Date(String(req.query.hasta) + 'T23:59:59');
    }

    const [datos, total] = await Promise.all([
      db.factura.findMany({
        where, skip, take,
        orderBy: { creadoEn: 'desc' },
        include: {
          cliente: { select: { nombre: true, barrio: true, telefono: true } },
          vendedor: { select: { nombre: true } },
          items: { include: { producto: { select: { nombre: true } } } },
        },
      }),
      db.factura.count({ where }),
    ]);
    res.json(respuestaPaginada(datos, total, pagina, porPagina));
  } catch (e) { next(e); }
});

// POST /api/facturas — crear venta (vendedores y admins)
facturasRouter.post('/', requiereRol('VENDEDOR', 'ADMIN', 'COADMIN'), validarBody(facturaCrearSchema), async (req, res, next) => {
  try {
    const { factura, duplicada } = await crearFactura(req.usuario!.id, req.body);
    res.status(duplicada ? 200 : 201).json(factura);
  } catch (e) { next(e); }
});

// PATCH /api/facturas/:id/estado — entregar, marcar pagada, anular
facturasRouter.patch('/:id/estado', validarBody(facturaEstadoSchema), async (req, res, next) => {
  try {
    // Anular repone el stock de los productos (transaccional)
    if (req.body.estado === 'ANULADA') {
      const anulada = await db.$transaction(async (tx: Prisma.TransactionClient) => {
        const f = await tx.factura.findUnique({ where: { id: req.params.id }, include: { items: true } });
        if (!f) throw Object.assign(new Error('Factura no encontrada'), { status: 404, expose: true });
        if (f.estado === 'ANULADA') return f;

        for (const i of f.items) {
          await tx.producto.update({ where: { id: i.productoId }, data: { stock: { increment: i.cantidad } } });
          await tx.movimientoStock.create({
            data: { productoId: i.productoId, tipo: 'DEVOLUCION', cantidad: i.cantidad, motivo: `Anulación factura #${f.consecutivo}`, facturaId: f.id },
          });
        }
        // Si era crédito, descontar el saldo no pagado de la cartera del cliente
        const saldo = Number(f.total) - Number(f.pagado);
        if (f.estado === 'CREDITO' && saldo > 0) {
          await tx.cliente.update({ where: { id: f.clienteId }, data: { saldoPendiente: { decrement: saldo } } });
        }
        return tx.factura.update({ where: { id: f.id }, data: { estado: 'ANULADA' } });
      });
      return res.json(anulada);
    }

    const data: any = { estado: req.body.estado };
    if (req.body.estado === 'ENTREGADA') {
      data.entregadoEn = new Date();
      data.entregadorId = req.usuario!.id;
    }
    if (req.body.pagado !== undefined) data.pagado = req.body.pagado;
    res.json(await db.factura.update({ where: { id: req.params.id }, data }));
  } catch (e) { next(e); }
});

// POST /api/facturas/:id/abono — registrar abono a una factura a crédito
facturasRouter.post('/:id/abono', validarBody(abonoSchema), async (req, res, next) => {
  try {
    const resultado = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const f = await tx.factura.findUnique({ where: { id: req.params.id } });
      if (!f) throw Object.assign(new Error('Factura no encontrada'), { status: 404, expose: true });
      const saldo = Number(f.total) - Number(f.pagado);
      const monto = Math.min(req.body.monto, saldo);
      if (monto <= 0) throw Object.assign(new Error('La factura ya está pagada'), { status: 400, expose: true });

      const nuevoPagado = Number(f.pagado) + monto;
      const pagadaCompleta = nuevoPagado >= Number(f.total);

      const actualizada = await tx.factura.update({
        where: { id: f.id },
        data: { pagado: nuevoPagado, estado: pagadaCompleta ? 'PAGADA' : f.estado },
      });
      await tx.cliente.update({
        where: { id: f.clienteId },
        data: { saldoPendiente: { decrement: monto } },
      });
      return actualizada;
    });
    res.json(resultado);
  } catch (e) { next(e); }
});
