import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportesApi, rastreoApi } from '../../api/servicios';
import { useAuth } from '../../auth/AuthContext';
import { fmtMoneda } from '../../api/formato';

type Periodo = 'dia' | 'semana' | 'mes' | 'todo' | 'rango';
const LABEL: Record<Periodo, string> = { dia: 'Hoy', semana: 'Semana', mes: 'Mes', todo: 'Total', rango: '📅 Rango' };
const GRID: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 };
const H: React.CSSProperties = { fontSize: 13, marginTop: 4 };

const hoyISO = () => {
  const d = new Date();
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};

const hora = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '—';
const num = (n: number) => n.toLocaleString('es-CO');

function Pill({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: '5px 12px', fontSize: 11, fontWeight: 700, borderRadius: 9, cursor: 'pointer',
      border: activo ? 'none' : '1px solid var(--border)',
      background: activo ? 'linear-gradient(135deg, var(--accent), #0044ff)' : 'var(--bg3)',
      color: activo ? '#fff' : 'var(--muted)',
    }}>{children}</button>
  );
}

function Tarjeta({ etiqueta, valor, color, sub }: { etiqueta: string; valor: string; color?: string; sub?: string }) {
  return (
    <div className="card" style={{ padding: '11px 13px' }}>
      <div className="muted" style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>{etiqueta}</div>
      <div style={{ fontSize: 19, fontWeight: 800, color: color ?? 'var(--text)' }}>{valor}</div>
      {sub && <div className="muted" style={{ fontSize: 10, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export function IndicadoresPage() {
  const { usuario } = useAuth();
  const esGestion = usuario?.rol === 'ADMIN' || usuario?.rol === 'COADMIN' || usuario?.rol === 'SUPERVISOR';
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [vendedorId, setVendedorId] = useState('');
  const [rango, setRango] = useState({ desde: hoyISO(), hasta: hoyISO() });

  const { data: vendedores } = useQuery({
    queryKey: ['ind-vendedores'], queryFn: rastreoApi.vendedores, enabled: esGestion,
  });

  const { data, isFetching } = useQuery({
    queryKey: ['indicadores', periodo, vendedorId, rango.desde, rango.hasta],
    queryFn: () => reportesApi.indicadores({
      periodo,
      vendedorId: vendedorId || undefined,
      ...(periodo === 'rango' ? { desde: rango.desde, hasta: rango.hasta } : {}),
    }),
  });

  const t = data?.totales;
  const efPct = t ? (t.efectividad * 100).toFixed(1) + '%' : '—';

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', display: 'grid', gap: 12 }}>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {(['dia', 'semana', 'mes', 'todo', 'rango'] as Periodo[]).map(p => (
            <Pill key={p} activo={periodo === p} onClick={() => setPeriodo(p)}>{LABEL[p]}</Pill>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        {esGestion && (
          <select value={vendedorId} onChange={e => setVendedorId(e.target.value)} style={{ minWidth: 160, fontSize: 12 }}>
            <option value="">Todos los vendedores</option>
            {vendedores?.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
          </select>
        )}
        {isFetching && <span className="muted" style={{ fontSize: 11 }}>Actualizando…</span>}
      </div>

      {/* Rango de fechas */}
      {periodo === 'rango' && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="date" value={rango.desde} max={hoyISO()} onChange={e => setRango(r => ({ ...r, desde: e.target.value }))}
            style={{ flex: 1, minWidth: 140, fontSize: 12, padding: '6px 9px' }} />
          <span className="muted" style={{ fontSize: 11 }}>→</span>
          <input type="date" value={rango.hasta} max={hoyISO()} onChange={e => setRango(r => ({ ...r, hasta: e.target.value }))}
            style={{ flex: 1, minWidth: 140, fontSize: 12, padding: '6px 9px' }} />
        </div>
      )}

      {/* ── Ventas ── */}
      <strong style={H}>Ventas</strong>
      <div style={GRID}>
        <Tarjeta etiqueta="Venta neta" valor={fmtMoneda(t?.ventaNeta ?? 0)} color="var(--green)" />
        <Tarjeta etiqueta="Pedidos (facturas)" valor={num(t?.pedidos ?? 0)} />
        <Tarjeta etiqueta="Dropsize ($/pedido)" valor={fmtMoneda(t?.dropsize ?? 0)} color="var(--accent)" />
        <Tarjeta etiqueta="Unidades" valor={num(t?.unidades ?? 0)} />
        <Tarjeta etiqueta="Unidades por cliente" valor={(t?.unidadesPorCliente ?? 0).toFixed(1)} />
      </div>

      {/* ── Cobertura (visitas) ── */}
      <strong style={H}>Cobertura</strong>
      <div style={GRID}>
        <Tarjeta etiqueta="Clientes ruta hoy" valor={num(t?.clientesRutaHoy ?? 0)} />
        <Tarjeta etiqueta="Clientes visitados" valor={num(t?.clientesVisitados ?? 0)}
          sub={`${num(t?.clientesNoCompra ?? 0)} sin compra (causal)`} />
        <Tarjeta etiqueta="Compraron" valor={num(t?.clientesImpactados ?? 0)} color="var(--green)" />
        <Tarjeta etiqueta="Efectividad" valor={efPct} color="var(--purple)"
          sub={t ? `${num(t.clientesImpactados)} de ${num(t.clientesVisitados)} visitados` : ''} />
      </div>

      {/* ── Impacto ── */}
      <strong style={H}>Impacto</strong>
      <div style={GRID}>
        {data?.esFocalizado
          ? <Tarjeta etiqueta="Categorías impactadas" valor={num(t?.categoriasImpactadas ?? 0)} color="var(--orange)" sub="vendedor focalizado" />
          : <Tarjeta etiqueta="Marcas impactadas" valor={num(t?.marcasImpactadas ?? 0)} color="var(--orange)" />}
      </div>

      {/* ── Ruta (GPS) ── */}
      {data?.tiempo && (
        <>
          <strong style={H}>Ruta (GPS)</strong>
          <div style={GRID}>
            <Tarjeta etiqueta="Hora de inicio" valor={hora(data.tiempo.inicio)} sub={`Último: ${hora(data.tiempo.fin)}`} />
            <Tarjeta etiqueta="Horas en ruta" valor={`${data.tiempo.horas} h`} />
          </div>
        </>
      )}

      {/* Ranking por vendedor (vista global) */}
      {!!data?.porVendedor?.length && (
        <div>
          <strong style={{ fontSize: 14 }}>Por vendedor</strong>
          <div className="card" style={{ padding: 0, overflow: 'hidden', marginTop: 6 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.6fr .8fr .7fr 1fr', gap: 6, padding: '8px 12px', fontSize: 10, fontWeight: 700, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
              <span>VENDEDOR</span><span style={{ textAlign: 'right' }}>VENTA</span><span style={{ textAlign: 'right' }}>PEDIDOS</span><span style={{ textAlign: 'right' }}>DROPSIZE</span>
            </div>
            {data.porVendedor.map((v, i) => (
              <div key={v.id} style={{ display: 'grid', gridTemplateColumns: '1.6fr .8fr .7fr 1fr', gap: 6, padding: '9px 12px', fontSize: 12, borderTop: i ? '1px solid var(--border)' : 'none', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.nombre}</span>
                <span className="mono green" style={{ textAlign: 'right' }}>{fmtMoneda(v.venta)}</span>
                <span className="mono" style={{ textAlign: 'right' }}>{num(v.pedidos)}</span>
                <span className="mono accent" style={{ textAlign: 'right' }}>{fmtMoneda(v.pedidos ? v.venta / v.pedidos : 0)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Por categoría / marca */}
      {!!data?.porCategoria?.length && (
        <div>
          <strong style={{ fontSize: 14 }}>Por marca / categoría</strong>
          <div className="card" style={{ padding: 0, overflow: 'hidden', marginTop: 6 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.6fr .8fr .9fr .8fr', gap: 6, padding: '8px 12px', fontSize: 10, fontWeight: 700, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
              <span>MARCA</span><span style={{ textAlign: 'right' }}>UNIDADES</span><span style={{ textAlign: 'right' }}>VENTA</span><span style={{ textAlign: 'right' }}>IMPACTOS</span>
            </div>
            {data.porCategoria.map((c, i) => (
              <div key={c.categoria} style={{ display: 'grid', gridTemplateColumns: '1.6fr .8fr .9fr .8fr', gap: 6, padding: '9px 12px', fontSize: 12, borderTop: i ? '1px solid var(--border)' : 'none', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.categoria}</span>
                <span className="mono" style={{ textAlign: 'right' }}>{num(c.unidades)}</span>
                <span className="mono green" style={{ textAlign: 'right' }}>{fmtMoneda(c.venta)}</span>
                <span className="mono accent" style={{ textAlign: 'right' }}>{num(c.impactos)}</span>
              </div>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 10, marginTop: 4 }}>
            Impactos = clientes distintos que compraron esa marca en el periodo.
          </p>
        </div>
      )}
    </div>
  );
}
