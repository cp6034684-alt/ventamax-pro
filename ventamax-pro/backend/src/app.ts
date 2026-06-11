import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './config/env';
import { manejadorErrores } from './middleware/error';
import { authRouter } from './modules/auth/auth.routes';
import { usuariosRouter } from './modules/usuarios/usuarios.routes';
import { clientesRouter } from './modules/clientes/clientes.routes';
import { productosRouter } from './modules/productos/productos.routes';
import { facturasRouter } from './modules/facturas/facturas.routes';
import { gastosRouter } from './modules/gastos/gastos.routes';
import { reportesRouter } from './modules/reportes/reportes.routes';
import { proveedoresRouter } from './modules/proveedores/proveedores.routes';
import { inventarioRouter } from './modules/inventario/inventario.routes';
import { importarRouter } from './modules/importar/importar.routes';

export function crearApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN.split(',') }));
  app.use(express.json({ limit: '5mb' })); // 5mb: las importaciones de Excel llegan como JSON
  app.use(pinoHttp({ autoLogging: process.env.NODE_ENV === 'production' }));

  app.get('/api/salud', (_req, res) => res.json({ ok: true, ts: Date.now() }));

  app.use('/api/auth', authRouter);
  app.use('/api/usuarios', usuariosRouter);
  app.use('/api/clientes', clientesRouter);
  app.use('/api/productos', productosRouter);
  app.use('/api/facturas', facturasRouter);
  app.use('/api/gastos', gastosRouter);
  app.use('/api/reportes', reportesRouter);
  app.use('/api/proveedores', proveedoresRouter);
  app.use('/api/inventario', inventarioRouter);
  app.use('/api/importar', importarRouter);

  app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
  app.use(manejadorErrores);

  return app;
}
