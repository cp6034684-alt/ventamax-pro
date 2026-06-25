import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportesApi, usuariosApi, tareasApi } from '../../api/servicios';
import { fmtMoneda } from '../../api/formato';
import type { Actividad, Tarea } from '../../api/tipos';

const SUBTABS = [
  { id: 'log', label: '📍 Log de actividad' },
  { id: 'entregas', label: '📦 Historial de entregas' },
];

// ── Eventos del log ──
const EVENTO: Record<string, { icono: string; texto: string; color: string }> = {
  LOGIN:       { icono: '🔓', texto: 'Inició sesión', color: 'var(--green)' },
  LOGOUT:      { icono: '🔒', texto: 'Cerró sesión', color: 'var(--red)' },
  VENTA:       { icono: '🧾', texto: 'Venta', color: 'var(--accent)' },
  IMPORTACION:   { icono: '📥', texto: 'Importación', color: 'var(--orange)' },
  CLIENTE_NUEVO: { icono: '🆕', texto: 'Cliente nuevo', color: 'var(--green)' },
  CLIENTE_EDIT:  { icono: '✏️', texto: 'Editó cliente', color: 'var(--accent)' },
  ANULACION:     { icono: '🚫', texto: 'Anuló factura', color: 'var(--red)' },
  DEVOLUCION:    { icono: '↩️', texto: 'Devolución', color: 'var(--orange)' },
};
const ACCIONES = [
  { id: '', label: 'Todas las acciones' },
  { id: 'LOGIN', label: 'Login' },
  { id: 'LOGOUT', label: 'Logout' },
  { id: 'VENTA', label: 'Venta' },
  { id: 'IMPORTACION', label: 'Importación' },
  { id: 'CLIENTE_NUEVO', label: 'Cliente nuevo' },
  { id: 'CLIENTE_EDIT', label: 'Cliente editado' },
  { id: 'ANULACION', label: 'Anulación' },
  { id: 'DEVOLUCION', label: 'Devolución' },
];

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
const diaLargo = (iso: string) =>
  new Date(iso).toLocaleDateString('es-CO', { weekday: 'long', day: '2-digit', month: 'short' }).toUpperCase();

function agruparPorDia(eventos: Actividad[]) {
  const grupos: { dia: string; items: Actividad[] }[] = [];
  for (const e of eventos) {
    const d = diaLargo(e.creadoEn);
    const g = grupos[grupos.length - 1];
    if (g && g.dia === d) g.items.push(e);
    else grupos.push({ dia: d, items: [e] });
  }
  return grupos;
}

