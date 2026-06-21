import { Request } from 'express';

/**
 * Paginación obligatoria para tablas grandes (facturas crece ~450k/mes).
 * Nunca devolvemos listados sin límite.
 */
export function leerPaginacion(req: Request, maxPorPagina = 100) {
  const pagina = Math.max(1, parseInt(String(req.query.pagina)) || 1);
  const porPagina = Math.min(maxPorPagina, Math.max(1, parseInt(String(req.query.porPagina)) || 25));
  return { pagina, porPagina, skip: (pagina - 1) * porPagina, take: porPagina };
}

export function respuestaPaginada<T>(datos: T[], total: number, pagina: number, porPagina: number) {
  return {
    datos,
    paginacion: { pagina, porPagina, total, totalPaginas: Math.ceil(total / porPagina) },
  };
}
