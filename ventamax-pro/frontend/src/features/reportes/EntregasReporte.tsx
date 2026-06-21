import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tareasApi, facturasApi, usuariosApi, reportesApi } from '../../api/servicios';
import { fmtMoneda } from '../../api/formato';
import type { Tarea, TareaFactura, Usuario, Factura } from '../../api/tipos';

const SUBTABS = [
  { id: 'activas', label: '🟢 Activas' },
  { id: 'solicitudes', label: '🔄 Solicitudes' },
  { id: 'programar', label: '📋 Programar' },
  { id: 'avance', label: '📊 Avance' },
  { id: 'rentab', label: '💹 Rentabilidad' },
  { id: 'caja', label: '💵 Cuadre Caja' },
  { id: 'historial', label: '📂 Historial' },
];

const entregada = (e: string) => e === 'ENTREGADA' || e === 'PAGADA';
const pct = (n: number) => `${Math.round(n * 100)}%`;

function progreso(t: Tarea) {
  const total = t.facturas.length;
  const hechas = t.facturas.filter(f => entregada(f.estado) || f.estado === 'DEVUELTA').length;
  return { total, hechas, frac: total ? hechas / total : 0 };
}

export function EntregasReporte() {
  const qc = useQueryClient();
  const [sub, setSub] = useState('activas');

  const { data: activas } = useQuery({ queryKey: ['tareas', 'activa'], queryFn: () => tareasApi.listar({ estado: 'activa' }), enabled: ['activas', 'avance', 'caja'].includes(sub) });
  const { data: completadas } = useQuery({ queryKey: ['tareas', 'completada'], queryFn: () => tareasApi.listar({ estado: 'completada' }), enabled: ['historial', 'caja', 'avance'].includes(sub) });
  const { data: solicitudes } = useQuery({ queryKey: ['solic-revivir'], queryFn: facturasApi.solicitudesRevivir, enabled: sub === 'solicitudes' });
  const { data: renta } = useQuery({ queryKey: ['ent-renta'], queryFn: () => reportesApi.rentabilidad('mes'), enabled: sub === 'rentab' });

  const completar = useMutation({ mutationFn: (id: string) => tareasApi.completar(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['tareas'] }) });
  const eliminar = useMutation({ mutationFn: (id: string) => tareasApi.eliminar(id), onSuccess: () => qc.invalidateQueries() });
  const revivir = useMutation({ mutationFn: (id: string) => facturasApi.revivir(id), onSuccess: () => { qc.invalidateQueries(); } });
  const [verTarea, setVerTarea] = useState<Tarea | null>(null);
  const [editTarea, setEditTarea] = useState<Tarea | null>(null);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 5, overflowX: 'auto', paddingBottom: 2 }}>
        {SUBTABS.map(t => (
          <button key={t.id} className={`btn ${sub === t.id ? '' : 'btn-ghost'}`}
            style={{ padding: '6px 10px', fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0 }}
            onClick={() => setSub(t.id)}>
            {t.label}{t.id === 'solicitudes' && solicitudes?.length ? ` (${solicitudes.length})` : ''}
          </button>
        ))}
      </div>

      {sub === 'activas' && (
        <TareasLista tareas={activas ?? []} tipo="activas"
          onCompletar={(id) => completar.mutate(id)} onEliminar={(id) => eliminar.mutate(id)}
          onVer={setVerTarea} onEditar={setEditTarea} />
      )}
      {sub === 'historial' && (
        <TareasLista tareas={completadas ?? []} tipo="historial"
          onEliminar={(id) => eliminar.mutate(id)} onVer={setVerTarea} />
      )}

      {verTarea && <TareaDetalle tarea={verTarea} onCerrar={() => setVerTarea(null)} />}
      {editTarea && <TareaEditar tarea={editTarea} onCerrar={() => setEditTarea(null)} />}

      {sub === 'solicitudes' && (
        <div className="card" style={{ display: 'grid', gap: 8 }}>
          {!solicitudes?.length && <p className="muted" style={{ fontSize: 13 }}>No hay solicitudes de revivir.</p>}
          {solicitudes?.map(f => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ fontSize: 13 }}>FAC-{String(f.consecutivo).padStart(4, '0')} · {f.cliente?.nombre ?? '—'}</strong>
                <div className="muted" style={{ fontSize: 11 }}>{f.vendedor?.nombre} · {fmtMoneda(f.total)}{f.causal ? ` · ${f.causal}` : ''}</div>
              </div>
              <button className="btn" style={{ fontSize: 12, padding: '6px 10px' }} disabled={revivir.isPending}
                onClick={() => confirm(`¿Revivir FAC-${String(f.consecutivo).padStart(4, '0')}? Vuelve a la cola.`) && revivir.mutate(f.id)}>
                ✅ Aprobar
              </button>
            </div>
          ))}
        </div>
      )}

      {sub === 'programar' && <Programar />}

      {sub === 'avance' && <Avance tareas={[...(activas ?? []), ...(completadas ?? [])]} />}

      {sub === 'rentab' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          <div className="card"><div className="muted" style={{ fontSize: 11, fontWeight: 700 }}>VENTA (mes)</div><div className="mono green" style={{ fontSize: 20, fontWeight: 700 }}>{fmtMoneda(renta?.totales.venta ?? 0)}</div></div>
          <div className="card"><div className="muted" style={{ fontSize: 11, fontWeight: 700 }}>COSTO</div><div className="mono" style={{ fontSize: 20, fontWeight: 700, color: 'var(--red)' }}>{fmtMoneda(renta?.totales.costo ?? 0)}</div></div>
          <div className="card"><div className="muted" style={{ fontSize: 11, fontWeight: 700 }}>GANANCIA</div><div className="mono accent" style={{ fontSize: 20, fontWeight: 700 }}>{fmtMoneda(renta?.totales.ganancia ?? 0)}</div><div className="muted" style={{ fontSize: 11 }}>margen {pct(renta?.totales.margen ?? 0)}</div></div>
        </div>
      )}

      {sub === 'caja' && <CuadreCaja tareas={[...(activas ?? []), ...(completadas ?? [])]} />}
    </div>
  );
}

