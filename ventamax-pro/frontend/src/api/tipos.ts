export type Rol = 'ADMIN' | 'COADMIN' | 'SUPERVISOR' | 'VENDEDOR' | 'ENTREGADOR';

export interface Usuario {
  id: string; nombre: string; rol: Rol; zona?: string | null;
  usuario?: string; activo?: boolean; listasPrecios?: string[];
  documento?: string | null; ciudad?: string | null; meta?: number;
}

export interface Cliente {
  id: string; codigo?: number; nombre: string; razonSocial?: string | null; contacto?: string; telefono?: string;
  direccion?: string; barrio?: string; ciudad?: string; correo?: string;
  nit?: string; zona?: string; segmento?: string; tipologia?: string | null; listaPrecio?: string | null; diaVisita?: number;
  cupoCredito?: string; saldoPendiente: string;
  lat?: number | null; lng?: number | null;
}

export interface ClienteDetalle extends Cliente {
  facturas: Factura[];
  stats: { total: number; pedidos: number; unidades: number; ticketPromedio: number; hoy: number; categorias: number };
}

export interface BarrioFaceta { barrio: string; total: number; }

export type EstadoMapa = 'pendiente' | 'vendido' | 'no_compra';
export interface ClienteMapa {
  id: string; nombre: string; codigo?: number; direccion?: string; barrio?: string;
  ciudad?: string; telefono?: string; lat: number; lng: number; diaVisita?: number;
  estado: EstadoMapa;
}

export interface Producto {
  id: string; codigo?: string; nombre: string; categoria?: string; unidad?: string;
  marca?: string | null; linea?: string | null; segmento?: string | null; subsegmento?: string | null;
  iva?: string; precioCompra?: string; precioVenta: string;
  precioGeneral?: string; precioMayorista?: string; precioTat?: string; precioDroguerias?: string;
  precioTatViajeros?: string; precioEntreSede?: string;
  stock: number; stockMinimo: number;
}

export interface FacturaItem {
  productoId: string; cantidad: number; precioUnit: string; total: string;
  producto?: { nombre: string };
}

export interface Factura {
  id: string; consecutivo: number; estado: string; tipoDoc?: string;
  subtotal: string; descuento: string; total: string; pagado: string;
  metodoPago?: string; notas?: string; creadoEn: string; entregadoEn?: string | null;
  devuelta?: string; causal?: string | null; obsDevolucion?: string | null;
  montoDevuelto?: string; revivirSolicitado?: boolean; facturaOrigenId?: string | null;
  tareaId?: string | null;
  cliente?: { nombre: string; direccion?: string; barrio?: string; ciudad?: string; zona?: string; telefono?: string };
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

// ── Dashboard del administrador ──────────────────────────────
export type Periodo = 'dia' | 'semana' | 'mes' | 'todo';

export interface Asesor {
  id: string; nombre: string; inicial: string; color: string;
  total: number; pedidos: number;
}

export interface RankingAsesores {
  periodo: Periodo;
  ranking: Asesor[];
}

export interface PanelAdmin {
  totalMes: number;
  pedidosMes: number;
  meta: number;
  pct: number;
  etiquetaMes: string;
  pendiente: { total: number; count: number };
  rutaHoy: {
    dia: number;
    total: number;
    clientes: { id: string; nombre: string; barrio?: string | null; direccion?: string | null }[];
  };
  riesgo: { id: string; nombre: string; barrio?: string | null; dias: number }[];
}

export interface Presente {
  id: string; nombre: string; rol: Rol; inicial: string; haceSegundos: number;
}

// ── Resumen histórico del dashboard (tarjetas + productos) ──
export interface DashItem { nombre: string; unidades: number; venta: number; }
export interface DashboardHistorico {
  periodo: string;
  ventaHoy: { total: number; facturas: number };
  miMes: { total: number; meta: number; pct: number; etiqueta: string };
  clientesRegistrados: number;
  stockBajo: number;
  pedidos: number;
  ventaNeta: number;
  ticketProm: number;
  unidades: number;
  montoVenta: number;
  clientesHistorico: number;
  devoluciones: number;
  fiados: number;
  efectivo: number;
  pagaOtroDia: number;
  porCategoria: DashItem[];
  porProducto: DashItem[];
}

// ── Rentabilidad ──
export interface RentaItem { nombre: string; venta: number; costo: number; ganancia: number; unidades: number; }
export interface Rentabilidad {
  periodo: string;
  totales: { venta: number; costo: number; ganancia: number; margen: number };
  porProducto: RentaItem[];
  porCategoria: RentaItem[];
}

// ── Tareas de entrega (programación) ──
export interface TareaFactura {
  id: string; consecutivo: number; estado: string; total: string; pagado: string;
  metodoPago?: string | null; devuelta?: string; montoDevuelto?: string;
  cliente?: { nombre: string; barrio?: string | null; direccion?: string | null };
}
export interface Tarea {
  id: string; nombre: string; entregadorId: string; fecha: string; estado: string;
  entregador?: { nombre: string };
  facturas: TareaFactura[];
}

// ── Rastreo ──
export interface VendedorRastreo { id: string; nombre: string; rol: Rol; zona?: string | null; }
export interface PosicionViva { id: string; nombre: string; rol: Rol; lat: number; lng: number; haceSegundos: number; }
export interface PuntoRecorrido { lat: number; lng: number; creadoEn: string; }
export interface Recorrido {
  puntos: PuntoRecorrido[];
  resumen: { puntos: number; inicio: string | null; fin: string | null; distanciaKm: number };
}

// ── Clientes duplicados ──
export interface ClienteDup {
  id: string; nit?: string | null; codigo?: number | null; nombre: string; razonSocial?: string | null;
  ciudad?: string | null; barrio?: string | null; telefono?: string | null; listaPrecio?: string | null;
  _count: { facturas: number };
}
export interface GrupoDuplicado { nit: string; clientes: ClienteDup[]; }

// ── Regiones y bodegas ──
export interface Region { id: string; nombre: string; activo?: boolean; _count?: { bodegas: number }; }
export interface Bodega {
  id: string; nombre: string; codigo?: string | null; ciudad?: string | null; direccion?: string | null;
  regionId?: string | null; region?: { id: string; nombre: string } | null;
}

// ── Indicadores / analítica ──
export interface Indicadores {
  periodo: string;
  vendedorId: string | null;
  totales: {
    ventaNeta: number; pedidos: number; unidades: number; dropsize: number;
    clientesImpactados: number; clientesAsignados: number; efectividad: number; unidadesPorCliente: number;
  };
  porVendedor: { id: string; nombre: string; venta: number; pedidos: number; clientes: number }[];
  porCategoria: { categoria: string; unidades: number; venta: number; impactos: number }[];
  tiempo: { inicio: string; fin: string; horas: number } | null;
}
