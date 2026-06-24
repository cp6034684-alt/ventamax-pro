import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { reportesApi } from '../../api/servicios';
import { fmtMoneda } from '../../api/formato';
import { useAuth } from '../../auth/AuthContext';
import { EntregasReporte } from './EntregasReporte';
import { ActividadReporte } from './ActividadReporte';

const hoyISO = () => new Date().toISOString().slice(0, 10);
const inicioMesISO = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };
const pct = (n: number) => `${Math.round(n * 100)}%`;

const COLS_DETALLE: [string, string][] = [
  ['codigoRuta', 'Código ruta'], ['vendedor', 'Vendedor'], ['docVendedor', 'Doc. vendedor'], ['supervisor', 'Supervisor'],
  ['codigoCliente', 'Código cliente'], ['nombreCliente', 'Nombre cliente'],
  ['fechaPrimeraCompra', 'Fecha 1ª compra'],
  ['nit', 'NIT/Documento'],
  ['negocio', 'Nombre negocio'], ['tipologia', 'Tipología'], ['ciudad', 'Ciudad'], ['barrio', 'Barrio'],
  ['direccion', 'Dirección'], ['celular', 'Celular'], ['lista', 'Lista de precio'],
  ['fecha', 'Fecha'], ['hora', 'Hora'], ['tipo', 'Tipo'], ['factura', 'N° factura'],
  ['codigoArticulo', 'Código artículo'], ['descripcion', 'Descripción'], ['marca', 'Marca'],
  ['categoria', 'Categoría'], ['linea', 'Línea'], ['segmento', 'Segmento'], ['subsegmento', 'Subsegmento'],
  ['cantidad', 'Cantidad'], ['costo', 'Valor costo'], ['valorUnitario', 'Valor unitario'],
  ['valorTotal', 'Valor total'], ['ivaPct', '% IVA'], ['ivaValor', 'IVA'], ['valorConIva', 'Valor con IVA'],
  ['totalFactura', 'Total factura'], ['valorNota', 'Valor nota'],
];

interface Tab { id: string; label: string; }
const TABS_GESTION: Tab[] = [
  { id: 'entregas', label: '🚚 Entregas' },
  { id: 'excel', label: '📊 Excel' },
  { id: 'actividad', label: '📍 Actividad' },
  { id: 'bodega', label: '🏭 Bodega' },
  { id: 'manifiesto', label: '📋 Manifiesto' },
];
const TABS_VEND: Tab[] = [
  { id: 'ventas', label: '📈 Ventas' },
  { id: 'kpos', label: '📊 Mis KPOs' },
  { id: 'rentab', label: '💰 Rentabilidad' },
];

const PENDIENTES: Record<string, string> = {
  bodega: 'El reporte por bodega necesita que las ventas se asocien a una bodega/región (aún no se captura).',
  manifiesto: 'El manifiesto de entrega se arma cuando definamos la programación de entregas.',
};

function Card({ titulo, valor, sub, color }: { titulo: string; valor: string; sub?: string; color?: string }) {
  return (
    <div className="card">
      <div className="muted" style={{ fontSize: 11, fontWeight: 700 }}>{titulo}</div>
      <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: color ?? 'var(--text)' }}>{valor}</div>
      {sub && <div className="muted" style={{ fontSize: 11 }}>{sub}</div>}
    </div>
  );
}

