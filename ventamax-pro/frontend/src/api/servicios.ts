import { api } from './client';
import type {
  Cliente, Producto, Factura, FacturaEntrega, Paginado, Usuario,
  Proveedor, Gasto, MovimientoStock, ResumenReporte, VentaDia, Cartera,
} from './tipos';

export const authApi = {
  login: (usuario: string, pin: string) =>
    api<{ token: string; usuario: Usuario }>('/auth/login', {
      method: 'POST', body: JSON.stringify({ usuario, pin }),
    }),
  yo: () => api<Usuario & { usuario: string; creadoEn: string }>('/auth/yo'),
  cambiarPin: (pinActual: string, pinNuevo: string) =>
    api<{ ok: boolean }>('/auth/mi-pin', { method: 'PATCH', body: JSON.stringify({ pinActual, pinNuevo }) }),
};

export const clientesApi = {
  listar: (q = '', pagina = 1, porPagina = 50) =>
    api<Paginado<Cliente>>(`/clientes?busqueda=${encodeURIComponent(q)}&pagina=${pagina}&porPagina=${porPagina}`),
  detalle: (id: string) => api<Cliente & { facturas: Factura[] }>(`/clientes/${id}`),
  crear: (datos: Partial<Cliente>) =>
    api<Cliente>('/clientes', { method: 'POST', body: JSON.stringify(datos) }),
  actualizar: (id: string, datos: Partial<Cliente>) =>
    api<Cliente>(`/clientes/${id}`, { method: 'PUT', body: JSON.stringify(datos) }),
  eliminar: (id: string) => api<{ ok: boolean }>(`/clientes/${id}`, { method: 'DELETE' }),
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
    metodoPago?: string; notas?: string; items: { productoId: string; cantidad: number }[];
  }) => api<Factura>('/facturas', { method: 'POST', body: JSON.stringify(datos) }),
  cambiarEstado: (id: string, estado: string, pagado?: number) =>
    api<Factura>(`/facturas/${id}/estado`, { method: 'PATCH', body: JSON.stringify({ estado, pagado }) }),
  abonar: (id: string, monto: number) =>
    api<Factura>(`/facturas/${id}/abono`, { method: 'POST', body: JSON.stringify({ monto }) }),
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
  clientes: (filas: any[]) => api<{ insertados: number }>('/importar/clientes', { method: 'POST', body: JSON.stringify({ filas }) }),
  productos: (filas: any[]) => api<{ insertados: number; omitidos: number }>('/importar/productos', { method: 'POST', body: JSON.stringify({ filas }) }),
};

export const gastosApi = {
  listar: (pagina = 1) => api<Paginado<Gasto>>(`/gastos?pagina=${pagina}`),
  crear: (d: { concepto: string; categoria?: string; monto: number; notas?: string }) =>
    api<Gasto>('/gastos', { method: 'POST', body: JSON.stringify(d) }),
};

export const usuariosApi = {
  listar: () => api<Usuario[]>('/usuarios'),
  crear: (d: { nombre: string; usuario: string; pin: string; rol: string; zona?: string }) =>
    api<Usuario>('/usuarios', { method: 'POST', body: JSON.stringify(d) }),
  actualizar: (id: string, d: Partial<{ pin: string; activo: boolean; zona: string; rol: string }>) =>
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
};