function barra(frac: number) {
  return (
    <div style={{ height: 4, background: 'rgba(255,255,255,.08)', borderRadius: 20, overflow: 'hidden', marginTop: 4 }}>
      <div style={{ height: '100%', width: `${Math.round(frac * 100)}%`, background: 'linear-gradient(90deg, var(--green), #00b386)', borderRadius: 20 }} />
    </div>
  );
}

function statTarea(t: Tarea) {
  const total = t.facturas.length;
  const entregados = t.facturas.filter(f => entregada(f.estado)).length;
  const dev = t.facturas.filter(f => f.estado === 'DEVUELTA' || f.devuelta === 'TOTAL' || f.devuelta === 'PARCIAL').length;
  const pend = total - entregados - dev;
  const valor = t.facturas.reduce((s, f) => s + Number(f.total), 0);
  const frac = total ? (entregados + dev) / total : 0;
  return { total, entregados, dev, pend, valor, frac };
}

function StatCol({ n, label, color }: { n: number | string; label: string; color?: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '6px 2px' }}>
      <div className="mono" style={{ fontSize: 17, fontWeight: 800, color: color ?? 'var(--text)' }}>{n}</div>
      <div className="muted" style={{ fontSize: 10 }}>{label}</div>
    </div>
  );
}

function TareasLista({ tareas, tipo, onCompletar, onEliminar, onVer, onEditar }: {
  tareas: Tarea[]; tipo: 'activas' | 'historial';
  onCompletar?: (id: string) => void; onEliminar?: (id: string) => void;
  onVer?: (t: Tarea) => void; onEditar?: (t: Tarea) => void;
}) {
  const titulo = tipo === 'activas' ? 'TAREAS ACTIVAS' : 'TAREAS EN HISTORIAL';
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div className="muted" style={{ fontSize: 11, fontWeight: 700 }}>{tareas.length} {titulo}</div>
      {!tareas.length && <p className="muted" style={{ fontSize: 13 }}>Sin tareas.</p>}
      {tareas.map(t => {
        const s = statTarea(t);
        return (
          <div key={t.id} className="card">
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ fontSize: 15 }}>{t.nombre}</strong>
                <div className="muted" style={{ fontSize: 11 }}>🚚 {t.entregador?.nombre ?? '—'}</div>
              </div>
              <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 20, background: tipo === 'activas' ? 'rgba(0,200,255,.15)' : 'rgba(0,200,130,.15)', color: tipo === 'activas' ? 'var(--accent)' : 'var(--green)' }}>
                {tipo === 'activas' ? 'ACTIVA' : 'COMPLETADA'}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 8 }}>
              <StatCol n={s.total} label="Pedidos" />
              <StatCol n={s.entregados} label={tipo === 'activas' ? '✅ Entregados' : '✅ OK'} color="var(--green)" />
              {tipo === 'activas'
                ? <StatCol n={s.pend} label="⏳ Pendientes" color="var(--orange)" />
                : <StatCol n={s.dev} label="↩️ Dev." color="var(--red)" />}
              <StatCol n={fmtMoneda(s.valor)} label="💰 Total" color="var(--accent)" />
            </div>
            <div className="muted" style={{ fontSize: 10, marginTop: 6 }}>{Math.round(s.frac * 100)}% completado</div>
            {barra(s.frac)}
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <button className="btn btn-ghost" style={{ flex: 1, fontSize: 12 }} onClick={() => onVer?.(t)}>👁 Ver detalle</button>
              {tipo === 'activas' && onEditar && (
                <button className="btn btn-ghost" style={{ flex: 1, fontSize: 12 }} onClick={() => onEditar(t)}>✏️ Editar</button>
              )}
              {tipo === 'activas' && onCompletar && (
                <button className="btn btn-ghost" style={{ fontSize: 12, color: 'var(--green)' }}
                  onClick={() => confirm(`¿Marcar "${t.nombre}" como completada?`) && onCompletar(t.id)}>✓</button>
              )}
              {onEliminar && (
                <button className="btn btn-ghost" style={{ fontSize: 12, color: 'var(--red)' }}
                  onClick={() => confirm(`¿Eliminar "${t.nombre}"? Los pedidos pendientes vuelven a sin asignar.`) && onEliminar(t.id)}>🗑</button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function badgeEstado(f: TareaFactura) {
  const dev = f.estado === 'DEVUELTA' || f.devuelta === 'TOTAL' || f.devuelta === 'PARCIAL';
  if (dev) return { txt: f.devuelta === 'PARCIAL' ? 'Dev. parcial' : 'Devuelto', color: 'var(--red)' };
  if (entregada(f.estado)) return { txt: 'Entregado', color: 'var(--green)' };
  return { txt: 'Pendiente', color: '#38bdf8' };
}

function TareaDetalle({ tarea, onCerrar }: { tarea: Tarea; onCerrar: () => void }) {
  const s = statTarea(tarea);
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 130, display: 'grid', placeItems: 'center', padding: 16 }} onClick={onCerrar}>
      <div className="card" style={{ width: '100%', maxWidth: 460, display: 'grid', gap: 10, maxHeight: '88vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
        <div>
          <strong style={{ fontSize: 16 }}>{tarea.nombre}</strong>
          <div className="muted" style={{ fontSize: 11 }}>🚚 {tarea.entregador?.nombre ?? '—'} · {s.entregados}/{s.total} entregas · {fmtMoneda(s.valor)}</div>
        </div>
        <div style={{ display: 'grid', gap: 4 }}>
          {tarea.facturas.map(f => {
            const b = badgeEstado(f);
            return (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.cliente?.nombre ?? '—'}</div>
                  <div className="muted" style={{ fontSize: 10 }}>FAC-{String(f.consecutivo).padStart(4, '0')}{f.cliente?.barrio ? ` · ${f.cliente.barrio}` : ''}</div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: b.color, flexShrink: 0 }}>{b.txt}</span>
                <span className="mono" style={{ fontSize: 13, flexShrink: 0, minWidth: 70, textAlign: 'right' }}>{fmtMoneda(f.total)}</span>
              </div>
            );
          })}
        </div>
        <button className="btn btn-ghost" onClick={onCerrar}>Cerrar</button>
      </div>
    </div>
  );
}

