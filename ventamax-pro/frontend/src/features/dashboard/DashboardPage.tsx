import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportesApi, facturasApi } from '../../api/servicios';
import { pendientes, reintentarCola } from '../../api/colaOffline';
import { fmtMoneda } from '../../api/formato';

export function DashboardPage() {
  const [enCola, setEnCola] = useState(pendientes());

  const { data: dia } = useQuery({ queryKey: ['mi-dia'], queryFn: reportesApi.miDia, refetchInterval: 60_000 });
  const { data: semana } = useQuery({ queryKey: ['semana'], queryFn: reportesApi.semana });
  const { data: ultimas } = useQuery({
    queryKey: ['ultimas-facturas'],
    queryFn: () => facturasApi.listar({ porPagina: '8' }),
  });

  const sincronizar = async () => {
    const ok = await reintentarCola();
    setEnCola(pendientes());
    alert(ok > 0 ? `${ok} venta(s) sincronizada(s)` : 'Sin conexión o nada pendiente');
  };

  const maxSemana = Math.max(1, ...(semana ?? []).map(d => d.total));

  return (
    <div style={{ display: 'grid', gap: 14, maxWidth: 700, margin: '0 auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="card">
          <div className="muted" style={{ fontSize: 11, fontWeight: 700 }}>VENTAS HOY</div>
          <div className="mono" style={{ fontSize: 28, fontWeight: 700 }}>{dia?.ventasHoy ?? '—'}</div>
        </div>
        <div className="card">
          <div className="muted" style={{ fontSize: 11, fontWeight: 700 }}>TOTAL HOY</div>
          <div className="mono green" style={{ fontSize: 22, fontWeight: 700 }}>
            {dia ? fmtMoneda(dia.totalHoy) : '—'}
          </div>
        </div>
      </div>

      {enCola > 0 && (
        <div className="card" style={{ borderColor: 'var(--orange)' }}>
          <strong style={{ color: 'var(--orange)' }}>{enCola} venta(s) sin sincronizar</strong>
          <p className="muted" style={{ fontSize: 12, margin: '4px 0 10px' }}>
            Se guardaron sin conexión y se enviarán al servidor.
          </p>
          <button className="btn" onClick={sincronizar}>Sincronizar ahora</button>
        </div>
      )}

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

      <div className="card">
        <strong style={{ fontSize: 13 }}>Últimas ventas</strong>
        {!ultimas?.datos.length && <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>Aún no hay ventas registradas.</p>}
        {ultimas?.datos.map(f => (
          <div key={f.id} style={{
            display: 'flex', justifyContent: 'space-between', padding: '9px 0',
            borderBottom: '1px solid var(--border)', fontSize: 13,
          }}>
            <span>#{f.consecutivo} · {f.cliente?.nombre ?? '—'}</span>
            <span className="mono">{fmtMoneda(f.total)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
