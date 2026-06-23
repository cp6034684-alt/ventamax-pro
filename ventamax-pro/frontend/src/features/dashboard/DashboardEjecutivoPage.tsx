import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { reportesApi } from '../../api/servicios';
import { fmtMoneda } from '../../api/formato';
import type { EjecItem } from '../../api/tipos';

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const hoyISO = () => { const d = new Date(); const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10); };
const inicioMesISO = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); };
const pct = (n: number) => `${Math.round(n * 100)}%`;
function corto(n: number) {
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${Math.round(n / 1e3)}k`;
  return `$${Math.round(n)}`;
}

const PALETA = ['#00e5ff', '#34d399', '#c084fc', '#fbbf24', '#fb7185', '#38bdf8', '#a3e635', '#f472b6', '#f97316', '#22d3ee'];

export function DashboardEjecutivoPage() {
  const [periodo, setPeriodo] = useState('mes');
  const [desde, setDesde] = useState(inicioMesISO());
  const [hasta, setHasta] = useState(hoyISO());

  const { data, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ['ejecutivo', periodo, periodo === 'rango' ? desde : '', periodo === 'rango' ? hasta : ''],
    queryFn: () => reportesApi.ejecutivo(periodo === 'rango' ? { periodo, desde, hasta } : { periodo }),
    refetchInterval: 60_000, // se actualiza en línea
  });

  const k = data?.kpis;
  const proy = data?.proyeccion;
  const horaAct = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gap: 14 }}>
      {/* Encabezado */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Link to="/" className="btn btn-ghost" style={{ padding: '6px 10px', fontSize: 12, textDecoration: 'none' }}>← Inicio</Link>
        <strong style={{ fontSize: 18 }}>📊 Dashboard Ejecutivo</strong>
        <div style={{ flex: 1 }} />
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }} className="muted">
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: isFetching ? 'var(--orange)' : 'var(--green)', boxShadow: '0 0 6px currentColor' }} />
          {isFetching ? 'actualizando…' : `en línea · ${horaAct}`}
        </span>
      </div>

      {/* Selector de periodo */}
      <div className="card" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '10px 12px' }}>
        {([['semana', 'Semana'], ['mes', 'Mes'], ['trimestre', 'Trimestre'], ['rango', 'Rango']] as const).map(([id, lab]) => (
          <button key={id} className={`btn ${periodo === id ? '' : 'btn-ghost'}`} style={{ fontSize: 12, padding: '6px 14px' }} onClick={() => setPeriodo(id)}>{lab}</button>
        ))}
        {periodo === 'rango' && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
            <input type="date" value={desde} max={hasta} onChange={e => setDesde(e.target.value)} />
            <span className="muted">→</span>
            <input type="date" value={hasta} max={hoyISO()} onChange={e => setHasta(e.target.value)} />
          </div>
        )}
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <KPI titulo="VENTA" valor={fmtMoneda(k?.venta ?? 0)} sub={`${(k?.pedidos ?? 0).toLocaleString('es-CO')} pedidos`} color="var(--green)" />
        <KPI titulo="GANANCIA" valor={fmtMoneda(k?.ganancia ?? 0)} sub={`margen ${pct(k?.margen ?? 0)}`} color="var(--accent)" />
        <KPI titulo="UNIDADES" valor={(k?.unidades ?? 0).toLocaleString('es-CO')} sub={`drop ${(k?.dropSize ?? 0).toFixed(1)} und/ped`} color="#c084fc" />
        <KPI titulo="CLIENTES IMPACTADOS" valor={(k?.clientes ?? 0).toLocaleString('es-CO')} sub={`ticket ${corto(k?.ticket ?? 0)}`} color="#38bdf8" />
        <KPI titulo="DEVOLUCIONES" valor={fmtMoneda(k?.devolucionesMonto ?? 0)} sub={`${k?.devolucionesDocs ?? 0} notas`} color="var(--red)" />
        <KPI titulo="COSTO" valor={fmtMoneda(k?.costo ?? 0)} color="var(--orange)" />
      </div>

      {/* Proyección de cierre */}
      {!!proy && (
        <div className="card" style={{ display: 'grid', gap: 8 }}>
          <strong style={{ fontSize: 13 }}>🎯 Proyección de cierre (mes en curso)</strong>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px,1fr))', gap: 8 }}>
            <Mini n={fmtMoneda(proy.ventaMtd)} label={`VENTA AL DÍA ${proy.diaActual}`} />
            <Mini n={fmtMoneda(proy.proyeccion)} label="PROYECCIÓN CIERRE" color="var(--accent)" />
            <Mini n={fmtMoneda(proy.metaTotal)} label="META DEL MES" />
            <Mini n={pct(proy.cumplimiento)} label="CUMPLIMIENTO PROY." color={proy.cumplimiento >= 1 ? 'var(--green)' : proy.cumplimiento >= 0.8 ? 'var(--orange)' : 'var(--red)'} />
          </div>
          <Barra frac={proy.cumplimiento} />
          <div className="muted" style={{ fontSize: 11 }}>Al ritmo actual ({proy.diaActual}/{proy.diasMes} días) se proyecta {pct(proy.cumplimiento)} de la meta.</div>
        </div>
      )}

      {/* Comparativo entre meses + Seguimiento diario */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px,1fr))', gap: 12 }}>
        <div className="card">
          <strong style={{ fontSize: 13 }}>📈 Comparativo entre meses</strong>
          <BarrasMeses meses={data?.comparativos.meses ?? []} />
        </div>
        <div className="card">
          <strong style={{ fontSize: 13 }}>🗓 Seguimiento de venta (período)</strong>
          <LineaDiaria datos={data?.seguimiento ?? []} />
        </div>
      </div>

      {/* Participación */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px,1fr))', gap: 12 }}>
        <BarrasH titulo="🌎 Participación por regional" items={data?.participacion.regional ?? []} />
        <BarrasH titulo="👔 Participación por supervisor" items={data?.participacion.supervisor ?? []} />
        <BarrasH titulo="🏷 Participación por marca" items={data?.participacion.marca ?? []} top={12} />
        <BarrasH titulo="📦 Participación por categoría" items={data?.participacion.categoria ?? []} top={12} />
        <BarrasH titulo="📍 Comparativo por zona" items={data?.participacion.zona ?? []} top={12} />
        <BarrasH titulo="🥇 Comparativo por vendedor" items={data?.participacion.vendedor ?? []} top={12} />
      </div>

      {/* Ranking de vendedores con cumplimiento */}
      <div className="card">
        <strong style={{ fontSize: 13 }}>🏆 Vendedores · venta, unidades y % de participación</strong>
        <TablaVendedores items={data?.participacion.vendedor ?? []} />
      </div>

      {/* Alertas */}
      <div className="card">
        <strong style={{ fontSize: 13 }}>⚠️ Alertas de venta baja (mes en curso)</strong>
        {!data?.alertas.length && <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>Sin alertas. Todos por buen camino.</p>}
        <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
          {data?.alertas.map((a, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, background: 'var(--bg3)', borderLeft: `3px solid ${a.tipo === 'sin_venta' ? 'var(--red)' : 'var(--orange)'}` }}>
              <span style={{ fontSize: 14 }}>{a.tipo === 'sin_venta' ? '🚨' : '⚠️'}</span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{a.nombre}</span>
              <span className="muted" style={{ fontSize: 11 }}>{a.detalle}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="muted" style={{ fontSize: 11, textAlign: 'center' }}>Se actualiza automáticamente cada minuto · datos en vivo del sistema.</p>
    </div>
  );
}

function KPI({ titulo, valor, sub, color }: { titulo: string; valor: string; sub?: string; color?: string }) {
  return (
    <div className="card" style={{ padding: '12px 14px' }}>
      <div className="muted" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.5px' }}>{titulo}</div>
      <div className="mono" style={{ fontSize: 22, fontWeight: 800, color: color ?? 'var(--text)', marginTop: 2 }}>{valor}</div>
      {sub && <div className="muted" style={{ fontSize: 11 }}>{sub}</div>}
    </div>
  );
}
function Mini({ n, label, color }: { n: string; label: string; color?: string }) {
  return (
    <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '8px 10px' }}>
      <div className="mono" style={{ fontSize: 16, fontWeight: 800, color: color ?? 'var(--text)' }}>{n}</div>
      <div className="muted" style={{ fontSize: 9, letterSpacing: '.4px' }}>{label}</div>
    </div>
  );
}
function Barra({ frac }: { frac: number }) {
  const f = Math.max(0, Math.min(1, frac));
  return (
    <div style={{ height: 8, background: 'rgba(255,255,255,.08)', borderRadius: 20, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${f * 100}%`, background: f >= 1 ? 'var(--green)' : 'linear-gradient(90deg, var(--accent), #0044ff)', borderRadius: 20 }} />
    </div>
  );
}

