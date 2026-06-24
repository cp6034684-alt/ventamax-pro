import { useState } from 'react';
import * as XLSX from 'xlsx';
import { FacturaDetalle } from '../../components/FacturaDetalle';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { reportesApi } from '../../api/servicios';
import { fmtMoneda } from '../../api/formato';
import type { EjecItem, ComparativoMes, CompDim, CompVend, CarteraCliente, CarteraFacturaDet } from '../../api/tipos';

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
  const [vista, setVista] = useState<'resumen' | 'comparativo' | 'cartera'>('resumen');
  const [periodo, setPeriodo] = useState('mes');
  const [mesesComp, setMesesComp] = useState(6);
  const [desde, setDesde] = useState(inicioMesISO());
  const [hasta, setHasta] = useState(hoyISO());

  const { data, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ['ejecutivo', periodo, mesesComp, periodo === 'rango' ? desde : '', periodo === 'rango' ? hasta : ''],
    queryFn: () => reportesApi.ejecutivo(periodo === 'rango' ? { periodo, desde, hasta, meses: mesesComp } : { periodo, meses: mesesComp }),
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

      {/* Conmutador de vista */}
      <div style={{ display: 'flex', gap: 8 }}>
        {([['resumen', '📊 Resumen'], ['comparativo', '📅 Mes vs mes anterior'], ['cartera', '💳 Cartera']] as const).map(([id, lab]) => (
          <button key={id} className={`btn ${vista === id ? '' : 'btn-ghost'}`} style={{ flex: 1, fontSize: 12, padding: '8px' }} onClick={() => setVista(id)}>{lab}</button>
        ))}
      </div>

      {vista === 'comparativo' ? <ComparativoView /> : vista === 'cartera' ? <CarteraView /> : (<>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <strong style={{ fontSize: 13 }}>📈 Comparativo entre meses</strong>
            <div style={{ display: 'flex', gap: 4 }}>
              {[3, 6, 12, 24].map(n => (
                <button key={n} className={`btn ${mesesComp === n ? '' : 'btn-ghost'}`} style={{ fontSize: 10, padding: '3px 8px' }} onClick={() => setMesesComp(n)}>{n}m</button>
              ))}
            </div>
          </div>
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
      </>)}
    </div>
  );
}

// ── Comparativo mes en curso vs mes anterior (mismo nro de días) ──
function deltaInfo(act: number, ant: number) {
  if (ant <= 0) return { txt: act > 0 ? 'nuevo' : '—', color: act > 0 ? 'var(--green)' : 'var(--muted)' };
  const d = (act - ant) / ant;
  return { txt: `${d >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(d * 100))}%`, color: d >= 0 ? 'var(--green)' : 'var(--red)' };
}

function KpiComp({ label, act, ant, money }: { label: string; act: number; ant: number; money?: boolean }) {
  const di = deltaInfo(act, ant);
  const fmt = (n: number) => money ? fmtMoneda(n) : n.toLocaleString('es-CO');
  return (
    <div className="card" style={{ padding: '12px 14px' }}>
      <div className="muted" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.5px' }}>{label}</div>
      <div className="mono" style={{ fontSize: 20, fontWeight: 800, marginTop: 2 }}>{fmt(act)}</div>
      <div className="muted" style={{ fontSize: 11 }}>ant. {money ? corto(ant) : ant.toLocaleString('es-CO')} · <span style={{ color: di.color, fontWeight: 700 }}>{di.txt}</span></div>
    </div>
  );
}