function TareaEditar({ tarea, onCerrar }: { tarea: Tarea; onCerrar: () => void }) {
  const qc = useQueryClient();
  const { data: usuarios } = useQuery({ queryKey: ['usuarios'], queryFn: usuariosApi.listar });
  const { data: pend } = useQuery({ queryKey: ['prog-pendientes'], queryFn: () => facturasApi.listar({ estado: 'PENDIENTE', porPagina: '200' }) });
  const entregadores = (usuarios ?? []).filter(u => u.rol === 'ENTREGADOR' && u.activo !== false);

  const [nombre, setNombre] = useState(tarea.nombre);
  const [entregadorId, setEntregadorId] = useState(tarea.entregadorId);

  const propios = tarea.facturas.filter(f => !entregada(f.estado) && f.estado !== 'DEVUELTA')
    .map(f => ({ id: f.id, consecutivo: f.consecutivo, total: f.total, nombre: f.cliente?.nombre ?? '—' }));
  const libres = (pend?.datos ?? []).filter(f => !f.tareaId)
    .map(f => ({ id: f.id, consecutivo: f.consecutivo, total: f.total, nombre: f.cliente?.nombre ?? '—' }));
  const lista = [...propios, ...libres];

  const [sel, setSel] = useState<Set<string>>(() => new Set(propios.map(f => f.id)));
  const toggle = (id: string) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const totalSel = lista.filter(f => sel.has(f.id)).reduce((s, f) => s + Number(f.total), 0);

  const guardar = useMutation({
    mutationFn: () => tareasApi.editar(tarea.id, { nombre, entregadorId, facturaIds: [...sel] }),
    onSuccess: () => { qc.invalidateQueries(); onCerrar(); },
  });

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 130, display: 'grid', placeItems: 'center', padding: 16 }} onClick={onCerrar}>
      <div className="card" style={{ width: '100%', maxWidth: 460, display: 'grid', gap: 10, maxHeight: '88vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
        <strong style={{ fontSize: 15 }}>✏️ Editar entrega</strong>
        <div style={{ display: 'flex', gap: 8 }}>
          <label style={{ flex: 1, fontSize: 11, color: 'var(--muted)' }}>Entregador
            <select value={entregadorId} onChange={e => setEntregadorId(e.target.value)}>
              {entregadores.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </label>
          <label style={{ flex: 1, fontSize: 11, color: 'var(--muted)' }}>Nombre
            <input value={nombre} onChange={e => setNombre(e.target.value)} />
          </label>
        </div>
        <div className="muted" style={{ fontSize: 11, fontWeight: 700 }}>PEDIDOS (pendientes editables):</div>
        <div style={{ display: 'grid', gap: 4, maxHeight: '42vh', overflow: 'auto' }}>
          {!lista.length && <p className="muted" style={{ fontSize: 12 }}>No hay pedidos pendientes para editar. Los ya entregados no se modifican.</p>}
          {lista.map(f => (
            <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px', borderRadius: 8, cursor: 'pointer', background: sel.has(f.id) ? 'rgba(0,200,255,.08)' : 'transparent' }}>
              <input type="checkbox" checked={sel.has(f.id)} onChange={() => toggle(f.id)} style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.nombre}</div>
                <div className="muted" style={{ fontSize: 10 }}>FAC-{String(f.consecutivo).padStart(4, '0')}</div>
              </div>
              <span className="mono accent" style={{ flexShrink: 0 }}>{fmtMoneda(f.total)}</span>
            </label>
          ))}
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>{sel.size} pedidos · {fmtMoneda(totalSel)}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onCerrar}>Cancelar</button>
          <button className="btn" style={{ flex: 1, background: 'var(--green)' }} disabled={guardar.isPending || !entregadorId} onClick={() => guardar.mutate()}>
            {guardar.isPending ? 'Guardando…' : '✓ Guardar'}
          </button>
        </div>
        {guardar.isError && <div className="error-box">{(guardar.error as Error).message}</div>}
      </div>
    </div>
  );
}

