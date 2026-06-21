import { Router } from 'express';
import { requiereAuth } from '../../middleware/auth';
import { online, registrarLatido } from './presencia.store';

export const presenciaRouter = Router();
presenciaRouter.use(requiereAuth);

// POST /api/presencia/latido — el cliente reporta que sigue activo.
// Puede incluir su GPS: { lat, lng } (los roles de campo lo envían).
presenciaRouter.post('/latido', async (req, res, next) => {
  try {
    const { lat, lng } = req.body ?? {};
    await registrarLatido(
      req.usuario!,
      typeof lat === 'number' ? lat : undefined,
      typeof lng === 'number' ? lng : undefined,
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// GET /api/presencia — lista de usuarios en línea ahora mismo
presenciaRouter.get('/', (_req, res) => {
  const ahora = Date.now();
  const lista = online()
    .map(l => ({
      id: l.id,
      nombre: l.nombre,
      rol: l.rol,
      inicial: l.nombre.trim().charAt(0).toUpperCase() || '?',
      haceSegundos: Math.round((ahora - l.ultimoLatido) / 1000),
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  res.json(lista);
});
