import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { gastosApi } from '../../api/servicios';
import { fmtMoneda, fmtFecha } from '../../api/formato';

const CATEGORIAS = ['Transporte', 'Alimentación', 'Combustible', 'Papelería', 'Otro'];

export function GastosPage() {
  const [pagina, setPagina] = useState(1);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['gastos', pagina], queryFn: () => gastosApi.listar(pagina) });

  const crear = useMutation({
    mutationFn: gastosApi.crear,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gastos'] }),
  });

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', display: 'grid', gap: 12 }}>
      <form className="card" style={{ display: 'grid', gap: 10 }}
        onSubmit={e => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          crear.mutate({
            concepto: String(fd.get('concepto')),
            categoria: String(fd.get('categoria')),
            monto: Number(fd.get('monto')),
            notas: String(fd.get('notas') || '') || undefined,
          });
          e.currentTarget.reset();
        }}>
        <strong style={{ fontSize: 13 }}>Registrar gasto</strong>
        <input name="concepto" placeholder="Concepto *" required />
        <div style={{ display: 'flex', gap: 8 }}>
          <select name="categoria">{CATEGORIAS.map(c => <option key={c}>{c}</option>)}</select>
          <input name="monto" type="number" placeholder="Monto *" required min={1} inputMode="numeric" />
        </div>
        <input name="notas" placeholder="Notas (opcional)" />
        <button className="btn" disabled={crear.isPending}>{crear.isPending ? 'Guardando…' : 'Guardar gasto'}</button>
        {crear.isError && <div className="error-box">{(crear.error as Error).message}</div>}
      </form>

      {data?.datos.map(g => (
        <div key={g.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', fontSize: 13 }}>
          <div>
            <strong>{g.concepto}</strong>
            <div className="muted" style={{ fontSize: 11 }}>
              {[g.categoria, g.usuario?.nombre, fmtFecha(g.fecha)].filter(Boolean).join(' · ')}
            </div>
          </div>
          <span className="mono" style={{ color: 'var(--red)' }}>−{fmtMoneda(g.monto)}</span>
        </div>
      ))}

      {data && data.paginacion.totalPaginas > 1 && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button className="btn btn-ghost" disabled={pagina === 1} onClick={() => setPagina(p => p - 1)}>←</button>
          <span className="muted" style={{ fontSize: 12, alignSelf: 'center' }}>{pagina} / {data.paginacion.totalPaginas}</span>
          <button className="btn btn-ghost" disabled={pagina >= data.paginacion.totalPaginas} onClick={() => setPagina(p => p + 1)}>→</button>
        </div>
      )}
    </div>
  );
}
