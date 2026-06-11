export type Rol = 'ADMIN' | 'COADMIN' | 'VENDEDOR' | 'ENTREGADOR';

export interface Usuario {
  id: string; nombre: string; rol: Rol; zona?: string | null;
  usuario?: string; activo?: boolean;
}

export interface Cliente {
  id: string; nombre: string; contacto?: string; telefono?: string;
  direccion?: string; barrio?: string; diaVisita?: number;
  cupoCredito?: string; saldoPendiente: string;
  lat?: number | null; lng?: number | null;
}

export interface Producto {
  id: string; codigo?: string; nombre: string; categoria?: string;
  precioCompra?: string; precioVenta: string; stock: number; stockMinimo: number;
}

export interface FacturaItem {
  productoId: string; cantidad: number; precioUnit: string; total: string;
  producto?: { nombre: string };
}

export interface Factura {
  id: string; consecutivo: number; estado: string;
  subtotal: string; descuento: string; total: string; pagado: string;
  metodoPago?: string; notas?: string; creadoEn: string;
  cliente?: { nombre: string; barrio?: string; telefono?: string };
  vendedor?: { nombre: string }; items: FacturaItem[];
}

export interface FacturaEntrega extends Factura {
  cliente: {
    id: string; nombre: string; direccion?: string; barrio?: string;
    telefono?: string; lat?: number | null; lng?: number | null;
  };
}

export interface Proveedor {
  id: string; nombre: string; nit?: string; telefono?: string; contacto?: string;
}

export interface Gasto {
  id: string; concepto: string; categoria?: string; monto: string;
  fecha: string; notas?: string; usuario?: { nombre: string };
}

export interface MovimientoStock {
  id: string; tipo: string; cantidad: number; motivo?: string;
  creadoEn: string; producto?: { nombre: string };
}

export interface VentaDia { dia: string; ventas: number; total: number; }

export interface ResumenReporte {
  rango: { desde: string; hasta: string };
  ventas: { _sum: { total: string | null; pagado: string | null }; _count: number };
  gastos: { _sum: { monto: string | null }; _count: number };
  porVendedor: { vendedorId: string; nombre: string; _sum: { total: string }; _count: number }[];
  topProductos: { productoId: string; nombre: string; _sum: { cantidad: number; total: string } }[];
}

export interface Cartera {
  total: string;
  clientes: { id: string; nombre: string; barrio?: string; telefono?: string; saldoPendiente: string }[];
}

export interface Paginado<T> {
  datos: T[];
  paginacion: { pagina: number; porPagina: number; total: number; totalPaginas: number };
}
