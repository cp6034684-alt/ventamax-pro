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

  const completar = useMutation({ mutationFn: (id: string) => tareasApi.completar(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['tareas'] }) });
  const eliminar = useMutation({ mutationFn: (id: string) => tareasApi.eliminar(id), onSuccess: () => qc.invalidateQueries() });
  const revivir = useMutation({ mutationFn: (id: string) => facturasApi.revivir(id), onSuccess: () => { qc.invalidateQueries(); } });
  const [verTarea, setVerTarea] = useState<Tarea | null>(null);
  const [editTarea, setEditTarea] = useState<Tarea | null>(null);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', paddingBottom: 2 }}>
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

      {verTarea && <TareaDetalle tarea={verTarea} onCerrar={() => setVerTarea(null)} onCompletar={(id) => completar.mutate(id)} />}
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
    <div style={{ textAlign: 'center', padding: '6px 2px', minWidth: 0, overflow: 'hidden' }}>
      <div className="mono" style={{ fontSize: 14, fontWeight: 800, color: color ?? 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n}</div>
      <div className="muted" style={{ fontSize: 9 }}>{label}</div>
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

const METODO_LABEL: Record<string, string> = {
  EFECTIVO: 'Efectivo', TRANSFERENCIA: 'Transferencia', CREDITO: 'Paga otro día',
  NEQUI: 'Nequi', DAVIPLATA: 'Daviplata',
};
const metodoLabel = (m?: string | null) => METODO_LABEL[String(m ?? '').toUpperCase()] ?? (m || 'Sin método');

// Suma cantidades por producto a partir de un conjunto de facturas.
function agruparItems(facs: TareaFactura[]) {
  const m = new Map<string, number>();
  for (const f of facs) for (const it of (f.items ?? [])) {
    const nom = it.producto?.nombre ?? '—';
    m.set(nom, (m.get(nom) ?? 0) + Number(it.cantidad));
  }
  return [...m.entries()].map(([nombre, und]) => ({ nombre, und })).sort((a, b) => b.und - a.und);
}

function TareaDetalle({ tarea, onCerrar, onCompletar }: { tarea: Tarea; onCerrar: () => void; onCompletar?: (id: string) => void }) {
  const [sub, setSub] = useState<'entregas' | 'bodega' | 'dinero'>('entregas');
  const [verPend, setVerPend] = useState(false);
  const [bod, setBod] = useState<'inicial' | 'sobrantes'>('inicial');

  const s = statTarea(tarea);
  const total = tarea.facturas.reduce((a, f) => a + Number(f.total), 0);
  const entregadas = tarea.facturas.filter(f => entregada(f.estado));
  const noEntregadas = tarea.facturas.filter(f => !entregada(f.estado) && f.estado !== 'DEVUELTA');
  const recaudado = entregadas.reduce((a, f) => a + Number(f.total), 0);
  const pendiente = total - recaudado;
  const avance = total > 0 ? recaudado / total : 0;

  // Por método de pago (entre las entregadas)
  const porMetodo = new Map<string, number>();
  for (const f of entregadas) porMetodo.set(metodoLabel(f.metodoPago), (porMetodo.get(metodoLabel(f.metodoPago)) ?? 0) + Number(f.total));

  const itemsInicial = agruparItems(tarea.facturas);
  const itemsSobrantes = agruparItems([...noEntregadas, ...tarea.facturas.filter(f => f.devuelta === 'PARCIAL' || f.devuelta === 'TOTAL' || f.estado === 'DEVUELTA')]);

  const visibles = verPend ? noEntregadas : tarea.facturas;

  const stops = tarea.facturas.map(f => [f.cliente?.direccion, f.cliente?.barrio, f.cliente?.ciudad].filter(Boolean).join(' ')).filter(Boolean);
  const mapaUrl = stops.length
    ? `https://www.google.com/maps/dir/${stops.map(encodeURIComponent).join('/')}`
    : '';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 130, display: 'grid', placeItems: 'center', padding: 16 }} onClick={onCerrar}>
      <div className="card" style={{ width: '100%', maxWidth: 470, display: 'grid', gap: 10, maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <strong style={{ fontSize: 16 }}>{tarea.nombre}</strong>
            <div className="muted" style={{ fontSize: 11 }}>🚚 {tarea.entregador?.nombre ?? '—'} · {new Date(tarea.fecha).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
          </div>
          <button className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: 14 }} onClick={onCerrar}>✕</button>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          <Mini n={s.total} label="PEDIDOS" />
          <Mini n={s.pend} label="PENDIENTES" color={s.pend ? 'var(--orange)' : 'var(--green)'} />
          <Mini n={fmtMoneda(total)} label="TOTAL" color="var(--accent)" />
        </div>

        {/* Sub-pestañas */}
        <div style={{ display: 'flex', gap: 6 }}>
          {([['entregas', '📦 Entregas'], ['bodega', '🏭 Bodega'], ['dinero', '💵 Dinero']] as const).map(([id, lab]) => (
            <button key={id} className={`btn ${sub === id ? '' : 'btn-ghost'}`} style={{ flex: 1, fontSize: 11, padding: '6px 4px' }} onClick={() => setSub(id)}>{lab}</button>
          ))}
        </div>

        {sub === 'entregas' && (
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className={`btn ${!verPend ? '' : 'btn-ghost'}`} style={{ flex: 1, fontSize: 11, padding: '5px' }} onClick={() => setVerPend(false)}>Todos ({tarea.facturas.length})</button>
              <button className={`btn ${verPend ? '' : 'btn-ghost'}`} style={{ flex: 1, fontSize: 11, padding: '5px' }} onClick={() => setVerPend(true)}>Pendientes ({noEntregadas.length})</button>
            </div>
            {!visibles.length && <p className="muted" style={{ fontSize: 12 }}>Sin pedidos en esta vista.</p>}
            {visibles.map(f => {
              const b = badgeEstado(f);
              const dir = [f.cliente?.direccion, f.cliente?.barrio, f.cliente?.ciudad].filter(Boolean).join(' · ');
              return (
                <div key={f.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <strong style={{ fontSize: 13, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.cliente?.nombre ?? '—'}</strong>
                    <span className="muted mono" style={{ fontSize: 10 }}>FAC-{String(f.consecutivo).padStart(4, '0')}</span>
                  </div>
                  {(f.cliente?.nit || dir) && (
                    <div className="muted" style={{ fontSize: 10 }}>{f.cliente?.nit ? `${f.cliente.nit} · ` : ''}{dir}</div>
                  )}
                  {!!(f.items?.length) && (
                    <div className="muted" style={{ fontSize: 10, marginTop: 2 }}>
                      {f.items!.map((it, k) => <span key={k}>{k ? ' · ' : ''}{it.cantidad}× {it.producto?.nombre ?? '—'}</span>)}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <span className="mono green" style={{ fontSize: 13, flex: 1 }}>{fmtMoneda(f.total)}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: b.color }}>{b.txt}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {sub === 'bodega' && (
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className={`btn ${bod === 'inicial' ? '' : 'btn-ghost'}`} style={{ flex: 1, fontSize: 11, padding: '5px' }} onClick={() => setBod('inicial')}>Inicial</button>
              <button className={`btn ${bod === 'sobrantes' ? '' : 'btn-ghost'}`} style={{ flex: 1, fontSize: 11, padding: '5px' }} onClick={() => setBod('sobrantes')}>Sobrantes ({itemsSobrantes.reduce((a, x) => a + x.und, 0)})</button>
            </div>
            <p className="muted" style={{ fontSize: 11 }}>
              {bod === 'inicial' ? 'Inventario total a cargar para completar la tarea:' : 'Productos que aún no han sido entregados o quedaron por devoluciones:'}
            </p>
            {(bod === 'inicial' ? itemsInicial : itemsSobrantes).map(it => (
              <div key={it.nombre} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 12 }}>{it.nombre}</span>
                <span className="mono accent" style={{ fontSize: 12, fontWeight: 700 }}>{it.und} und</span>
              </div>
            ))}
            {!(bod === 'inicial' ? itemsInicial : itemsSobrantes).length && <p className="muted" style={{ fontSize: 12 }}>{bod === 'inicial' ? 'Sin productos.' : 'Nada pendiente. Todo entregado.'}</p>}
          </div>
        )}

        {sub === 'dinero' && (
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <Mini n={fmtMoneda(total)} label="TOTAL A COBRAR" color="var(--accent)" />
              <Mini n={fmtMoneda(recaudado)} label="YA RECAUDADO" color="var(--green)" />
              <Mini n={fmtMoneda(pendiente)} label="PENDIENTE POR COBRAR" color="var(--orange)" />
              <Mini n={pct(avance)} label="AVANCE" color="var(--accent)" />
            </div>
            {barra(avance)}
            <div className="muted" style={{ fontSize: 11, fontWeight: 700, marginTop: 4 }}>POR MÉTODO DE PAGO</div>
            {![...porMetodo].length && <p className="muted" style={{ fontSize: 12 }}>Aún no hay cobros registrados.</p>}
            {[...porMetodo.entries()].map(([m, v]) => (
              <div key={m} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                <span>{m}</span><span className="mono green">{fmtMoneda(v)}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onCerrar}>Cerrar</button>
          {mapaUrl && <a className="btn btn-ghost" style={{ flex: 1, textAlign: 'center', textDecoration: 'none' }} href={mapaUrl} target="_blank" rel="noreferrer">🗺 Ver mapa</a>}
          {onCompletar && tarea.estado !== 'completada' && (
            <button className="btn" style={{ flex: 1, background: 'var(--green)' }}
              onClick={() => confirm(`¿Marcar "${tarea.nombre}" como completada?`) && (onCompletar(tarea.id), onCerrar())}>✓ Completar</button>
          )}
        </div>
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
        <div className="muted" style={{ fontSize: 11, fontWeight: 700, marginBottom: 6 }}>POR ENTREGADOR</div>
        {!filas.length && <p className="muted" style={{ fontSize: 12 }}>Sin tareas.</p>}
        {filas.map(r => (
          <div key={r.nom} className="card" style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(0,200,255,.18)', color: 'var(--accent)', fontWeight: 800, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{inicialDe(r.nom)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ fontSize: 14 }}>{r.nom}</strong>
                <div className="muted" style={{ fontSize: 11 }}>{r.tot} pedidos · {fmtMoneda(r.cobrado)} cobrado</div>
              </div>
              <span className="accent mono" style={{ fontSize: 16, fontWeight: 800 }}>{pct(r.frac)}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 8 }}>
              <StatCol n={r.o} label="✅ OK" color="var(--green)" />
              <StatCol n={r.p} label="⏳ Pend." color="var(--orange)" />
              <StatCol n={r.d} label="↩️ Dev." color="var(--red)" />
            </div>
            {barra(r.frac)}
          </div>
        ))}
      </div>
    </div>
  );
}

function cuadreDe(facs: TareaFactura[]) {
  let efectivo = 0, transferencia = 0, cartera = 0, devoluciones = 0, entregados = 0, pend = 0, dev = 0;
  for (const f of facs) {
    devoluciones += Number(f.montoDevuelto ?? 0);
    if (f.estado === 'DEVUELTA' || f.devuelta === 'TOTAL') { dev++; continue; }
    if (entregada(f.estado)) {
      entregados++;
      const pagado = Number(f.pagado); const total = Number(f.total);
      if (f.metodoPago === 'TRANSFERENCIA') transferencia += pagado;
      else if (f.metodoPago === 'CREDITO') cartera += Math.max(0, total - pagado);
      else efectivo += pagado;
      if (f.metodoPago !== 'CREDITO' && total - pagado > 0) cartera += (total - pagado);
    } else { pend++; }
  }
  return { efectivo, transferencia, cartera, devoluciones, entregados, pend, dev, total: efectivo + transferencia + cartera };
}

function CuadreCaja({ tareas }: { tareas: Tarea[] }) {
  const g = cuadreDe(tareas.flatMap(t => t.facturas));
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="card" style={{ background: 'rgba(0,200,130,.06)', borderColor: 'rgba(0,200,130,.25)' }}>
        <div className="muted" style={{ fontSize: 11, fontWeight: 700, marginBottom: 8 }}>📥 CUADRE GLOBAL DE CAJA</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Mini n={fmtMoneda(g.efectivo)} label="💵 Efectivo" color="var(--green)" />
          <Mini n={fmtMoneda(g.transferencia)} label="🏦 Transferencia" color="var(--accent)" />
          <Mini n={fmtMoneda(g.cartera)} label="⚠️ Cartera" color="var(--orange)" />
          <Mini n={fmtMoneda(g.devoluciones)} label="↩️ Devoluciones" color="var(--red)" />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
          <span className="muted" style={{ fontSize: 12 }}>Total cobrado</span>
          <strong className="mono green" style={{ fontSize: 18 }}>{fmtMoneda(g.total)}</strong>
        </div>
      </div>

      <div className="muted" style={{ fontSize: 11, fontWeight: 700 }}>CUADRE POR TAREA</div>
      {!tareas.length && <p className="muted" style={{ fontSize: 12 }}>Sin tareas.</p>}
      {tareas.map(t => {
        const c = cuadreDe(t.facturas);
        const sinCobrar = t.facturas.filter(f => !entregada(f.estado) && f.estado !== 'DEVUELTA').reduce((s, f) => s + Number(f.total), 0);
        return (
          <div key={t.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <div><strong style={{ fontSize: 14 }}>{t.nombre}</strong><div className="muted" style={{ fontSize: 11 }}>🚚 {t.entregador?.nombre ?? '—'}</div></div>
              <strong className="mono green" style={{ fontSize: 15 }}>{fmtMoneda(c.total)}</strong>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 8 }}>
              <div className="muted" style={{ fontSize: 12 }}>💵 Efectivo <span className="mono" style={{ color: 'var(--green)' }}>{fmtMoneda(c.efectivo)}</span></div>
              <div className="muted" style={{ fontSize: 12 }}>🏦 Transf. <span className="mono accent">{fmtMoneda(c.transferencia)}</span></div>
              <div className="muted" style={{ fontSize: 12 }}>⚠️ Cartera <span className="mono" style={{ color: 'var(--orange)' }}>{fmtMoneda(c.cartera)}</span></div>
              <div className="muted" style={{ fontSize: 12 }}>↩️ Dev. <span className="mono" style={{ color: 'var(--red)' }}>{fmtMoneda(c.devoluciones)}</span></div>
            </div>
            <div className="muted" style={{ fontSize: 10, marginTop: 6, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span>✅ {c.entregados} entregados · ⏳ {c.pend} pendientes · ↩️ {c.dev} dev.</span>
              {sinCobrar > 0 && <span style={{ color: 'var(--orange)' }}>{fmtMoneda(sinCobrar)} sin cobrar</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function inicialDe(nombre?: string) { return (nombre?.trim().charAt(0) || '?').toUpperCase(); }
function nombrePorDefecto() {
  const d = new Date();
  const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  return `Entrega ${dias[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}

function Programar() {
  const [modal, setModal] = useState(false);
  const [preEnt, setPreEnt] = useState('');

  const { data: usuarios } = useQuery({ queryKey: ['usuarios'], queryFn: usuariosApi.listar });
  const { data: activas } = useQuery({ queryKey: ['tareas', 'activa'], queryFn: () => tareasApi.listar({ estado: 'activa' }) });
  const { data: pend } = useQuery({ queryKey: ['prog-pendientes'], queryFn: () => facturasApi.listar({ estado: 'PENDIENTE', porPagina: '200' }) });

  const entregadores = (usuarios ?? []).filter(u => u.rol === 'ENTREGADOR' && u.activo !== false);
  const sinAsignar = (pend?.datos ?? []).filter(f => !f.tareaId);
  const statEnt = (id: string) => {
    const ts = (activas ?? []).filter(t => t.entregadorId === id);
    const entregados = ts.reduce((s, t) => s + t.facturas.filter(f => entregada(f.estado)).length, 0);
    return { tareas: ts.length, entregados };
  };
  const abrir = (entId = '') => { setPreEnt(entId); setModal(true); };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="card">
        <strong style={{ fontSize: 13 }}>📋 Acciones rápidas de entrega</strong>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
          <button className="btn btn-ghost" style={{ display: 'grid', gap: 4, padding: 14 }} onClick={() => abrir()}>
            <span style={{ fontSize: 18 }}>📋</span><span style={{ fontSize: 12 }}>Nueva tarea</span>
          </button>
          <button className="btn btn-ghost" style={{ display: 'grid', gap: 4, padding: 14 }} onClick={() => abrir()}>
            <span className="mono" style={{ fontSize: 22, fontWeight: 800, color: 'var(--orange)' }}>{sinAsignar.length}</span>
            <span style={{ fontSize: 12 }}>Pedidos sin asignar</span>
          </button>
        </div>
      </div>

      <div>
        <div className="muted" style={{ fontSize: 11, fontWeight: 700, marginBottom: 6 }}>ENTREGADORES DISPONIBLES</div>
        {!entregadores.length && <p className="muted" style={{ fontSize: 12 }}>No hay entregadores. Créalos en MÁS → Usuarios.</p>}
        {entregadores.map(u => {
          const s = statEnt(u.id);
          return (
            <div key={u.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,200,255,.18)', color: 'var(--accent)', fontWeight: 800, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{inicialDe(u.nombre)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ fontSize: 14 }}>{u.nombre}</strong>
                <div className="muted" style={{ fontSize: 11 }}>{s.tareas} tareas activas · {s.entregados} entregados</div>
              </div>
              <button className="btn" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => abrir(u.id)}>＋ Tarea</button>
            </div>
          );
        })}
      </div>

      {modal && <ModalProgramar entregadores={entregadores} pendientes={sinAsignar} preEnt={preEnt} onCerrar={() => setModal(false)} />}
    </div>
  );
}

function ModalProgramar({ entregadores, pendientes, preEnt, onCerrar }: {
  entregadores: Usuario[]; pendientes: Factura[]; preEnt: string; onCerrar: () => void;
}) {
  const qc = useQueryClient();
  const [entregadorId, setEntregadorId] = useState(preEnt);
  const [nombre, setNombre] = useState(nombrePorDefecto());
  const [sel, setSel] = useState<Set<string>>(() => new Set(pendientes.map(f => f.id)));

  const programar = useMutation({
    mutationFn: () => tareasApi.programar({ nombre: nombre || 'Entrega', entregadorId, facturaIds: [...sel] }),
    onSuccess: () => { qc.invalidateQueries(); onCerrar(); },
  });

  const toggle = (id: string) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const totalSel = pendientes.filter(f => sel.has(f.id)).reduce((s, f) => s + Number(f.total), 0);

  const grupos = new Map<string, Factura[]>();
  for (const f of pendientes) {
    const z = f.cliente?.zona ? `Zona ${f.cliente.zona}` : 'SIN ZONA';
    if (!grupos.has(z)) grupos.set(z, []);
    grupos.get(z)!.push(f);
  }
  const claves = [...grupos.keys()].sort();

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 130, display: 'grid', placeItems: 'center', padding: 16 }} onClick={onCerrar}>
      <div className="card" style={{ width: '100%', maxWidth: 460, display: 'grid', gap: 10, maxHeight: '88vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
        <strong style={{ fontSize: 15 }}>📋 Programar Entrega</strong>
        <div style={{ display: 'flex', gap: 8 }}>
          <label style={{ flex: 1, fontSize: 11, color: 'var(--muted)' }}>Entregador
            <select value={entregadorId} onChange={e => setEntregadorId(e.target.value)}>
              <option value="">Elegir…</option>
              {entregadores.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </label>
          <label style={{ flex: 1, fontSize: 11, color: 'var(--muted)' }}>Nombre de la tarea
            <input value={nombre} onChange={e => setNombre(e.target.value)} />
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: 11, fontWeight: 700 }}>PEDIDOS PENDIENTES:</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-ghost" style={{ fontSize: 10, padding: '3px 8px' }} onClick={() => setSel(new Set(pendientes.map(f => f.id)))}>✓ Todos</button>
            <button className="btn btn-ghost" style={{ fontSize: 10, padding: '3px 8px' }} onClick={() => setSel(new Set())}>✕ Ninguno</button>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 8, maxHeight: '42vh', overflow: 'auto' }}>
          {!pendientes.length && <p className="muted" style={{ fontSize: 12 }}>No hay pedidos sin asignar.</p>}
          {claves.map(z => (
            <div key={z}>
              <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', padding: '4px 6px', background: 'rgba(0,200,255,.06)', borderRadius: 6, marginBottom: 4 }}>
                {z} · {grupos.get(z)!.length} pedidos
              </div>
              {grupos.get(z)!.map(f => {
                const dir = [f.cliente?.direccion, f.cliente?.barrio, f.cliente?.ciudad].filter(Boolean).join(' · ');
                return (
                  <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px', borderRadius: 8, cursor: 'pointer', background: sel.has(f.id) ? 'rgba(0,200,255,.08)' : 'transparent' }}>
                    <input type="checkbox" checked={sel.has(f.id)} onChange={() => toggle(f.id)} style={{ width: 16, height: 16, accentColor: 'var(--accent)', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.cliente?.nombre ?? '—'}</div>
                      <div className="muted" style={{ fontSize: 10 }}>FAC-{String(f.consecutivo).padStart(4, '0')} · {new Date(f.creadoEn).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}</div>
                      {dir && <div className="muted" style={{ fontSize: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{dir}</div>}
                    </div>
                    <span className="mono accent" style={{ flexShrink: 0 }}>{fmtMoneda(f.total)}</span>
                  </label>
                );
              })}
            </div>
          ))}
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>{sel.size} pedidos seleccionados · Total: {fmtMoneda(totalSel)}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onCerrar}>Cancelar</button>
          <button className="btn" style={{ flex: 1, background: 'var(--green)' }} disabled={programar.isPending || !entregadorId || !sel.size} onClick={() => programar.mutate()}>
            {programar.isPending ? 'Creando…' : '✓ Crear tarea'}
          </button>
        </div>
        {programar.isError && <div className="error-box">{(programar.error as Error).message}</div>}
      </div>
    </div>
  );
}
