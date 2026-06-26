import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usuariosApi, regionesApi } from '../../api/servicios';
import { useAuth } from '../../auth/AuthContext';

const COLOR_ROL: Record<string, string> = {
  ADMIN: 'var(--purple)', COADMIN: 'var(--orange)', SUPERVISOR: '#22d3ee',
  VENDEDOR: 'var(--accent)', ENTREGADOR: 'var(--green)',
};

// Canal a partir del sufijo del ticket (CIU-NN-XXX)
const CANAL_LABEL: Record<string, string> = { MIX: 'Mixto', FOC: 'Focalizado', MAY: 'Mayorista', VIA: 'Viajero', SUP: 'Supervisor' };
const CANAL_VAL: Record<string, string> = { MIX: 'MIXTO', FOC: 'FOCALIZADO', MAY: 'MAYORISTA', VIA: 'VIAJERO' };
function sufijoZona(zona?: string | null) { const m = /-([A-Z]{3})$/.exec(String(zona ?? '')); return m ? m[1] : ''; }
function canalDeZona(zona?: string | null) { return CANAL_LABEL[sufijoZona(zona)] ?? ''; }
function canalValDeZona(zona?: string | null) { return CANAL_VAL[sufijoZona(zona)] ?? ''; }

const CIUDADES = ['ARMENIA', 'IBAGUE', 'PEREIRA'];
const CANALES = ['MIXTO', 'FOCALIZADO', 'MAYORISTA', 'VIAJERO'];