function Mini({ n, label, color }: { n: number | string; label: string; color?: string }) {
  return (
    <div style={{ padding: 8, background: 'var(--bg3)', borderRadius: 8 }}>
      <div className="mono" style={{ fontSize: 19, fontWeight: 800, color: color ?? 'var(--text)' }}>{n}</div>
      <div className="muted" style={{ fontSize: 10 }}>{label}</div>
    </div>
  );
}

function Avance({ tareas }: { tareas: Tarea[] }) {
  const facs = tareas.flatMap(t => t.facturas);
  const total = facs.length;
  const ok = facs.filter(f => entregada(f.estado)).length;
  const dev = facs.filter(f => f.estado === 'DEVUELTA' || f.devuelta === 'TOTAL' || f.devuelta === 'PARCIAL').length;
  const pend = facs.filter(f => f.estado === 'PENDIENTE').length;
  const frac = total ? ok / total : 0;

  const porEnt = new Map<string, TareaFactura[]>();
  for (const t of tareas) {
    const nom = t.entregador?.nombre ?? '—';
    const arr = porEnt.get(nom) ?? [];
    arr.push(...t.facturas);
    porEnt.set(nom, arr);
  }
  const filas = [...porEnt.entries()].map(([nom, fs]) => {
    const tot = fs.length;
    const o = fs.filter(f => entregada(f.estado)).length;
    const d = fs.filter(f => f.estado === 'DEVUELTA' || f.devuelta === 'TOTAL' || f.devuelta === 'PARCIAL').length;
    const p = fs.filter(f => f.estado === 'PENDIENTE').length;
    const cobrado = fs.filter(f => entregada(f.estado)).reduce((s, f) => s + Number(f.total), 0);
    return { nom, tot, o, d, p, cobrado, frac: tot ? o / tot : 0 };
  }).sort((a, b) => b.cobrado - a.cobrado);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="card">
        <div className="muted" style={{ fontSize: 11, fontWeight: 700, marginBottom: 8 }}>📊 AVANCE GLOBAL (TODAS LAS TAREAS)</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Mini n={total} label="Total pedidos" />
          <Mini n={ok} label="✅ Entregados" color="var(--green)" />
          <Mini n={pend} label="⏳ Pendientes" color="var(--orange)" />
          <Mini n={dev} label="↩️ Devoluciones" color="var(--red)" />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 10 }}>
          <span className="muted">Avance total</span><span className="accent mono" style={{ fontWeight: 700 }}>{pct(frac)}</span>
        </div>
        {barra(frac)}
      </div>

      <div>
        <div className="muted" style={{ fontSize: 11, fontWeight: 700, marginBottom: 