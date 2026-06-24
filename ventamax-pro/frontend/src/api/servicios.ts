import { api } from './client';
import type {
  Cliente, Producto, Factura, FacturaEntrega, Paginado, Usuario,
  Proveedor, MovimientoStock, ResumenReporte, VentaDia, Cartera,
  Periodo, RankingAsesores, PanelAdmin, Presente, BarrioFaceta, ClienteDetalle, ClienteMapa,
  VendedorRastreo, PosicionViva, Recorrido, RecorridoVendedor, Indicadores, Region, Bodega, GrupoDuplicado,
  DashboardHistorico, Rentabilidad, Tarea, DashboardEjecutivo, ComparativoMes, CarteraDetalle, CompararMeses,
} from './tipos';

export const authApi = {
  login: (usuario: string, pin: string) =>
    api<{ token: string; usuario: Usuario }>('/auth/login', {
      method: 'POST', body: JSON.stringify({ usuario, pin }),
    }),
  yo: () => api<Usuario & { usuario: string; creadoEn: string }>('/auth/yo'),
  logout: () => api<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  cambiarPin: (pinActual: string, pinNuevo: string) =>
    api<{ ok: boolean }>('/auth/mi-pin', { method: 'PATCH', body: JSON.stringify({ pinActual, pinNuevo }) }),
};

export const clientesApi = {
  listar: (q = '', pagina = 1, porPagina = 50, filtros: { dia?: number; barrio?: string } = {}) => {
    const p = new URLSearchParams({ busqueda: q, pagina: String(pagina), porPagina: String(porPagina) });
    if (filtros.dia) p.set('dia', String(filtros.dia));
    if (filtros.barrio) p.set('barrio', filtros.barrio);
    return api<Paginado<Cliente>>(`/clientes?${p}`);
  },
  barrios: (dia?: number) => api<BarrioFaceta[]>(`/clientes/barrios${dia ? `?dia=${dia}` : ''}`),
  mapa: (dia?: number) => api<ClienteMapa[]>(`/clientes/mapa${dia ? `?dia=${dia}` : ''}`),
  noCompra: (id: string, causal: string, notas?: string) =>
    api<{ ok: boolean }>(`/clientes/${id}/no-compra`, { method: 'POST', body: JSON.stringify({ causal, notas }) }),
  detalle: (id: string) => api<ClienteDetalle>(`/clientes/${id}`),
  crear: (datos: Partial<Cliente>) =>
    api<Cliente>('/clientes', { method: 'POST', body: JSON.stringify(datos) }),
  actualizar: (id: string, datos: Partial<Cliente>) =>
    api<Cliente>(`/clientes/${id}`, { method: 'PUT', body: JSON.stringify(datos) }),
  eliminar: (id: string) => api<{ ok: boolean }>(`/clientes/${id}`, { method: 'DELETE' }),
  duplicados: () => api<GrupoDuplicado[]>('/clientes/duplicados'),
  fusionar: (mantenerId: string, eliminarIds: string[]) =>
    api<{ fusionados: number }>('/clientes/fusionar', { method: 'POST', body: JSON.stringify({ mantenerId, eliminarIds }) }),
};

export const productosApi = {
  listar: (q = '') => api<Paginado<Producto>>(`/productos?busqueda=${encodeURIComponent(q)}&porPagina=200`),
  crear: (datos: Partial<Producto>) =>
    api<Producto>('/productos', { method: 'POST', body: JSON.stringify(datos) }),
  actualizar: (id: string, datos: Partial<Producto>) =>
    api<Producto>(`/productos/${id}`, { method: 'PUT', body: JSON.stringify(datos) }),
  eliminar: (id: string) => api<{ ok: boolean }>(`/productos/${id}`, { method: 'DELETE' }),
};

export const facturasApi = {
  listar: (params: Record<string, string> = {}) =>
    api<Paginado<Factura>>(`/facturas?${new URLSearchParams(params)}`),
  colaEntrega: () => api<FacturaEntrega[]>('/facturas/cola-entrega'),
  crear: (datos: {
    clienteId: string; idLocal: string; descuento?: number;
    metodoPago?: string; listaPrecio?: string; notas?: string; items: { productoId: string; cantidad: number }[];
  }) => api<Factura>('/facturas', { method: 'POST', body: JSON.stringify(datos) }),
  cambiarEstado: (id: string, estado: string, pagado?: number) =>
    api<Factura>(`/facturas/${id}/estado`, { method: 'PATCH', body: JSON.stringify({ estado, pagado }) }),
  abonar: (id: string, monto: number) =>
    api<Factura>(`/facturas/${id}/abono`, { method: 'POST', body: JSON.stringify({ monto }) }),
  devolucion: (datos: { clienteId: string; listaPrecio?: string; notas?: string; items: { productoId: string; cantidad: number }[] }) =>
    api<Factura>('/facturas/devolucion', { method: 'POST', body: JSON.stringify(datos) }),
  devolver: (id: string, datos: { tipo: 'PARCIAL' | 'TOTAL'; causal: string; obs?: string; items?: { productoId: string; cantidad: number }[] }) =>
    api<Factura>(`/facturas/${id}/devolver`, { method: 'POST', body: JSON.stringify(datos) }),
  revivir: (id: string) =>
    api<{ solicitado: boolean; factura: Factura }>(`/facturas/${id}/revivir`, { method: 'POST' }),
  editar: (id: string, datos: { items: { productoId: string; cantidad: number }[]; descuento?: number; metodoPago?: string; notas?: string }) =>
    api<Factura>(`/facturas/${id}`, { method: 'PUT', body: JSON.stringify(datos) }),
  solicitudesRevivir: () => api<Factura[]>('/facturas/solicitudes-revivir'),
};

