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
import { reportesRouter } from './modules/reportes/reportes.routes';
import { proveedoresRouter } from './modules/proveedores/proveedores.routes';
import { inventarioRouter } from './modules/inventario/inventario.routes';
import { importarRouter, importarAutoRouter } from './modules/importar/importar.routes';
import { gastosRouter } from './modules/gastos/gastos.routes';
import { presenciaRouter } from './modules/presencia/presencia.routes';
import { rastreoRouter } from './modules/rastreo/rastreo.routes';
import { regionesRouter, bodegasRouter } from './modules/bodegas/bodegas.routes';
import { tareasRouter } from './modules/tareas/tareas.routes';

export function crearApp() {
  const app = express();

  app.use(helmet());

  // CORS: autoriza los orígenes de CORS_ORIGIN (env) y SIEMPRE el frontend en
  // Cloudflare Pages (apex y cualquier subdominio de deploy *.pages.dev).
  const origenesEnv = env.CORS_ORIGIN.split(',').map(s => s.trim()).filter(Boolean);
  app.use(cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // healthchecks / herramientas sin origin
      const permitido = origenesEnv.includes(origin)
        || /^https:\/\/([a-z0-9-]+\.)?ventamax-frontend\.pages\.dev$/.test(origin);
      cb(null, permitido);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }));

  app.use(express.json({ limit: '5mb' })); // 5mb: las importaciones de Excel llegan como JSON
  app.use(pinoHttp({ autoLogging: process.env.NODE_ENV === 'production' }));

  app.get('/api/salud', (_req, res) => res.json({ ok: true, ts: Date.now() }));

  app.use('/api/auth', authRouter);
  app.use('/api/usuarios', usuariosRouter);
  app.use('/api/clientes', clientesRouter);
  app.use('/api/productos', productosRouter);
  app.use('/api/facturas', facturasRouter);
  app.use('/api/reportes', reportesRouter);
  app.use('/api/proveedores', proveedoresRouter);
  app.use('/api/inventario', inventarioRouter);
  app.use('/api/importar', importarAutoRouter); // auto-import por token (antes del router con login)
  app.use('/api/importar', importarRouter);
  app.use('/api/gastos', gastosRouter);
  app.use('/api/presencia', presenciaRouter);
  app.use('/api/rastreo', rastreoRouter);
  app.use('/api/regiones', regionesRouter);
  app.use('/api/bodegas', bodegasRouter);
  app.use('/api/tareas', tareasRouter);
  app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
  app.use(manejadorErrores);

  return app;
}
