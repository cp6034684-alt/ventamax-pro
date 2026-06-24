import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { reportesApi, facturasApi, presenciaApi } from '../../api/servicios';
import { fmtMoneda } from '../../api/formato';
import { useAuth } from '../../auth/AuthContext';
import { FacturaDetalle } from '../../components/FacturaDetalle';
import type { Periodo, Factura } from '../../api/tipos';

// ── Router por rol: el admin/coadmin ven el panel de control completo ──
export function DashboardPage() {
  const { usuario } = useAuth();
  // Admin, co-admin y supervisor ven el panel de control completo (auditoría).
  const verPanel = usuario?.rol === 'ADMIN' || usuario?.rol === 'COADMIN' || usuario?.rol === 'SUPERVISOR';
  return verPanel ? <DashboardAdmin /> : <DashboardVendedor />;
}

// ──────────────────────────────────────────────────────────────
// Utilidades de fechas (en horario local)
const localISO = (d: Date) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};

type FiltroFac = 'dia' | 'semana' | 'mes' | 'todo' | 'rango';

function rangoFacturas(filtro: FiltroFac, rango: { desde: string; hasta: string }) {
  const hoy = new Date();
  if (filtro === 'rango') return { desde: rango.desde, hasta: rango.hasta };
  if (filtro === 'dia') return { desde: localISO(hoy), hasta: localISO(hoy) };
  if (filtro === 'semana') { const d = new Date(); d.setDate(d.getDate() - 6); return { desde: localISO(d), hasta: localISO(hoy) }; }
  if (filtro === 'mes') { const d = new Date(); d.setDate(1); return { desde: localISO(d), hasta: localISO(hoy) }; }
  return { desde: '', hasta: '' }; // todo
}

const LABEL_PERIODO: Record<Periodo, string> = { dia: 'Hoy', semana: 'Semana', mes: 'Mes', todo: 'Total' };

// Botón-pastilla de filtro (estilo idéntico al sistema viejo)
function Pill({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 10px', fontSize: 10, fontWeight: 700, borderRadius: 9, cursor: 'pointer',
        border: activo ? 'none' : '1px solid var(--border)',
        background: activo ? 'linear-gradient(135deg, var(--accent), #0044ff)' : 'var(--bg3)',
        color: activo ? '#fff' : 'var(--muted)',
      }}
    >
      {children}
    </button>
  );
}