function BarrasH({ titulo, items, top = 10 }: { titulo: string; items: EjecItem[]; top?: number }) {
  const total = items.reduce((s, x) => s + Number(x.venta), 0);
  const lista = items.slice(0, top);
  const max = Math.max(1, ...lista.map(x => Number(x.venta)));
  return (
    <div className="card">
      <strong style={{ fontSize: 13 }}>{titulo}</strong>
      <div style={{ display: 'grid', gap: 7, marginTop: 10 }}>
        {!lista.length && <p className="muted" style={{ fontSize: 12 }}>Sin datos en el período.</p>}
        {lista.map((x, i) => {
          const v = Number(x.venta);
          return (
            <div key={i}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, marginBottom: 2 }}>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.nombre}</span>
                <span className="mono" style={{ flexShrink: 0 }}>{corto(v)} <span className="muted">· {total > 0 ? pct(v / total) : '0%'}</span></span>
              </div>
              <div style={{ height: 7, background: 'rgba(255,255,255,.06)', borderRadius: 20, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(v / max) * 100}%`, background: PALETA[i % PALETA.length], borderRadius: 20 }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BarrasMeses({ meses }: { meses: { mes: string; venta: number; unidades: number }[] }) {
  if (!meses.length) return <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Sin datos.</p>;
  const max = Math.max(1, ...meses.map(m => m.venta));
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 150, marginTop: 14 }}>
      {meses.map((m, i) => {
        const [, mm] = m.mes.split('-');
        const prev = i > 0 ? meses[i - 1].venta : 0;
        const crec = prev > 0 ? (m.venta - prev) / prev : 0;
        return (
          <div key={m.mes} style={{ flex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
            <div className="mono" style={{ fontSize: 9, fontWeight: 700 }}>{corto(m.venta)}</div>
            <div title={fmtMoneda(m.venta)} style={{ height: `${Math.max(4, (m.venta / max) * 100)}%`, background: 'linear-gradient(180deg, var(--accent), #0044ff)', borderRadius: 5, marginTop: 3 }} />
            <div className="muted" style={{ fontSize: 10, marginTop: 4 }}>{MES[Number(mm) - 1] ?? m.mes}</div>
            {i > 0 && <div style={{ fontSize: 9, color: crec >= 0 ? 'var(--green)' : 'var(--red)' }}>{crec >= 0 ? '▲' : '▼'} {Math.abs(Math.round(crec * 100))}%</div>}
          </div>
        );
      })}
    </div>
  );
}

function LineaDiaria({ datos }: { datos: { dia: string; venta: number }[] }) {
  if (!datos.length) return <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Sin datos en el período.</p>;
  const W = 320, H = 120, P = 6;
  const max = Math.max(1, ...datos.map(d => d.venta));
  const n = datos.length;
  const x = (i: number) => P + (n === 1 ? (W - 2 * P) / 2 : (i / (n - 1)) * (W - 2 * P));
  const y = (v: number) => H - P - (v / max) * (H - 2 * P);
  const pts = datos.map((d, i) => `${x(i)},${y(d.venta)}`).join(' ');
  const area = `${P},${H - P} ${pts} ${x(n - 1)},${H - P}`;
  const totalP = datos.reduce((s, d) => s + d.venta, 0);
  return (
    <div style={{ marginTop: 10 }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 130 }} preserveAspectRatio="none">
        <polygon points={area} fill="rgba(0,229,255,.12)" />
        <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth={2} />
        {datos.map((d, i) => <circle key={i} cx={x(i)} cy={y(d.venta)} r={2.2} fill="var(--accent)" />)}
      </svg>
      <div className="muted" style={{ fontSize: 11, display: 'flex', justifyContent: 'space-between' }}>
        <span>{datos[0].dia.slice(5)}</span>
        <span>Total {corto(totalP)} · {n} días</span>
        <span>{datos[n - 1].dia.slice(5)}</span>
      </div>
    </div>
  );
}

function TablaVendedores({ items }: { items: EjecItem[] }) {
  const total = items.reduce((s, x) => s + Number(x.venta), 0);
  if (!items.length) return <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>Sin ventas en el período.</p>;
  return (
    <div style={{ overflowX: 'auto', marginTop: 8 }}>
      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', minWidth: 480 }}>
        <thead>
          <tr className="muted" style={{ textAlign: 'right' }}>
            <th style={{ textAlign: 'left', fontWeight: 600, padding: '4px 6px' }}>#</th>
            <th style={{ textAlign: 'left', fontWeight: 600, padding: '4px 6px' }}>Vendedor</th>
            <th style={{ fontWeight: 600, padding: '4px 6px' }}>Venta</th>
            <th style={{ fontWeight: 600, padding: '4px 6px' }}>Part.</th>
            <th style={{ fontWeight: 600, padding: '4px 6px' }}>Pedidos</th>
            <th style={{ fontWeight: 600, padding: '4px 6px' }}>Unidades</th>
          </tr>
        </thead>
        <tbody>
          {items.map((v, i) => (
            <tr key={i} style={{ textAlign: 'right', borderTop: '1px solid var(--border)' }}>
              <td className="mono muted" style={{ textAlign: 'left', padding: '5px 6px' }}>{i + 1}</td>
              <td style={{ textAlign: 'left', padding: '5px 6px' }}>{v.nombre}{v.zona ? <span className="muted" style={{ fontSize: 10 }}> · {v.zona}</span> : ''}</td>
              <td className="mono green" style={{ padding: '5px 6px' }}>{corto(Number(v.venta))}</td>
              <td className="mono" style={{ padding: '5px 6px' }}>{total > 0 ? pct(Number(v.venta) / total) : '0%'}</td>
              <td className="mono" style={{ padding: '5px 6px' }}>{v.pedidos ?? 0}</td>
              <td className="mono" style={{ padding: '5px 6px' }}>{(v.unidades ?? 0).toLocaleString('es-CO')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