export const tareasApi = {
  listar: (params: Record<string, string> = {}) => api<Tarea[]>(`/tareas?${new URLSearchParams(params)}`),
  programar: (d: { nombre: string; entregadorId: string; facturaIds: string[] }) =>
    api<Tarea>('/tareas', { method: 'POST', body: JSON.stringify(d) }),
  completar: (id: string) => api<Tarea>(`/tareas/${id}`, { method: 'PATCH', body: JSON.stringify({ estado: 'completada' }) }),
  editar: (id: string, d: { nombre?: string; entregadorId?: string; facturaIds?: string[] }) =>
    api<Tarea>(`/tareas/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
  eliminar: (id: string) => api<{ ok: boolean }>(`/tareas/${id}`, { method: 'DELETE' }),
};

export const proveedoresApi = {
  listar: (q = '') => api<Proveedor[]>(`/proveedores?busqueda=${encodeURIComponent(q)}`),
  crear: (d: Partial<Proveedor>) => api<Proveedor>('/proveedores', { method: 'POST', body: JSON.stringify(d) }),
  actualizar: (id: string, d: Partial<Proveedor>) =>
    api<Proveedor>(`/proveedores/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
  eliminar: (id: string) => api<{ ok: boolean }>(`/proveedores/${id}`, { method: 'DELETE' }),
};

export const inventarioApi = {
  bajoStock: () => api<Producto[]>('/inventario/bajo-stock'),
  movimientos: (productoId = '', pagina = 1) =>
    api<Paginado<MovimientoStock>>(`/inventario/movimientos?productoId=${productoId}&pagina=${pagina}`),
  registrar: (d: { productoId: string; tipo: 'ENTRADA' | 'AJUSTE' | 'DEVOLUCION'; cantidad: number; motivo?: string }) =>
    api<{ producto: Producto }>('/inventario/movimientos', { method: 'POST', body: JSON.stringify(d) }),
};

export const importarApi = {
  clientes: (filas: any[], asignarCodigo = false) =>
    api<{ insertados: number }>('/importar/clientes', { method: 'POST', body: JSON.stringify({ filas, asignarCodigo }) }),
  productos: (filas: any[]) => api<{ insertados: number; omitidos: number }>('/importar/productos', { method: 'POST', body: JSON.stringify({ filas }) }),
  listasCliente: (filas: any[]) => api<{ actualizados: number; listas: number; invalidas: number }>('/importar/listas-cliente', { method: 'POST', body: JSON.stringify({ filas }) }),
  inventario: (bodegaId: string, filas: any[], archivo?: string) => api<{ actualizados: number; creados: number; cargaId: string | null }>('/importar/inventario', { method: 'POST', body: JSON.stringify({ bodegaId, filas, archivo }) }),
  revertirCarga: (id: string) => api<{ revertida: boolean; items: number }>(`/importar/inventario/cargas/${id}/revertir`, { method: 'POST' }),
  precios: (filas: any[]) => api<{ actualizados: number; recibidos: number }>('/importar/precios', { method: 'POST', body: JSON.stringify({ filas }) }),
  vendedores: (filas: any[]) => api<{ creados: number; omitidos: number }>('/importar/vendedores', { method: 'POST', body: JSON.stringify({ filas }) }),

};

export const usuariosApi = {
  listar: () => api<Usuario[]>('/usuarios'),
  siguienteTicket: (ciudad: string, canal: string) => api<{ ticket: string }>(`/usuarios/siguiente-ticket?ciudad=${encodeURIComponent(ciudad)}&canal=${encodeURIComponent(canal)}`),
  crear: (d: { nombre: string; usuario: string; pin: string; rol: string; zona?: string; documento?: string; ciudad?: string; telefono?: string; canal?: string; meta?: number; listasPrecios?: string[]; regionId?: string | null; supervisorId?: string | null }) =>
    api<Usuario>('/usuarios', { method: 'POST', body: JSON.stringify(d) }),
  actualizar: (id: string, d: Partial<{ nombre: string; pin: string; activo: boolean; zona: string; documento: string; ciudad: string; telefono: string; meta: number; rol: string; canal: string; listasPrecios: string[]; regionId: string | null; supervisorId: string | null }>) =>
    api<Usuario>(`/usuarios/${id}`, { method: 'PATCH', body: JSON.stringify(d) }),
};

export const reportesApi = {
  miDia: () => api<{ ventasHoy: number; totalHoy: string }>('/reportes/mi-dia'),
  semana: () => api<VentaDia[]>('/reportes/semana'),
  resumen: (desde: string, hasta: string) =>
    api<ResumenReporte>(`/reportes/resumen?desde=${desde}&hasta=${hasta}`),
  cartera: () => api<Cartera>('/reportes/cartera'),
  exportarFacturas: (desde: string, hasta: string) =>
    api<any[]>(`/reportes/exportar-facturas?desde=${desde}&hasta=${hasta}`),
  exportarDetallado: (desde: string, hasta: string) =>
    api<{ desde: string; hasta: string; filas: any[] }>(`/reportes/exportar-detallado?desde=${desde}&hasta=${hasta}`),
  asesores: (periodo: Periodo) => api<RankingAsesores>(`/reportes/asesores?periodo=${periodo}`),
  panel: () => api<PanelAdmin>('/reportes/panel'),
  dashboard: (periodo: string, desde?: string, hasta?: string) => {
    const q = new URLSearchParams({ periodo });
    if (desde) q.set('desde', desde);
    if (hasta) q.set('hasta', hasta);
    return api<DashboardHistorico>(`/reportes/dashboard?${q.toString()}`);
  },
  indicadores: (p: { periodo?: string; desde?: string; hasta?: string; vendedorId?: string }) => {
    const q = new URLSearchParams();
    Object.entries(p).forEach(([k, v]) => { if (v) q.set(k, String(v)); });
    return api<Indicadores>(`/reportes/indicadores?${q.toString()}`);
  },
  comparativo: () => api<ComparativoMes>('/reportes/comparativo'),
  carteraDetalle: () => api<CarteraDetalle>('/reportes/cartera-detalle'),
  mesesDisponibles: () => api<string[]>('/reportes/meses-disponibles'),
  compararMeses: (meses: string[]) => api<CompararMeses>(`/reportes/comparar-meses?meses=${encodeURIComponent(meses.join(','))}`),
  ejecutivo: (p: { periodo?: string; desde?: string; hasta?: string; meses?: number }) => {
    const q = new URLSearchParams();
    if (p.periodo) q.set('periodo', p.periodo);
    if (p.desde) q.set('desde', p.desde);
    if (p.hasta) q.set('hasta', p.hasta);
    if (p.meses) q.set('meses', String(p.meses));
    return api<DashboardEjecutivo>(`/reportes/ejecutivo?${q.toString()}`);
  },
  actividad: (p: { usuarioId?: string; tipo?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (p.usuarioId) q.set('usuarioId', p.usuarioId);
    if (p.tipo) q.set('tipo', p.tipo);
    if (p.limit) q.set('limit', String(p.limit));
    return api<import('./tipos').Actividad[]>(`/reportes/actividad?${q.toString()}`);
  },
  rentabilidad: (periodo: string, desde?: string, hasta?: string) => {
    const q = new URLSearchParams({ periodo });
    if (desde) q.set('desde', desde);
    if (hasta) q.set('hasta', hasta);
    return api<Rentabilidad>(`/reportes/rentabilidad?${q.toString()}`);
  },
};

export const presenciaApi = {
  latido: (coords?: { lat: number; lng: number }) =>
    api<{ ok: boolean }>('/presencia/latido', {
      method: 'POST',
      body: JSON.stringify(coords ?? {}),
    }),
  enLinea: () => api<Presente[]>('/presencia'),
};

export const regionesApi = {
  listar: () => api<Region[]>('/regiones'),
  crear: (nombre: string) => api<Region>('/regiones', { method: 'POST', body: JSON.stringify({ nombre }) }),
  actualizar: (id: string, d: { bodegaPrincipalId?: string | null }) => api<Region>(`/regiones/${id}`, { method: 'PATCH', body: JSON.stringify(d) }),
};

export const bodegasApi = {
  listar: () => api<Bodega[]>('/bodegas'),
  crear: (d: { nombre: string; codigo?: string; ciudad?: string; direccion?: string; regionId?: string }) =>
    api<Bodega>('/bodegas', { method: 'POST', body: JSON.stringify(d) }),
  actualizar: (id: string, d: Partial<{ nombre: string; codigo: string; ciudad: string; direccion: string; regionId: string; activo: boolean }>) =>
    api<Bodega>(`/bodegas/${id}`, { method: 'PATCH', body: JSON.stringify(d) }),
  eliminar: (id: string) => api<{ ok: boolean }>(`/bodegas/${id}`, { method: 'DELETE' }),
};

export const rastreoApi = {
  vendedores: () => api<VendedorRastreo[]>('/rastreo/vendedores'),
  vivo: () => api<PosicionViva[]>('/rastreo/vivo'),
  recorrido: (vendedorId: string, fecha: string) =>
    api<Recorrido>(`/rastreo/recorrido?vendedorId=${vendedorId}&fecha=${fecha}`),
  recorridos: (fecha: string) => api<RecorridoVendedor[]>(`/rastreo/recorridos?fecha=${fecha}`),
};