// ──────────────────────────────────────────────────────────────
// DASHBOARD ADMIN — réplica del "panel de arranque" del sistema viejo
// ──────────────────────────────────────────────────────────────
function DashboardAdmin() {
  const [periAsesor, setPeriAsesor] = useState<Periodo>('dia');
  const [asesoresAbierto, setAsesoresAbierto] = useState(false);
  const [filtroFac, setFiltroFac] = useState<FiltroFac>('dia');
  const [rango, setRango] = useState({ desde: localISO(new Date()), hasta: localISO(new Date()) });
  const [mostrarRango, setMostrarRango] = useState(false);
  const [buscar, setBuscar] = useState('');

  const { data: presentes } = useQuery({
    queryKey: ['presencia'], queryFn: presenciaApi.enLinea, refetchInterval: 15_000,
  });
  const { data: asesores } = useQuery({
    queryKey: ['asesores', periAsesor], queryFn: () => reportesApi.asesores(periAsesor),
    refetchInterval: 60_000,
  });
  const { data: panel } = useQuery({
    queryKey: ['panel-admin'], queryFn: reportesApi.panel, refetchInterval: 60_000,
  });

  const fr = rangoFacturas(filtroFac, rango);
  const { data: facturas } = useQuery({
    queryKey: ['dash-facturas', filtroFac, fr.desde, fr.hasta],
    queryFn: () => {
      const p: Record<string, string> = { pagina: '1', porPagina: '40' };
      if (fr.desde) p.desde = fr.desde;
      if (fr.hasta) p.hasta = fr.hasta;
      return facturasApi.listar(p);
    },
  });

  const filtro = buscar.trim().toLowerCase();
  const ultimas = (facturas?.datos ?? []).filter(f =>
    !filtro ||
    String(f.consecutivo).includes(filtro) ||
    (f.cliente?.nombre ?? '').toLowerCase().includes(filtro) ||
    (f.vendedor?.nombre ?? '').toLowerCase().includes(filtro),
  );

  return (
    <div style={{ display: 'grid', gap: 14, maxWidth: 700, margin: '0 auto' }}>

      {/* ── Acceso al Dashboard Ejecutivo ── */}
      <Link to="/dashboard-ejecutivo" className="card" style={{
        display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'var(--text)',
        background: 'linear-gradient(135deg, rgba(0,68,255,.25), rgba(0,229,255,.12))', border: '1px solid rgba(0,229,255,.35)',
      }}>
        <span style={{ fontSize: 26 }}>📊</span>
        <div style={{ flex: 1 }}>
          <strong style={{ fontSize: 15 }}>Dashboard Ejecutivo</strong>
          <div className="muted" style={{ fontSize: 12 }}>KPIs, participación, comparativos, proyección y alertas · en línea</div>
        </div>
        <span style={{ fontSize: 18, color: 'var(--accent)' }}>›</span>
      </Link>

      {/* ── Presencia en tiempo real ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%', background: 'var(--green)',
            boxShadow: '0 0 6px var(--green)', display: 'inline-block',
          }} />
          <span className="muted" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px' }}>
            En línea
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {!presentes?.length && <span className="muted" style={{ fontSize: 11 }}>Sin asesores conectados</span>}
          {presentes?.map(p => (
            <span key={p.id} title={p.nombre} style={{
              display: 'flex', alignItems: 'center', gap: 5, background: 'var(--bg3)',
              border: '1px solid var(--border)', borderRadius: 20, padding: '2px 9px 2px 3px', fontSize: 11,
            }}>
              <span style={{
                width: 18, height: 18, borderRadius: '50%', background: 'rgba(0,229,160,.2)',
                color: 'var(--green)', fontSize: 9, fontWeight: 800, display: 'grid', placeItems: 'center',
              }}>{p.inicial}</span>
              {p.nombre.split(' ')[0]}
            </span>
          ))}
        </div>
      </div>

      {/* ── Asesores – periodo ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setAsesoresAbierto(v => !v)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6, padding: 0 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{asesoresAbierto ? '▾' : '▸'}</span>
            <strong style={{ fontSize: 14 }}>Asesores – {LABEL_PERIODO[periAsesor]}</strong>
            <span className="muted" style={{ fontSize: 11 }}>({asesores?.ranking.length ?? 0})</span>
          </button>
          <div style={{ flex: 1 }} />
          {asesoresAbierto && (
            <div style={{ display: 'flex', gap: 4 }}>
              {(['dia', 'semana', 'mes', 'todo'] as Periodo[]).map(p => (
                <Pill key={p} activo={periAsesor === p} onClick={() => setPeriAsesor(p)}>{LABEL_PERIODO[p]}</Pill>
              ))}
            </div>
          )}
        </div>
        {asesoresAbierto && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {!asesores?.ranking.length && (
            <div className="muted" style={{ fontSize: 12, padding: 16, textAlign: 'center' }}>Sin asesores.</div>
          )}
          {asesores?.ranking.map((a, i) => (
            <div key={a.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px',
              borderTop: i ? '1px solid var(--border)' : 'none', borderLeft: `3px solid ${a.color}`,
            }}>
              <span style={{
                width: 26, height: 26, borderRadius: '50%', background: `${a.color}22`,
                color: a.color, fontSize: 11, fontWeight: 800, display: 'grid', placeItems: 'center', flexShrink: 0,
              }}>{a.inicial}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {a.nombre} <span className="muted" style={{ fontSize: 11, fontWeight: 500 }}>({a.pedidos})</span>
                </div>
              </div>
              <span className="mono green" style={{ fontSize: 13, fontWeight: 700 }}>{fmtMoneda(a.total)}</span>
            </div>
          ))}
        </div>
        )}
      </div>

      {/* ── Facturas – encabezado + filtros ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 14 }}>Facturas</strong>
          <span className="mono" style={{
            fontSize: 11, fontWeight: 700, background: 'var(--bg3)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '1px 8px', color: 'var(--accent)',
          }}>{facturas?.paginacion.total ?? 0}</span>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {(['dia', 'semana', 'mes', 'todo'] as FiltroFac[]).map(f => (
              <Pill key={f} activo={filtroFac === f} onClick={() => { setFiltroFac(f); setMostrarRango(false); }}>
                {f === 'dia' ? 'Hoy' : f === 'semana' ? 'Semana' : f === 'mes' ? 'Mes' : 'Total'}
              </Pill>
            ))}
            <Pill activo={filtroFac === 'rango'} onClick={() => { setFiltroFac('rango'); setMostrarRango(v => !v); }}>📅 Rango</Pill>
          </div>
        </div>
        {mostrarRango && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
            <input type="date" value={rango.desde} onChange={e => setRango(r => ({ ...r, desde: e.target.value }))}
              style={{ flex: 1, minWidth: 130, fontSize: 12, padding: '6px 9px' }} />
            <span className="muted" style={{ fontSize: 11 }}>→</span>
            <input type="date" value={rango.hasta} onChange={e => setRango(r => ({ ...r, hasta: e.target.value }))}
              style={{ flex: 1, minWidth: 130, fontSize: 12, padding: '6px 9px' }} />
          </div>
        )}
      </div>

      {/* ── Resumen del día (panel de arranque) ── */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(0,200,255,.06), rgba(192,132,252,.04))',
        border: '1px solid rgba(0,200,255,.2)', borderRadius: 14, padding: '14px 14px 12px',
      }}>
        <div style={{
          fontSize: 11, fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase',
          letterSpacing: '.7px', marginBottom: 10,
        }}>Resumen — Hoy</div>

        {/* Total del mes + factura pendiente */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
          <div style={{ background: 'rgba(192,132,252,.08)', border: '1px solid rgba(192,132,252,.2)', borderRadius: 11, padding: '9px 11px' }}>
            <div className="muted" style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 3 }}>Total del mes</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--purple)' }}>{fmtMoneda(panel?.totalMes ?? 0)}</div>
            <div className="muted" style={{ fontSize: 9, marginTop: 2 }}>{panel?.pedidosMes ?? 0} facturas</div>
          </div>
          <div style={{ background: 'rgba(255,170,0,.08)', border: '1px solid rgba(255,170,0,.2)', borderRadius: 11, padding: '9px 11px' }}>
            <div className="muted" style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 3 }}>⚠️ Factura pendiente</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: panel?.pendiente.count ? 'var(--orange)' : 'var(--green)' }}>
              {panel?.pendiente.count ? fmtMoneda(panel.pendiente.total) : 'Al día'}
            </div>
            <div className="muted" style={{ fontSize: 9, marginTop: 2 }}>
              {panel?.pendiente.count ? `${panel.pendiente.count} factura${panel.pendiente.count !== 1 ? 's' : ''}` : '✅ Sin pendientes'}
            </div>
          </div>
        </div>

        {/* Tu ruta de hoy */}
        {!!panel?.rutaHoy.total && (
          <div style={{ background: 'rgba(0,200,255,.06)', border: '1px solid rgba(0,200,255,.15)', borderRadius: 11, padding: '10px 12px', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.5px' }}>📍 Tu ruta de hoy</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>{panel.rutaHoy.total} clientes</div>
            </div>
            {panel.rutaHoy.clientes.map((c, ci) => (
              <div key={c.id} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0',
                borderBottom: ci < panel.rutaHoy.clientes.length - 1 ? '1px solid rgba(255,255,255,.05)' : 'none',
              }}>
                <span style={{
                  width: 18, height: 18, borderRadius: '50%', background: 'rgba(0,200,255,.15)',
                  color: 'var(--accent)', fontSize: 9, fontWeight: 800, display: 'grid', placeItems: 'center', flexShrink: 0,
                }}>{ci + 1}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.nombre}</div>
                  {(c.barrio || c.direccion) && (
                    <div className="muted" style={{ fontSize: 9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.barrio || c.direccion}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {panel.rutaHoy.total > panel.rutaHoy.clientes.length && (
              <div className="muted" style={{ fontSize: 10, marginTop: 6, textAlign: 'center' }}>
                + {panel.rutaHoy.total - panel.rutaHoy.clientes.length} clientes más
              </div>
            )}
          </div>
        )}

        {/* Clientes en riesgo */}
        {!!panel?.riesgo.length && (
          <div style={{ background: 'rgba(255,64,96,.06)', border: '1px solid rgba(255,64,96,.15)', borderRadius: 11, padding: '10px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '.5px' }}>🔴 Clientes en riesgo</div>
              <div className="muted" style={{ fontSize: 9 }}>Sin comprar 7+ días</div>
            </div>
            {panel.riesgo.map((r, ri) => {
              const col = r.dias >= 30 ? 'var(--red)' : r.dias >= 14 ? 'var(--orange)' : '#fbbf24';
              const txt = r.dias >= 999 ? 'Nunca ha comprado' : `${r.dias} días sin comprar`;
              return (
                <div key={r.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0',
                  borderBottom: ri < panel.riesgo.length - 1 ? '1px solid rgba(255,255,255,.05)' : 'none',
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: col, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.nombre}</div>
                    <div style={{ fontSize: 9, fontWeight: 600, color: col }}>{txt}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Buscador + últimas facturas ── */}
      <input
        placeholder="🔍 Buscar cliente, factura, vendedor…"
        value={buscar}
        onChange={e => setBuscar(e.target.value)}
        style={{ fontSize: 12, padding: '8px 12px' }}
      />
      <div className="card">
        {!ultimas.length && <p className="muted" style={{ fontSize: 13 }}>Sin facturas en este periodo.</p>}
        {ultimas.map(f => (
          <div key={f.id} style={{
            display: 'flex', justifyContent: 'space-between', padding: '9px 0',
            borderBottom: '1px solid var(--border)', fontSize: 13, gap: 8,
          }}>
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              #{f.consecutivo} · {f.cliente?.nombre ?? '—'}
              {f.vendedor?.nombre && <span className="muted"> · {f.vendedor.nombre.split(' ')[0]}</span>}
            </span>
            <span className="mono">{fmtMoneda(f.total)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Estado visible de una factura/devolución: etiqueta, color y borde para la lista.
function estadoFactura(f: { estado: string; tipoDoc?: string; devuelta?: string }) {
  if (f.tipoDoc === 'DEVOLUCION') return { label: 'Devolución', color: 'var(--red)', icono: '↩️' };
  if (f.estado === 'DEVUELTA' || f.devuelta === 'TOTAL') return { label: 'Devolución', color: 'var(--red)', icono: '↩️' };
  if (f.devuelta === 'PARCIAL') return { label: 'Dev. Parcial', color: 'var(--orange)', icono: '↩️' };
  switch (f.estado) {
    case 'PENDIENTE': return { label: 'Pendiente', color: '#38bdf8', icono: '🧾' };
    case 'ENTREGADA': return { label: 'Entregado', color: 'var(--green)', icono: '✅' };
    case 'PAGADA':    return { label: 'Pagado', color: 'var(--green)', icono: '✅' };
    case 'CREDITO':   return { label: 'Fiado', color: 'var(--orange)', icono: '⏳' };
    case 'ANULADA':   return { label: 'Anulada', color: 'var(--muted)', icono: '✖️' };
    default:          return { label: f.estado, color: 'var(--muted)', icono: '•' };
  }
}

const LABEL_METODO: Record<string, string> = {
  EFECTIVO: 'Efectivo', TRANSFERENCIA: 'Transferencia', CREDITO: 'Crédito',
};

function fmtFechaHora(iso: string) {
  return new Date(iso).toLocaleString('es-CO', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

// ──────────────────────────────────────────────────────────────
// DASHBOARD VENDEDOR — réplica del "panel de arranque" del sistema viejo:
// Resumen histórico, Tu día (ruta/riesgo), Mi semana y lista de facturas.
// ──────────────────────────────────────────────────────────────
function DashboardVendedor() {
  const [filtroFac, setFiltroFac] = useState<FiltroFac>('todo');
  const [rango, setRango] = useState({ desde: localISO(new Date()), hasta: localISO(new Date()) });
  const [mostrarRango, setMostrarRango] = useState(false);
  const [tab, setTab] = useState<'cat' | 'prod'>('prod');
  const [buscar, setBuscar] = useState('');
  const [detalle, setDetalle] = useState<Factura | null>(null);

  const fr = rangoFacturas(filtroFac, rango);
  const { data: hist } = useQuery({
    queryKey: ['dash-historico', filtroFac, fr.desde, fr.hasta],
    queryFn: () => reportesApi.dashboard(filtroFac, fr.desde || undefined, fr.hasta || undefined),
    refetchInterval: 60_000,
  });

  const { data: panel } = useQuery({ queryKey: ['panel-vendedor'], queryFn: reportesApi.panel, refetchInterval: 60_000 });
  const { data: semana } = useQuery({ queryKey: ['semana'], queryFn: reportesApi.semana });
  const { data: facturas } = useQuery({
    queryKey: ['dash-facturas', filtroFac, fr.desde, fr.hasta],
    queryFn: () => {
      const p: Record<string, string> = { pagina: '1', porPagina: '40' };
      if (fr.desde) p.desde = fr.desde;
      if (fr.hasta) p.hasta = fr.hasta;
      return facturasApi.listar(p);
    },
  });

  const filtro = buscar.trim().toLowerCase();
  const facturasFiltradas = (facturas?.datos ?? []).filter(f =>
    !filtro ||
    String(f.consecutivo).includes(filtro) ||
    (f.cliente?.nombre ?? '').toLowerCase().includes(filtro) ||
    (LABEL_METODO[f.metodoPago ?? ''] ?? '').toLowerCase().includes(filtro),
  );

  const maxSemana = Math.max(1, ...(semana ?? []).map(d => d.total));

  const lista = (tab === 'cat' ? hist?.porCategoria : hist?.porProducto) ?? [];
  const maxLista = Math.max(1, ...lista.map(x => x.venta));
  const pctMeta = hist?.miMes.pct ?? 0;
  const metaCol = pctMeta >= 100 ? 'var(--green)' : pctMeta >= 60 ? 'var(--orange)' : 'var(--red)';

  return (
    <div style={{ display: 'grid', gap: 14, maxWidth: 700, margin: '0 auto' }}>

      {/* ── Facturas + filtros de periodo ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 14 }}>Facturas</strong>
          <span className="mono" style={{
            fontSize: 11, fontWeight: 700, background: 'var(--bg3)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '1px 8px', color: 'var(--accent)',
          }}>{hist?.pedidos ?? 0}</span>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {(['dia', 'semana', 'mes', 'todo'] as FiltroFac[]).map(f => (
              <Pill key={f} activo={filtroFac === f} onClick={() => { setFiltroFac(f); setMostrarRango(false); }}>
                {f === 'dia' ? 'Hoy' : f === 'semana' ? 'Semana' : f === 'mes' ? 'Mes' : 'Total'}
              </Pill>
            ))}
            <Pill activo={filtroFac === 'rango'} onClick={() => { setFiltroFac('rango'); setMostrarRango(v => !v); }}>📅 Rango</Pill>
          </div>
        </div>
        {mostrarRango && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
            <input type="date" value={rango.desde} onChange={e => setRango(r => ({ ...r, desde: e.target.value }))}
              style={{ flex: 1, minWidth: 130, fontSize: 12, padding: '6px 9px' }} />
            <span className="muted" style={{ fontSize: 11 }}>→</span>
            <input type="date" value={rango.hasta} onChange={e => setRango(r => ({ ...r, hasta: e.target.value }))}
              style={{ flex: 1, minWidth: 130, fontSize: 12, padding: '6px 9px' }} />
          </div>
        )}
      </div>

      {/* ── Resumen — Histórico (tarjetas + informe de productos) ── */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(0,200,255,.06), rgba(192,132,252,.04))',
        border: '1px solid rgba(0,200,255,.2)', borderRadius: 14, padding: '14px 14px 12px',
      }}>
        <div style={{
          fontSize: 11, fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase',
          letterSpacing: '.7px', marginBottom: 10,
        }}>Resumen — Histórico</div>

        {/* Tarjetas: Venta hoy · Mi mes · Clientes · Stock bajo */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div style={{ background: 'rgba(0,200,255,.06)', border: '1px solid rgba(0,200,255,.18)', borderRadius: 11, padding: '9px 11px' }}>
            <div className="muted" style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 3 }}>Venta hoy</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--accent)' }}>{fmtMoneda(hist?.ventaHoy.total ?? 0)}</div>
            <div className="muted" style={{ fontSize: 9, marginTop: 2 }}>{hist?.ventaHoy.facturas ?? 0} fac.</div>
          </div>
          <div style={{ background: 'rgba(192,132,252,.08)', border: '1px solid rgba(192,132,252,.2)', borderRadius: 11, padding: '9px 11px' }}>
            <div className="muted" style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 3 }}>{hist?.miMes.etiqueta ?? 'Mi Mes'}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--purple)' }}>{fmtMoneda(hist?.miMes.total ?? 0)}</div>
            <div style={{ fontSize: 9, fontWeight: 700, color: metaCol, marginTop: 2 }}>{pctMeta}% meta</div>
          </div>
          <div style={{ background: 'rgba(0,229,160,.06)', border: '1px solid rgba(0,229,160,.18)', borderRadius: 11, padding: '9px 11px' }}>
            <div className="muted" style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 3 }}>Clientes</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--green)' }}>{(hist?.clientesRegistrados ?? 0).toLocaleString('es-CO')}</div>
            <div className="muted" style={{ fontSize: 9, marginTop: 2 }}>registrados</div>
          </div>
          <div style={{ background: 'rgba(255,170,0,.08)', border: '1px solid rgba(255,170,0,.2)', borderRadius: 11, padding: '9px 11px' }}>
            <div className="muted" style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 3 }}>Stock bajo</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: hist?.stockBajo ? 'var(--orange)' : 'var(--green)' }}>{hist?.stockBajo ?? 0}</div>
            <div className="muted" style={{ fontSize: 9, marginTop: 2 }}>productos</div>
          </div>
        </div>

        {/* Pedidos · Venta neta · Ticket prom. */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div style={{ background: 'rgba(0,0,0,.18)', borderRadius: 10, padding: '8px 10px' }}>
            <div className="muted" style={{ fontSize: 8.5, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 3 }}>📦 Pedidos</div>
            <div className="mono" style={{ fontSize: 15, fontWeight: 800, color: 'var(--accent)' }}>{hist?.pedidos ?? 0}</div>
          </div>
          <div style={{ background: 'rgba(0,0,0,.18)', borderRadius: 10, padding: '8px 10px' }}>
            <div className="muted" style={{ fontSize: 8.5, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 3 }}>💰 Venta neta</div>
            <div className="mono green" style={{ fontSize: 14, fontWeight: 800 }}>{fmtMoneda(hist?.ventaNeta ?? 0)}</div>
          </div>
          <div style={{ background: 'rgba(0,0,0,.18)', borderRadius: 10, padding: '8px 10px' }}>
            <div className="muted" style={{ fontSize: 8.5, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 3 }}>🎟️ Ticket prom.</div>
            <div className="mono" style={{ fontSize: 14, fontWeight: 800 }}>{fmtMoneda(hist?.ticketProm ?? 0)}</div>
          </div>
        </div>

        {/* Contadores: devoluciones · fiados · clientes histórico */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(56,189,248,.12)', color: '#38bdf8', borderRadius: 8, padding: '3px 9px' }}>
            🔄 {hist?.devoluciones ?? 0} dev.
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(255,170,0,.12)', color: 'var(--orange)', borderRadius: 8, padding: '3px 9px' }}>
            ⚠️ {hist?.fiados ?? 0} fiado
          </span>
          <span className="muted" style={{ fontSize: 10, fontWeight: 600 }}>
            👤 {hist?.clientesHistorico ?? 0} clientes histórico
          </span>
        </div>

        {/* Informe Categorías / Productos */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <Pill activo={tab === 'cat'} onClick={() => setTab('cat')}>Categorías</Pill>
          <Pill activo={tab === 'prod'} onClick={() => setTab('prod')}>Productos</Pill>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
          <span className="muted mono" style={{ fontSize: 10 }}>
            {hist?.unidades ?? 0} und · {fmtMoneda(hist?.montoVenta ?? 0)}
          </span>
        </div>
        <div style={{ display: 'grid', gap: 5 }}>
          {!lista.length && <span className="muted" style={{ fontSize: 11 }}>Sin ventas en este periodo.</span>}
          {lista.map((x, i) => (
            <div key={i}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11, fontWeight: 700 }}>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.nombre}</span>
                <span className="mono muted" style={{ fontWeight: 500, flexShrink: 0 }}>{x.unidades} und · {fmtMoneda(x.venta)}</span>
              </div>
              <div style={{ height: 3, background: 'rgba(255,255,255,.06)', borderRadius: 20, marginTop: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.max(2, (x.venta / maxLista) * 100)}%`, background: 'linear-gradient(90deg, var(--accent), #0044ff)', borderRadius: 20 }} />
              </div>
            </div>
          ))}
        </div>

        {/* Totales por método de pago */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(0,229,160,.1)', color: 'var(--green)', borderRadius: 8, padding: '3px 9px' }}>
            Efectivo: {fmtMoneda(hist?.efectivo ?? 0)}
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(255,170,0,.1)', color: 'var(--orange)', borderRadius: 8, padding: '3px 9px' }}>
            Paga otro día: {fmtMoneda(hist?.pagaOtroDia ?? 0)}
          </span>
        </div>
      </div>

      {/* ── Tu día: ruta y clientes en riesgo ── */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(0,200,255,.06), rgba(192,132,252,.04))',
        border: '1px solid rgba(0,200,255,.2)', borderRadius: 14, padding: '14px 14px 12px',
      }}>
        <div style={{
          fontSize: 11, fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase',
          letterSpacing: '.7px', marginBottom: 10,
        }}>Tu día</div>

        {/* Tu ruta de hoy */}
        {!!panel?.rutaHoy.total && (
          <div style={{ background: 'rgba(0,200,255,.06)', border: '1px solid rgba(0,200,255,.15)', borderRadius: 11, padding: '10px 12px', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.5px' }}>📍 Tu ruta de hoy</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>{panel.rutaHoy.total} clientes</div>
            </div>
            {panel.rutaHoy.clientes.map((c, ci) => (
              <div key={c.id} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0',
                borderBottom: ci < panel.rutaHoy.clientes.length - 1 ? '1px solid rgba(255,255,255,.05)' : 'none',
              }}>
                <span style={{
                  width: 18, height: 18, borderRadius: '50%', background: 'rgba(0,200,255,.15)',
                  color: 'var(--accent)', fontSize: 9, fontWeight: 800, display: 'grid', placeItems: 'center', flexShrink: 0,
                }}>{ci + 1}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.nombre}</div>
                  {(c.barrio || c.direccion) && (
                    <div className="muted" style={{ fontSize: 9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.barrio || c.direccion}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {panel.rutaHoy.total > panel.rutaHoy.clientes.length && (
              <div className="muted" style={{ fontSize: 10, marginTop: 6, textAlign: 'center' }}>
                + {panel.rutaHoy.total - panel.rutaHoy.clientes.length} clientes más
              </div>
            )}
          </div>
        )}

        {/* Clientes en riesgo */}
        {!!panel?.riesgo.length && (
          <div style={{ background: 'rgba(255,64,96,.06)', border: '1px solid rgba(255,64,96,.15)', borderRadius: 11, padding: '10px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '.5px' }}>🔴 Clientes en riesgo</div>
              <div className="muted" style={{ fontSize: 9 }}>Sin comprar 7+ días</div>
            </div>
            {panel.riesgo.map((r, ri) => {
              const col = r.dias >= 30 ? 'var(--red)' : r.dias >= 14 ? 'var(--orange)' : '#fbbf24';
              const txt = r.dias >= 999 ? 'Nunca ha comprado' : `${r.dias} días sin comprar`;
              return (
                <div key={r.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0',
                  borderBottom: ri < panel.riesgo.length - 1 ? '1px solid rgba(255,255,255,.05)' : 'none',
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: col, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.nombre}</div>
                    <div style={{ fontSize: 9, fontWeight: 600, color: col }}>{txt}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {!!semana?.length && (
        <div className="card">
          <strong style={{ fontSize: 13 }}>Mi semana</strong>
          <div style={{ display: 'flex', alignItems: 'end', gap: 6, height: 90, marginTop: 12 }}>
            {semana.map(d => (
              <div key={d.dia} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{
                  height: Math.max(4, (d.total / maxSemana) * 64),
                  background: 'linear-gradient(180deg, var(--accent), #0044ff)', borderRadius: 4,
                }} title={fmtMoneda(d.total)} />
                <div className="muted" style={{ fontSize: 9, marginTop: 4 }}>
                  {new Date(d.dia).toLocaleDateString('es-CO', { weekday: 'short' })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Buscador + lista de facturas con estado ── */}
      <input
        placeholder="🔍 Buscar cliente, factura, pago…"
        value={buscar}
        onChange={e => setBuscar(e.target.value)}
        style={{ fontSize: 12, padding: '9px 12px' }}
      />
      <div style={{ display: 'grid', gap: 8 }}>
        {!facturasFiltradas.length && <p className="muted" style={{ fontSize: 13 }}>Sin facturas en este periodo.</p>}
        {facturasFiltradas.map(f => {
          const e = estadoFactura(f);
          const dir = [f.cliente?.direccion, f.cliente?.barrio, f.cliente?.ciudad].filter(Boolean).join(' · ');
          const esDev = f.tipoDoc === 'DEVOLUCION';
          return (
            <div key={f.id} className="card" onClick={() => setDetalle(f)} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px',
              borderLeft: `3px solid ${e.color}`, cursor: 'pointer',
            }}>
              <span style={{
                width: 30, height: 30, borderRadius: 8, background: `${e.color}22`,
                display: 'grid', placeItems: 'center', fontSize: 14, flexShrink: 0,
              }}>{e.icono}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <strong style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.cliente?.nombre ?? '—'}</strong>
                  <span style={{ fontSize: 9, fontWeight: 800, color: e.color, background: `${e.color}1f`, borderRadius: 6, padding: '1px 7px', flexShrink: 0 }}>{e.label}</span>
                </div>
                <div className="muted" style={{ fontSize: 10.5 }}>
                  FAC-{String(f.consecutivo).padStart(4, '0')}{f.metodoPago ? ` · ${LABEL_METODO[f.metodoPago] ?? f.metodoPago}` : ''}
                </div>
                {dir && <div className="muted" style={{ fontSize: 9.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>📍 {dir}</div>}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div className="mono" style={{ fontSize: 14, fontWeight: 700, color: esDev ? 'var(--red)' : 'var(--green)' }}>{fmtMoneda(f.total)}</div>
                <div className="muted" style={{ fontSize: 9 }}>{fmtFechaHora(f.creadoEn)}</div>
              </div>
            </div>
          );
        })}
      </div>

      {detalle && <FacturaDetalle factura={detalle} onCerrar={() => setDetalle(null)} />}
    </div>
  );
}