function DimComp({ titulo, items, top = 12 }: { titulo: string; items: CompDim[]; top?: number }) {
  const totalAct = items.reduce((s, x) => s + x.ventaAct, 0);
  const max = Math.max(1, ...items.map(x => Math.max(x.ventaAct, x.ventaAnt)));
  const lista = items.slice(0, top);
  return (
    <div className="card">
      <strong style={{ fontSize: 13 }}>{titulo}</strong>
      <div style={{ display: 'grid', gap: 9, marginTop: 10 }}>
        {!lista.length && <p className="muted" style={{ fontSize: 12 }}>Sin datos.</p>}
        {lista.map((x, i) => {
          const di = deltaInfo(x.ventaAct, x.ventaAnt);
          return (
            <div key={i}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, marginBottom: 3 }}>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.nombre}</span>
                <span className="mono" style={{ flexShrink: 0 }}>{corto(x.ventaAct)} <span className="muted">· {totalAct > 0 ? `${Math.round((x.ventaAct / totalAct) * 100)}%` : '0%'}</span> · <span style={{ color: di.color, fontWeight: 700 }}>{di.txt}</span></span>
              </div>
              <div style={{ display: 'grid', gap: 2 }}>
                <div title={`Actual: ${fmtMoneda(x.ventaAct)}`} style={{ height: 6, background: 'rgba(255,255,255,.06)', borderRadius: 20, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(x.ventaAct / max) * 100}%`, background: 'var(--accent)', borderRadius: 20 }} />
                </div>
                <div title={`Mes anterior: ${fmtMoneda(x.ventaAnt)}`} style={{ height: 4, background: 'rgba(255,255,255,.04)', borderRadius: 20, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(x.ventaAnt / max) * 100}%`, background: 'var(--muted)', borderRadius: 20 }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="muted" style={{ fontSize: 10, marginTop: 8 }}>▬ Barra superior = mes actual · ▬ inferior = mes anterior</div>
    </div>
  );
}

function celdaDelta(act: number, ant: number) {
  const di = deltaInfo(act, ant);
  return <span style={{ color: di.color, fontWeight: 700 }}>{di.txt}</span>;
}

function TablaVendComp({ items }: { items: CompVend[] }) {
  if (!items.length) return <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>Sin ventas en el período.</p>;
  return (
    <div style={{ overflowX: 'auto', marginTop: 8 }}>
      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', minWidth: 640 }}>
        <thead>
          <tr className="muted" style={{ textAlign: 'right' }}>
            <th style={{ textAlign: 'left', fontWeight: 600, padding: '4px 6px' }}>Vendedor</th>
            <th style={{ fontWeight: 600, padding: '4px 6px' }}>Venta act.</th>
            <th style={{ fontWeight: 600, padding: '4px 6px' }}>Venta ant.</th>
            <th style={{ fontWeight: 600, padding: '4px 6px' }}>Δ Venta</th>
            <th style={{ fontWeight: 600, padding: '4px 6px' }}>Pedidos</th>
            <th style={{ fontWeight: 600, padding: '4px 6px' }}>Δ Ped.</th>
            <th style={{ fontWeight: 600, padding: '4px 6px' }}>Impactos</th>
            <th style={{ fontWeight: 600, padding: '4px 6px' }}>Δ Imp.</th>
            <th style={{ fontWeight: 600, padding: '4px 6px' }}>Unid.</th>
          </tr>
        </thead>
        <tbody>
          {items.map((v, i) => (
            <tr key={i} style={{ textAlign: 'right', borderTop: '1px solid var(--border)' }}>
              <td style={{ textAlign: 'left', padding: '5px 6px' }}>{v.nombre}{v.zona ? <span className="muted" style={{ fontSize: 10 }}> · {v.zona}</span> : ''}</td>
              <td className="mono green" style={{ padding: '5px 6px' }}>{corto(v.ventaAct)}</td>
              <td className="mono muted" style={{ padding: '5px 6px' }}>{corto(v.ventaAnt)}</td>
              <td style={{ padding: '5px 6px' }}>{celdaDelta(v.ventaAct, v.ventaAnt)}</td>
              <td className="mono" style={{ padding: '5px 6px' }}>{v.pedAct} <span className="muted">/ {v.pedAnt}</span></td>
              <td style={{ padding: '5px 6px' }}>{celdaDelta(v.pedAct, v.pedAnt)}</td>
              <td className="mono" style={{ padding: '5px 6px' }}>{v.cliAct} <span className="muted">/ {v.cliAnt}</span></td>
              <td style={{ padding: '5px 6px' }}>{celdaDelta(v.cliAct, v.cliAnt)}</td>
              <td className="mono" style={{ padding: '5px 6px' }}>{v.undAct.toLocaleString('es-CO')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ComparativoView() {
  const { data, isFetching } = useQuery({
    queryKey: ['comparativo-mes'], queryFn: () => reportesApi.comparativo(), refetchInterval: 60_000,
  });
  const t = data?.total;
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="card" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 13 }}>📅 {data?.actualLabel ?? '…'} <span className="muted">vs</span> {data?.anteriorLabel ?? '…'}</strong>
        <span className="muted" style={{ fontSize: 11 }}>· comparación justa: primeros {data?.diasComparados ?? 0} días de cada mes{isFetching ? ' · actualizando…' : ''}</span>
      </div>

      {/* KPIs comparativos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 10 }}>
        <KpiComp label="VENTA" act={t?.ventaAct ?? 0} ant={t?.ventaAnt ?? 0} money />
        <KpiComp label="PEDIDOS" act={t?.pedAct ?? 0} ant={t?.pedAnt ?? 0} />
        <KpiComp label="IMPACTOS (clientes)" act={t?.cliAct ?? 0} ant={t?.cliAnt ?? 0} />
        <KpiComp label="UNIDADES" act={t?.undAct ?? 0} ant={t?.undAnt ?? 0} />
      </div>

      {/* Vendedores: venta, pedidos, impactos */}
      <div className="card">
        <strong style={{ fontSize: 13 }}>🥇 Por vendedor · venta · pedidos · impactos (act. / ant.)</strong>
        <TablaVendComp items={data?.vendedor ?? []} />
      </div>

      {/* Dimensiones */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px,1fr))', gap: 12 }}>
        <DimComp titulo="🌎 Por regional" items={data?.regional ?? []} />
        <DimComp titulo="📦 Por categoría" items={data?.categoria ?? []} />
        <DimComp titulo="🏷 Por marca" items={data?.marca ?? []} />
      </div>

      <p className="muted" style={{ fontSize: 11, textAlign: 'center' }}>Compara el mes en curso contra el mismo número de días del mes anterior · datos en vivo.</p>
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

// ── Cartera (deudas fiadas) ──
const EMPRESA = 'SANTANA DEL EJE';
function colorMora(d: number) { return d > 30 ? 'var(--red)' : d > 15 ? 'var(--orange)' : 'var(--green)'; }

function mensajeCobro(c: CarteraCliente) {
  const d = c.diasMoraMax;
  const saldo = fmtMoneda(c.saldo);
  const detalle = c.facturas.map(f => `• FAC-${String(f.consecutivo).padStart(4, '0')} — ${fmtMoneda(f.saldo)} (${f.diasMora} días)`).join('\n');
  let saludo: string;
  if (d <= 7) saludo = `¡Hola ${c.nombre}! Esperamos que se encuentre muy bien. Le escribimos de ${EMPRESA} para recordarle amablemente que tiene un saldo pendiente con nosotros.`;
  else if (d <= 20) saludo = `Hola ${c.nombre}, le saludamos de ${EMPRESA}. Le recordamos cordialmente que su cuenta presenta ${d} días de mora. Agradecemos mucho su pronto pago.`;
  else if (d <= 45) saludo = `Estimado(a) ${c.nombre}, de ${EMPRESA}. Su cuenta presenta ${d} días de mora. Le solicitamos amablemente regularizar su saldo a la mayor brevedad posible.`;
  else saludo = `Estimado(a) ${c.nombre}, le contactamos de ${EMPRESA}. Su saldo presenta ${d} días de mora. Es importante ponerse al día para evitar inconvenientes; quedamos muy atentos para ayudarle.`;
  return `${saludo}\n\n💰 Saldo total pendiente: ${saldo}\n${detalle}\n\nSi ya realizó el pago, por favor ignore este mensaje. ¡Gracias por su confianza! 🙏\n${EMPRESA}`;
}
function waCobro(c: CarteraCliente) {
  const tel = String(c.telefono ?? '').replace(/\D/g, '');
  const num = tel.length === 10 ? '57' + tel : tel;
  return `https://wa.me/${num}?text=${encodeURIComponent(mensajeCobro(c))}`;
}

function exportarCartera(clientes: CarteraCliente[]) {
  const filas: any[] = [];
  for (const c of clientes) for (const f of c.facturas) {
    const fecha = new Date(f.creadoEn).toISOString().slice(0, 10);
    for (const it of (f.items ?? [])) {
      filas.push({
        Cliente: c.nombre, NIT: c.nit ?? '', Telefono: c.telefono ?? '', Barrio: c.barrio ?? '', Ciudad: c.ciudad ?? '',
        Vendedor: c.vendedor ?? '', Factura: `FAC-${String(f.consecutivo).padStart(4, '0')}`, Fecha: fecha,
        'Días mora': f.diasMora, Producto: it.producto?.nombre ?? '', Cantidad: it.cantidad,
        'Valor unitario': Number(it.precioUnit), 'Valor producto fiado': Number(it.total),
        'Total factura': Number(f.total), Pagado: Number(f.pagado), 'Saldo factura': f.saldo,
      });
    }
    if (!(f.items ?? []).length) {
      filas.push({ Cliente: c.nombre, NIT: c.nit ?? '', Telefono: c.telefono ?? '', Barrio: c.barrio ?? '', Ciudad: c.ciudad ?? '',
        Vendedor: c.vendedor ?? '', Factura: `FAC-${String(f.consecutivo).padStart(4, '0')}`, Fecha: fecha, 'Días mora': f.diasMora,
        Producto: '', Cantidad: '', 'Valor unitario': '', 'Valor producto fiado': '', 'Total factura': Number(f.total), Pagado: Number(f.pagado), 'Saldo factura': f.saldo });
    }
  }
  if (!filas.length) { alert('No hay cartera para exportar.'); return; }
  const hoja = XLSX.utils.json_to_sheet(filas);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Cartera');
  XLSX.writeFile(libro, `cartera_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function CarteraView() {
  const { data, isFetching } = useQuery({ queryKey: ['cartera-detalle'], queryFn: () => reportesApi.carteraDetalle(), refetchInterval: 60_000 });
  const [q, setQ] = useState('');
  const [abierto, setAbierto] = useState<string | null>(null);
  const [facSel, setFacSel] = useState<CarteraFacturaDet | null>(null);

  const filtro = q.trim().toLowerCase();
  const clientes = (data?.clientes ?? []).filter(c => !filtro ||
    c.nombre.toLowerCase().includes(filtro) || (c.nit ?? '').includes(filtro) ||
    (c.barrio ?? '').toLowerCase().includes(filtro) || (c.telefono ?? '').includes(filtro));
  const vencida = (data?.clientes ?? []).filter(c => c.diasMoraMax > 30).reduce((s, c) => s + c.saldo, 0);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 10 }}>
        <KPI titulo="CARTERA TOTAL" valor={fmtMoneda(data?.total ?? 0)} sub={`${data?.totalClientes ?? 0} clientes`} color="var(--orange)" />
        <KPI titulo="FACTURAS FIADAS" valor={String(data?.totalFacturas ?? 0)} color="var(--accent)" />
        <KPI titulo="VENCIDA (+30 días)" valor={fmtMoneda(vencida)} color="var(--red)" />
        <div className="card" style={{ display: 'grid', placeItems: 'center', padding: 10 }}>
          <button className="btn" style={{ width: '100%' }} onClick={() => exportarCartera(data?.clientes ?? [])}>⬇ Exportar Excel</button>
        </div>
      </div>

      <input placeholder="🔎 Buscar por nombre, NIT, barrio o teléfono…" value={q} onChange={e => setQ(e.target.value)} />
      {isFetching && <div className="muted" style={{ fontSize: 11 }}>actualizando…</div>}
      {!clientes.length && <div className="card muted" style={{ fontSize: 13, textAlign: 'center', padding: 16 }}>Sin cartera pendiente.</div>}

      {clientes.map(c => {
        const abrir = abierto === c.id;
        return (
          <div key={c.id} className="card" style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => setAbierto(abrir ? null : c.id)}>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{abrir ? '▾' : '▸'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ fontSize: 14 }}>{c.nombre}</strong>
                <div className="muted" style={{ fontSize: 11 }}>
                  {[c.barrio, c.telefono, c.vendedor].filter(Boolean).join(' · ')}
                  {c.facturas.length ? ` · ${c.facturas.length} facturas` : ''}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="mono" style={{ fontSize: 15, fontWeight: 800, color: 'var(--orange)' }}>{fmtMoneda(c.saldo)}</div>
                <span style={{ fontSize: 10, fontWeight: 700, color: colorMora(c.diasMoraMax) }}>{c.diasMoraMax} días mora</span>
              </div>
            </div>

            {abrir && (
              <div style={{ display: 'grid', gap: 4, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                {c.facturas.map(f => (
                  <button key={f.id} className="btn btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', textAlign: 'left' }}
                    onClick={() => setFacSel(f)}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span className="mono" style={{ fontSize: 12, fontWeight: 700 }}>FAC-{String(f.consecutivo).padStart(4, '0')}</span>
                      <span className="muted" style={{ fontSize: 11 }}> · {new Date(f.creadoEn).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: '2-digit' })}</span>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: colorMora(f.diasMora) }}>{f.diasMora}d</span>
                    <span className="mono" style={{ fontSize: 13, color: 'var(--orange)', minWidth: 70, textAlign: 'right' }}>{fmtMoneda(f.saldo)}</span>
                    <span style={{ color: 'var(--accent)' }}>›</span>
                  </button>
                ))}
                <a className="btn" href={waCobro(c)} target="_blank" rel="noreferrer"
                  style={{ textAlign: 'center', textDecoration: 'none', marginTop: 4, background: 'linear-gradient(135deg, #25D366, #128C7E)' }}>
                  💬 Recordar deuda por WhatsApp
                </a>
              </div>
            )}
          </div>
        );
      })}

      {facSel && <FacturaDetalle factura={facSel} onCerrar={() => setFacSel(null)} />}
    </div>
  );
}