export function UsuariosPage() {
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [errEdit, setErrEdit] = useState<string | null>(null);
  const [reempId, setReempId] = useState<string | null>(null);
  const [reempInfo, setReempInfo] = useState<string | null>(null);
  const [reempErr, setReempErr] = useState<string | null>(null);
  const [buscar, setBuscar] = useState('');
  const { usuario } = useAuth();
  const puedeCrearAdmins = usuario?.rol === 'ADMIN' || usuario?.rol === 'COADMIN';
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['usuarios'], queryFn: usuariosApi.listar });
  const { data: regiones } = useQuery({ queryKey: ['regiones'], queryFn: regionesApi.listar });
  const supervisores = (data ?? []).filter(u => u.rol === 'SUPERVISOR' && u.activo !== false);
  const q = buscar.trim().toLowerCase();
  const visibles = (data ?? []).filter(u => !q ||
    u.nombre.toLowerCase().includes(q) ||
    (u.documento ?? '').toLowerCase().includes(q) ||
    (u.usuario ?? '').toLowerCase().includes(q) ||
    (u.zona ?? '').toLowerCase().includes(q));

  // Estado del formulario de creación (controlado donde define el ticket)
  const [rolN, setRolN] = useState('VENDEDOR');
  const [ciudadN, setCiudadN] = useState('');
  const [canalN, setCanalN] = useState('');
  const [supervisorN, setSupervisorN] = useState('');
  const esVendedorN = rolN === 'VENDEDOR';
  const esSupervisorN = rolN === 'SUPERVISOR';
  const esCampoN = esVendedorN || esSupervisorN; // recibe ticket/region automaticos
  const canalPrev = esSupervisorN ? 'SUPERVISOR' : canalN;
  const { data: ticketPrev } = useQuery({
    queryKey: ['siguiente-ticket', ciudadN, canalPrev],
    queryFn: () => usuariosApi.siguienteTicket(ciudadN, canalPrev),
    enabled: esCampoN && !!ciudadN && (esSupervisorN || !!canalN),
  });

  const invalidar = () => { qc.invalidateQueries({ queryKey: ['usuarios'] }); setMostrarForm(false); setCiudadN(''); setCanalN(''); setSupervisorN(''); };
  const crear = useMutation({ mutationFn: usuariosApi.crear, onSuccess: invalidar });
  const actualizar = useMutation({
    mutationFn: ({ id, ...d }: any) => usuariosApi.actualizar(id, d), onSuccess: () => qc.invalidateQueries({ queryKey: ['usuarios'] }),
  });
  const reemplazar = useMutation({
    mutationFn: ({ id, ...d }: any) => usuariosApi.reemplazar(id, d), onSuccess: () => qc.invalidateQueries({ queryKey: ['usuarios'] }),
  });

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', display: 'grid', gap: 12 }}>
      <button className="btn" onClick={() => setMostrarForm(v => !v)}>＋ Nuevo usuario</button>
      <input placeholder="🔎 Buscar por documento, nombre o apellido…" value={buscar} onChange={e => setBuscar(e.target.value)} autoCapitalize="none" />
      {q && <div className="muted" style={{ fontSize: 11, marginTop: -4 }}>{visibles.length} resultado(s)</div>}

      {mostrarForm && (
        <form className="card" style={{ display: 'grid', gap: 10 }}
          onSubmit={e => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            crear.mutate({
              nombre: String(fd.get('nombre')),
              usuario: String(fd.get('usuario')).toLowerCase().trim().replace(/[@\s]/g, ''),
              pin: String(fd.get('pin')),
              rol: rolN,
              documento: String(fd.get('documento') || '') || undefined,
              telefono: String(fd.get('telefono') || '') || undefined,
              meta: fd.get('meta') ? Number(String(fd.get('meta')).replace(/[^\d]/g, '')) : undefined,
              // Vendedor/Supervisor: ciudad -> el sistema asigna ticket y region (supervisor = canal SUP).
              ciudad: esCampoN ? (ciudadN || undefined) : (String(fd.get('ciudad') || '') || undefined),
              canal: esVendedorN ? (canalN || undefined) : undefined,
              zona: esCampoN ? undefined : (String(fd.get('zona') || '') || undefined),
              regionId: esCampoN ? undefined : (String(fd.get('regionId') || '') || undefined),
              supervisorId: esVendedorN ? (supervisorN || undefined) : undefined,
            });
          }}>
          <input name="nombre" placeholder="Nombre completo *" required />
          <input name="usuario" placeholder="Usuario de acceso *" required autoCapitalize="none" />
          <div style={{ display: 'flex', gap: 8 }}>
            <input name="pin" placeholder="PIN (4-6 digitos) *" required pattern="\d{4,6}" inputMode="numeric" style={{ flex: 1 }} />
            <select value={rolN} onChange={e => setRolN(e.target.value)} required style={{ flex: 1 }}>
              <option value="VENDEDOR">Vendedor</option>
              <option value="ENTREGADOR">Entregador</option>
              <option value="SUPERVISOR">Supervisor</option>
              {puedeCrearAdmins && <option value="COADMIN">Co-admin</option>}
              {puedeCrearAdmins && <option value="ADMIN">Admin</option>}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input name="documento" placeholder="Documento / cedula" inputMode="numeric" style={{ flex: 1 }} />
            <input name="telefono" placeholder="Telefono" inputMode="tel" style={{ flex: 1 }} />
          </div>

          {esCampoN ? (
            <>
              <div style={{ display: 'flex', gap: 8 }}>
                <select value={ciudadN} onChange={e => setCiudadN(e.target.value)} style={{ flex: 1 }}>
                  <option value="">Ciudad / regional...</option>
                  {CIUDADES.map(c => <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</option>)}
                </select>
                {esVendedorN && (
                  <select value={canalN} onChange={e => setCanalN(e.target.value)} style={{ flex: 1 }}>
                    <option value="">Canal...</option>
                    {CANALES.map(c => <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</option>)}
                  </select>
                )}
              </div>
              {esVendedorN && (
                <select value={supervisorN} onChange={e => setSupervisorN(e.target.value)}>
                  <option value="">Supervisor a cargo (opcional)...</option>
                  {supervisores.map(s => <option key={s.id} value={s.id}>{s.nombre}{s.zona ? ` · ${s.zona}` : ''}</option>)}
                </select>
              )}
              <div className="muted" style={{ fontSize: 12 }}>
                Ticket a asignar: <b className="mono accent">{ciudadN && (esSupervisorN || canalN) ? (ticketPrev?.ticket ?? '...') : (esVendedorN ? '— elige ciudad y canal —' : '— elige ciudad —')}</b>
                <span style={{ display: 'block', fontSize: 11, opacity: .8 }}>
                  {esSupervisorN
                    ? 'El supervisor queda a cargo de los vendedores de su region que aun no tengan supervisor.'
                    : 'La region y las listas de precio se asignan segun la ciudad y el canal (focalizado = solo Droguerias).'}
                </span>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8 }}>
                <input name="ciudad" placeholder="Ciudad" style={{ flex: 1 }} />
                <input name="zona" placeholder="Zona / ruta (opcional)" style={{ flex: 1 }} />
              </div>
              <select name="regionId" defaultValue="">
                <option value="">Sin region asignada</option>
                {regiones?.map(r => <option key={r.id} value={r.id}>Region: {r.nombre}</option>)}
              </select>
            </>
          )}

          <input name="meta" placeholder="Meta mensual" inputMode="numeric" defaultValue={10000000} />
          <button className="btn" disabled={crear.isPending}>{crear.isPending ? 'Creando...' : 'Crear usuario'}</button>
          {crear.isError && <div className="error-box">{(crear.error as Error).message}</div>}
        </form>
      )}

      {visibles.map(u => {
        const esVend = u.rol === 'VENDEDOR';
        const canal = esVend ? canalDeZona(u.zona) : '';
        const supervisorNombre = esVend && u.supervisorId
          ? (supervisores.find(s => s.id === u.supervisorId)?.nombre ?? u.supervisor?.nombre ?? '') : '';
        return (
          <div key={u.id} className="card" style={{ display: 'grid', gap: 8, padding: '12px 14px', opacity: u.activo === false ? .5 : 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 38, height: 38, borderRadius: '50%', display: 'grid', placeItems: 'center',
                background: 'var(--bg3)', color: COLOR_ROL[u.rol], fontWeight: 700, fontSize: 13, flexShrink: 0,
              }}>
                {u.nombre.split(' ').map(p => p[0]).slice(0, 2).join('')}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ fontSize: 14 }}>{u.nombre}</strong>
                <div style={{ fontSize: 11 }}>
                  <span style={{ color: COLOR_ROL[u.rol], fontWeight: 700 }}>{u.rol}{canal ? ` · ${canal}` : ''}</span>
                  <span className="muted">{u.zona ? ` · ${u.zona}` : ''} · @{u.usuario}</span>
                  {u.meta != null && <span className="muted"> · Meta {u.meta.toLocaleString('es-CO')}</span>}
                </div>
                {supervisorNombre && <div className="muted" style={{ fontSize: 11 }}>👤 Supervisor: {supervisorNombre}</div>}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 12 }}
                onClick={() => { setErrEdit(null); setEditId(editId === u.id ? null : u.id); }}>✏️ Editar</button>
              {(esVend || u.rol === 'ENTREGADOR') && (
                <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 12 }}
                  onClick={() => { setReempInfo(null); setReempErr(null); setReempId(reempId === u.id ? null : u.id); }}>♻️ Reemplazar</button>
              )}
              <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 12 }}
                onClick={() => {
                  const v = prompt(`Meta mensual de ${u.nombre}:`, String(u.meta ?? 10000000));
                  if (v != null) {
                    const meta = Number(v.replace(/[^\d]/g, ''));
                    if (Number.isFinite(meta) && meta >= 0) actualizar.mutate({ id: u.id, meta });
                    else alert('Meta invalida');
                  }
                }}>🎯 Meta</button>
              <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 12 }}
                onClick={() => {
                  const pin = prompt(`Nuevo PIN para ${u.nombre} (4-6 digitos):`);
                  if (pin && /^\d{4,6}$/.test(pin)) actualizar.mutate({ id: u.id, pin });
                  else if (pin) alert('PIN invalido');
                }}>🔑 PIN</button>
              <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 12, color: u.activo === false ? 'var(--green)' : 'var(--red)' }}
                onClick={() => actualizar.mutate({ id: u.id, activo: u.activo === false })}>
                {u.activo === false ? 'Activar' : 'Desactivar'}
              </button>
            </div>

            {editId === u.id && (
              <form style={{ display: 'grid', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 10 }}
                onSubmit={e => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  setErrEdit(null);
                  actualizar.mutate({
                    id: u.id,
                    nombre: String(fd.get('nombre') || '').trim() || undefined,
                    usuario: String(fd.get('usuario') || '').toLowerCase().trim().replace(/[@\s]/g, '') || undefined,
                    rol: String(fd.get('rol') || '') || undefined,
                    // Vendedor: el canal recalcula el ticket y las listas en el servidor (no se edita el ticket a mano).
                    canal: esVend ? (String(fd.get('canal') || '') || undefined) : undefined,
                    zona: esVend ? undefined : String(fd.get('zona') || ''),
                    documento: String(fd.get('documento') || ''),
                    ciudad: String(fd.get('ciudad') || ''),
                    telefono: String(fd.get('telefono') || ''),
                    meta: fd.get('meta') ? Number(String(fd.get('meta')).replace(/[^\d]/g, '')) : undefined,
                    regionId: String(fd.get('regionId') || '') || null,
                    supervisorId: esVend ? (String(fd.get('supervisorId') || '') || null) : undefined,
                  }, {
                    onSuccess: () => setEditId(null),
                    onError: (err: any) => setErrEdit(err?.message || 'No se pudo guardar'),
                  });
                }}>
                <input name="nombre" defaultValue={u.nombre} placeholder="Nombre completo" />
                <input name="usuario" defaultValue={u.usuario} placeholder="Usuario de acceso (login)" autoCapitalize="none" />
                <div style={{ display: 'flex', gap: 8 }}>
                  <select name="rol" defaultValue={u.rol} style={{ flex: 1 }}>
                    <option value="VENDEDOR">Vendedor</option>
                    <option value="ENTREGADOR">Entregador</option>
                    <option value="SUPERVISOR">Supervisor</option>
                    {puedeCrearAdmins && <option value="COADMIN">Co-admin</option>}
                    {puedeCrearAdmins && <option value="ADMIN">Admin</option>}
                  </select>
                  <input name="meta" defaultValue={u.meta ?? 10000000} placeholder="Meta" inputMode="numeric" style={{ maxWidth: 130 }} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input name="documento" defaultValue={u.documento ?? ''} placeholder="Documento" inputMode="numeric" style={{ flex: 1, minWidth: 0 }} />
                  <input name="ciudad" defaultValue={u.ciudad ?? ''} placeholder="Ciudad" style={{ flex: 1, minWidth: 0 }} />
                  <input name="telefono" defaultValue={u.telefono ?? ''} placeholder="Telefono" inputMode="tel" style={{ flex: 1, minWidth: 0 }} />
                </div>

                {esVend ? (
                  <>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <label style={{ flex: 1, fontSize: 11 }} className="muted">
                        Canal (cambia ticket y listas)
                        <select name="canal" defaultValue={canalValDeZona(u.zona)}>
                          <option value="">— sin cambio —</option>
                          {CANALES.map(c => <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</option>)}
                        </select>
                      </label>
                      <label style={{ flex: 1, fontSize: 11 }} className="muted">
                        Ticket actual
                        <input value={u.zona ?? ''} readOnly style={{ opacity: .7 }} />
                      </label>
                    </div>
                    <select name="supervisorId" defaultValue={u.supervisorId ?? ''}>
                      <option value="">Sin supervisor asignado</option>
                      {supervisores.map(s => <option key={s.id} value={s.id}>Supervisor: {s.nombre}{s.zona ? ` · ${s.zona}` : ''}</option>)}
                    </select>
                  </>
                ) : (
                  <input name="zona" defaultValue={u.zona ?? ''} placeholder="Ticket / zona (ej. ARM-07-SUP)" />
                )}

                <select name="regionId" defaultValue={u.region?.id ?? ''}>
                  <option value="">Sin region asignada</option>
                  {regiones?.map(r => <option key={r.id} value={r.id}>Region: {r.nombre}</option>)}
                </select>
                {errEdit && <div className="error-box">{errEdit}</div>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn" type="submit" style={{ flex: 1 }}>Guardar cambios</button>
                  <button className="btn btn-ghost" type="button" onClick={() => setEditId(null)}>Cancelar</button>
                </div>
              </form>
            )}
          </div>
        );
      })}
    </div>
  );
}