function ListaRenta({ items, totalVenta = 0 }: { items: { nombre: string; venta: number; costo: number; ganancia: number; unidades: number }[]; totalVenta?: number }) {
  return (
    <div className="card">
      {!items.length && <p className="muted" style={{ fontSize: 13 }}>Sin datos en el rango.</p>}
      {items.map((r, i) => {
        const m = r.venta > 0 ? r.ganancia / r.venta : 0;
        const part = totalVenta > 0 ? r.venta / totalVenta : 0;
        return (
          <div key={i} style={{ padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.nombre} <span className="muted">({r.unidades})</span></span>
              <span className="mono" style={{ flexShrink: 0, color: r.ganancia >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmtMoneda(r.ganancia)}</span>
            </div>
            <div className="muted mono" style={{ fontSize: 10 }}>Venta {fmtMoneda(r.venta)} · Costo {fmtMoneda(r.costo)} · Margen {pct(m)}{totalVenta > 0 ? ` · Part. ${pct(part)}` : ''}</div>
          </div>
        );
      })}
    </div>
  );
}

export function ReportesPage() {
  const { usuario } = useAuth();
  const esGestion = usuario?.rol === 'ADMIN' || usuario?.rol === 'COADMIN' || usuario?.rol === 'SUPERVISOR';
  const tabs = esGestion ? TABS_GESTION : TABS_VEND;
  const [tab, setTab] = useState(esGestion ? 'entregas' : 'ventas');
  const [desde, setDesde] = useState(inicioMesISO());
  const [hasta, setHasta] = useState(hoyISO());
  const [exportando, setExportando] = useState(false);

  const usaRango = ['ventas', 'rentab', 'excel', 'kpos'].includes(tab);

  const { data: resumen } = useQuery({
    queryKey: ['rep-resumen', desde, hasta],
    queryFn: () => reportesApi.resumen(desde, hasta),
    enabled: esGestion && ['ventas'].includes(tab),
  });
  const { data: cartera } = useQuery({
    queryKey: ['rep-cartera'], queryFn: reportesApi.cartera,
    enabled: esGestion && ['ventas', 'cartera'].includes(tab),
  });
  const { data: semana } = useQuery({ queryKey: ['semana'], queryFn: reportesApi.semana, enabled: tab === 'ventas' });
  const { data: ind } = useQuery({
    queryKey: ['rep-ind', desde, hasta],
    queryFn: () => reportesApi.indicadores({ periodo: 'rango', desde, hasta }),
    enabled: !esGestion && (tab === 'ventas' || tab === 'kpos'),
  });
  const { data: renta } = useQuery({
    queryKey: ['rep-renta', desde, hasta],
    queryFn: () => reportesApi.rentabilidad('rango', desde, hasta),
    enabled: tab === 'rentab' || (esGestion && tab === 'ventas'),
  });

  const exportarExcel = async () => {
    setExportando(true);
    try {
      const filas = await reportesApi.exportarFacturas(desde, hasta);
      if (!filas.length) return alert('No hay facturas en ese rango.');
      const hoja = XLSX.utils.json_to_sheet(filas);
      const libro = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(libro, hoja, 'Facturas');
      XLSX.writeFile(libro, `facturas_${desde}_a_${hasta}.xlsx`);
    } finally { setExportando(false); }
  };
  const exportarDetallado = async () => {
    setExportando(true);
    try {
      const { filas } = await reportesApi.exportarDetallado(desde, hasta);
      if (!filas.length) return alert('No hay movimientos en ese rango.');
      const encabezados = COLS_DETALLE.map(c => c[1]);
      const cuerpo = filas.map(f => COLS_DETALLE.map(([k]) => (f as any)[k] ?? ''));
      const hoja = XLSX.utils.aoa_to_sheet([encabezados, ...cuerpo]);
      const libro = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(libro, hoja, 'Detallado');
      XLSX.writeFile(libro, `reporte_detallado_${desde}_a_${hasta}.xlsx`);
    } finally { setExportando(false); }
  };

  const totalVentas = Number(resumen?.ventas._sum.total ?? 0);
  const totalVend = (resumen?.porVendedor ?? []).reduce((acc, v) => acc + Number(v._sum.total), 0);
  const totalGastos = Number(resumen?.gastos._sum.monto ?? 0);
  const maxSemana = Math.max(1, ...(semana ?? []).map(d => d.total));

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 5, overflowX: 'auto', paddingBottom: 2 }}>
        {tabs.map(t => (
          <button key={t.id} className={`btn ${tab === t.id ? '' : 'btn-ghost'}`}
            style={{ padding: '7px 12px', fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0 }}
            onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {usaRango && (
        <div className="card" style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap' }}>
          <label style={{ flex: 1, minWidth: 130, fontSize: 11, color: 'var(--muted)' }}>
            DESDE<input type="date" value={desde} onChange={e => setDesde(e.target.value)} />
          </label>
          <label style={{ flex: 1, minWidth: 130, fontSize: 11, color: 'var(--muted)' }}>
            HASTA<input type="date" value={hasta} onChange={e => setHasta(e.target.value)} />
          </label>
        </div>
      )}

      {((tab === 'ventas' && !esGestion) || tab === 'kpos') && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            <Card titulo="VENTA NETA" valor={fmtMoneda(ind?.totales.ventaNeta ?? 0)} sub={`${ind?.totales.pedidos ?? 0} pedidos`} color="var(--green)" />
            <Card titulo="UNIDADES" valor={String(ind?.totales.unidades ?? 0)} />
            <Card titulo="DROPSIZE" valor={fmtMoneda(ind?.totales.dropsize ?? 0)} sub="ticket promedio" color="var(--accent)" />
            <Card titulo="EFECTIVIDAD" valor={pct(ind?.totales.efectividad ?? 0)} sub={`${ind?.totales.clientesImpactados ?? 0}/${ind?.totales.clientesAsignados ?? 0} clientes`} color="var(--orange)" />
          </div>
          <div className="card">
            <strong style={{ fontSize: 13 }}>Por categoría</strong>
            {ind?.porCategoria.map((c, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                <span style={{ flex: 1 }}>{c.categoria}</span>
                <span className="muted" style={{ fontSize: 11 }}>{c.unidades} uds</span>
                <span className="mono accent">{fmtMoneda(c.venta)}</span>
              </div>
            ))}
            {ind && !ind.porCategoria.length && <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>Sin ventas en el rango.</p>}
          </div>
        </>
      )}

      {tab === 'rentab' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            <Card titulo="VENTA NETA (sin IVA)" valor={fmtMoneda(renta?.totales.venta ?? 0)} color="var(--green)" />
            <Card titulo="COSTO" valor={fmtMoneda(renta?.totales.costo ?? 0)} color="var(--red)" />
            <Card titulo="GANANCIA" valor={fmtMoneda(renta?.totales.ganancia ?? 0)} sub={`margen ${pct(renta?.totales.margen ?? 0)}`} color="var(--accent)" />
          </div>
          <strong style={{ fontSize: 13 }}>Por producto</strong>
          <ListaRenta items={renta?.porProducto ?? []} />
          <strong style={{ fontSize: 13 }}>Por categoría</strong>
          <ListaRenta items={renta?.porCategoria ?? []} />
        </>
      )}

      {tab === 'entregas' && <EntregasReporte />}

      {tab === 'excel' && (
        <div className="card" style={{ display: 'grid', gap: 10 }}>
          <p className="muted" style={{ fontSize: 12 }}>Exporta el periodo seleccionado a Excel.</p>
          <button className="btn btn-ghost" onClick={exportarExcel} disabled={exportando}>{exportando ? 'Generando…' : '⬇ Resumen de facturas'}</button>
          <button className="btn" onClick={exportarDetallado} disabled={exportando}>{exportando ? 'Generando…' : '⬇ Reporte detallado'}</button>
        </div>
      )}

      {tab === 'actividad' && <ActividadReporte />}

      {PENDIENTES[tab] && (
        <div className="card" style={{ textAlign: 'center', padding: '24px 16px' }}>
          <div style={{ fontSize: 30 }}>🚧</div>
          <strong style={{ display: 'block', marginTop: 6 }}>Pendiente de datos</strong>
          <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>{PENDIENTES[tab]}</p>
        </div>
      )}
    </div>
  );
}
