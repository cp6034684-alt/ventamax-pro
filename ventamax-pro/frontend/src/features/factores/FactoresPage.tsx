import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { configApi } from '../../api/servicios';
import { fmtMoneda } from '../../api/formato';

const LABEL: Record<string, string> = {
  GENERAL: 'General (base)', MAYORISTA: 'Mayorista', TAT: 'TAT (mixto)',
  DROGUERIAS: 'Droguerías', TAT_VIAJEROS: 'TAT Viajeros', ENTRE_SEDE: 'Entre Sede',
};

export function FactoresPage() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['factores'], queryFn: configApi.factores });
  const [fac, setFac] = useState<Record<string, number>>({});
  const [base, setBase] = useState(1000);
  const [msg, setMsg] = useState('');

  useEffect(() => { if (data) { const m: Record<string, number> = {}; data.forEach(d => { m[d.canal] = d.factor; }); setFac(m); } }, [data]);

  const guardar = useMutation({
    mutationFn: () => configApi.guardar(Object.entries(fac).map(([canal, factor]) => ({ canal, factor }))),
    onSuccess: () => { setMsg('✓ Guardado.'); qc.invalidateQueries({ queryKey: ['factores'] }); },
  });
  const recuperar = useMutation({
    mutationFn: () => configApi.recuperar(),
    onSuccess: (res) => { const m: Record<string, number> = {}; res.forEach(d => { m[d.canal] = d.factor; }); setFac(m); setMsg('✓ Recuperados de tu catálogo. Revisa y guarda.'); },
  });

  const canales = data?.map(d => d.canal) ?? Object.keys(LABEL);

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', display: 'grid', gap: 12 }}>
      <div className="card" style={{ display: 'grid', gap: 6 }}>
        <strong style={{ fontSize: 15 }}>Factores de precio por canal</strong>
        <p className="muted" style={{ fontSize: 12 }}>
          El cliente define el precio <b>General</b> y el sistema calcula los demás canales multiplicando por su factor
          (relativo al General). Estos factores se aplican al <b>crear productos nuevos</b> desde el inventario.
        </p>
        <button className="btn btn-ghost" onClick={() => recuperar.mutate()} disabled={recuperar.isPending}>
          {recuperar.isPending ? 'Calculando…' : '↻ Recuperar factores reales de mi catálogo'}
        </button>
      </div>

      <div className="card" style={{ display: 'grid', gap: 10 }}>
        {canales.map(c => {
          const f = fac[c] ?? 1;
          const fijo = c === 'GENERAL';
          return (
            <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{LABEL[c] ?? c}</div>
                <div className="muted" style={{ fontSize: 11 }}>{Math.round(f * 100)}% del General · ej. {fmtMoneda(Math.round(base * f))}</div>
              </div>
              <input type="number" step="0.001" min="0" value={fijo ? 1 : f} disabled={fijo}
                onChange={e => setFac(s => ({ ...s, [c]: Number(e.target.value) || 0 }))}
                style={{ width: 90, opacity: fijo ? .6 : 1 }} />
            </div>
          );
        })}
      </div>

      <div className="card" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="muted" style={{ fontSize: 12 }}>Previsualizar con un General de</span>
        <input type="number" value={base} onChange={e => setBase(Number(e.target.value) || 0)} style={{ width: 110 }} />
      </div>

      <button className="btn" onClick={() => { setMsg(''); guardar.mutate(); }} disabled={guardar.isPending}>
        {guardar.isPending ? 'Guardando…' : 'Guardar factores'}
      </button>
      {msg && <div className="muted" style={{ fontSize: 12, textAlign: 'center' }}>{msg}</div>}
    </div>
  );
}