function LogActividad() {
  const [usuarioId, setUsuarioId] = useState('');
  const [tipo, setTipo] = useState('');
  const { data: usuarios } = useQuery({ queryKey: ['usuarios'], queryFn: usuariosApi.listar });
  const { data: eventos, isFetching } = useQuery({
    queryKey: ['actividad', usuarioId, tipo],
    queryFn: () => reportesApi.actividad({ usuarioId: usuarioId || undefined, tipo: tipo || undefined, limit: 1000 }),
  });
  const grupos = agruparPorDia(eventos ?? []);

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={usuarioId} onChange={e => setUsuarioId(e.target.value)} style={{ flex: 1, minWidth: 150 }}>
          <option value="">👤 Todos los asesores</option>
          {usuarios?.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
        </select>
        <select value={tipo} onChange={e => setTipo(e.target.value)} style={{ flex: 1, minWidth: 150 }}>
          {ACCIONES.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
        <span className="muted" style={{ fontSize: 11 }}>{isFetching ? 'cargando…' : `${eventos?.length ?? 0} registros`}</span>
      </div>

      {!eventos?.length && !isFetching && (
        <div className="card muted" style={{ fontSize: 12, textAlign: 'center', padding: 16 }}>Sin actividad registrada todavía.</div>
      )}

      {grupos.map(g => (
        <div key={g.dia} style={{ display: 'grid', gap: 6 }}>
          <div className="muted" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.5px', marginTop: 4 }}>{g.dia}</div>
          {g.items.map(e => {
            const ev = EVENTO[e.tipo] ?? { icono: '•', texto: e.tipo, color: 'var(--muted)' };
            return (
              <div key={e.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px' }}>
                <span style={{ fontSize: 16 }}>{ev.icono}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13 }}>
                    <b style={{ color: ev.color }}>{ev.texto}</b>
                    {e.detalle && <span className="muted" style={{ fontSize: 12 }}> · {e.detalle}</span>}
                  </div>
                  <div className="muted" style={{ fontSize: 11 }}>{e.nombre}{e.alcance ? ` · ${e.alcance}` : ''}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div className="mono muted" style={{ fontSize: 11 }}>{hhmm(e.creadoEn)}</div>
                  <div className="mono" style={{ fontSize: 9, opacity: .55 }}>#{e.consecutivo}</div>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Historial de entregas (reusa las tareas completadas) ──
const entregada = (e: string) => e === 'ENTREGADA' || e === 'PAGADA';

function resumenTarea(t: Tarea) {
  const total = t.facturas.length;
  const entregados = t.facturas.filter(f => entregada(f.estado)).length;
  const devueltas = t.facturas.filter(f => f.estado === 'DEVUELTA').length;
  const cobrado = t.facturas.filter(f => entregada(f.estado)).reduce((s, f) => s + Number(f.pagado ?? f.total), 0);
  return { total, entregados, devueltas, cobrado, frac: total ? entregados / total : 0 };
}

function informeWhatsApp(t: Tarea) {
  const r = resumenTarea(t);
  const fecha = new Date(t.fecha).toISOString().slice(0, 10);
  const L = '━━━━━━━━━━━━━━━━━━━━';
  const lineas = t.facturas.map(f => `🏪 ${f.cliente?.nombre ?? 'Cliente'} — ${fmtMoneda(f.total)}`).join('\n');
  return [
    '📦 *INFORME DE ENTREGA*', L,
    `📅 *Fecha:* ${fecha}`,
    `🧑 *Asesor:* ${t.entregador?.nombre ?? '—'}`,
    `📋 *Tarea:* ${t.nombre}`, L,
    '📊 *RESUMEN*',
    `✅ Tasa: ${Math.round(r.frac * 100)}%  |  ${r.entregados}/${r.total} entregados`,
    `💵 Cobrado: ${fmtMoneda(r.cobrado)}`, L,
    '🧾 *PEDIDOS*', lineas, L,
    `🚚 ${t.entregador?.nombre ?? '—'} realizó ${r.entregados}/${r.total} entregas.`,
  ].join('\n');
}

function HistorialEntregas() {
  const { data: tareas } = useQuery({ queryKey: ['tareas', 'completada'], queryFn: () => tareasApi.listar({ estado: 'completada' }) });
  const lista = tareas ?? [];

  const jornadas = lista.length;
  let pedidos = 0, entregados = 0, cobrado = 0;
  for (const t of lista) { const r = resumenTarea(t); pedidos += r.total; entregados += r.entregados; cobrado += r.cobrado; }
  const tasa = pedidos ? Math.round((entregados / pedidos) * 100) : 0;

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
        <Kpi n={String(jornadas)} label="JORNADAS" />
        <Kpi n={String(pedidos)} label="PEDIDOS TOT." />
        <Kpi n={`${tasa}%`} label="TASA ENTREGA" color="var(--accent)" />
        <Kpi n={fmtMoneda(cobrado)} label="MONTO COBRADO" color="var(--green)" />
      </div>

      {!lista.length && <div className="card muted" style={{ fontSize: 12, textAlign: 'center', padding: 16 }}>Sin entregas completadas.</div>}

      {lista.map(t => {
        const r = resumenTarea(t);
        const tel = (t.entregador as any)?.telefono ?? '';
        const wa = `https://wa.me/${String(tel).replace(/\D/g, '') || ''}?text=${encodeURIComponent(informeWhatsApp(t))}`;
        return (
          <div key={t.id} className="card" style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <strong style={{ fontSize: 13, flex: 1 }}>{t.nombre}</strong>
              <span className="mono" style={{ fontSize: 12, color: r.frac >= 1 ? 'var(--green)' : 'var(--orange)' }}>{Math.round(r.frac * 100)}%</span>
            </div>
            <div className="muted" style={{ fontSize: 11 }}>
              {new Date(t.fecha).toISOString().slice(0, 10)} · 🚚 {t.entregador?.nombre ?? '—'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              <Mini n={`${r.entregados}/${r.total}`} label="PEDIDOS" />
              <Mini n={String(r.devueltas)} label="DEVUELTAS" color={r.devueltas ? 'var(--red)' : undefined} />
              <Mini n={fmtMoneda(r.cobrado)} label="COBRADO" color="var(--green)" />
            </div>
            <a className="btn" href={wa} target="_blank" rel="noreferrer"
              style={{ textAlign: 'center', textDecoration: 'none', background: 'linear-gradient(135deg, #25D366, #128C7E)' }}>
              📲 Compartir por WhatsApp
            </a>
          </div>
        );
      })}
    </div>
  );
}

function Kpi({ n, label, color }: { n: string; label: string; color?: string }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: '12px 10px' }}>
      <div className="mono" style={{ fontSize: 18, fontWeight: 800, color: color ?? 'var(--text)' }}>{n}</div>
      <div className="muted" style={{ fontSize: 10, letterSpacing: '.5px' }}>{label}</div>
    </div>
  );
}
function Mini({ n, label, color }: { n: string; label: string; color?: string }) {
  return (
    <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '6px 8px', textAlign: 'center' }}>
      <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: color ?? 'var(--text)' }}>{n}</div>
      <div className="muted" style={{ fontSize: 9, letterSpacing: '.5px' }}>{label}</div>
    </div>
  );
}

export function ActividadReporte() {
  const [sub, setSub] = useState('log');
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {SUBTABS.map(s => (
          <button key={s.id} className={`btn ${sub === s.id ? '' : 'btn-ghost'}`}
            style={{ fontSize: 12, padding: '7px 12px' }} onClick={() => setSub(s.id)}>{s.label}</button>
        ))}
      </div>
      {sub === 'log' ? <LogActividad /> : <HistorialEntregas />}
    </div>
  );
}
