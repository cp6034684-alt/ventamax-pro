import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientesApi } from '../../api/servicios';
import type { GrupoDuplicado } from '../../api/tipos';

export function DuplicadosPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['duplicados'], queryFn: clientesApi.duplicados });
  const [elegido, setElegido] = useState<Record<string, string>>({});

  const fusionar = useMutation({
    mutationFn: ({ mantenerId, eliminarIds }: { mantenerId: string; eliminarIds: string[] }) =>
      clientesApi.fusionar(mantenerId, eliminarIds),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['duplicados'] }),
  });

  // Por defecto se mantiene el cliente con más facturas de cada grupo.
  const keepId = (g: GrupoDuplicado) =>
    elegido[g.nit] ?? [...g.clientes].sort((a, b) => b._count.facturas - a._count.facturas)[0].id;

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', display: 'grid', gap: 12 }}>
      <div className="card" style={{ background: 'rgba(255,170,0,.06)', borderColor: 'rgba(255,170,0,.25)' }}>
        <strong style={{ color: 'var(--orange)' }}>🧹 Clientes duplicados (mismo NIT)</strong>
        <p className="muted" style={{ fontSize: 11, margin: '4px 0 0' }}>
          Al fusionar, las facturas y visitas pasan al cliente que elijas mantener y los demás se desactivan. No se borra historial.
        </p>
      </div>

      {isLoading && <p className="muted">Buscando duplicados…</p>}
      {data && !data.length && <p className="muted">No hay clientes duplicados por NIT. 🎉</p>}

      {data?.map(g => {
        const mantener = keepId(g);
        return (
          <div key={g.nit} className="card" style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <strong style={{ fontSize: 13 }}>NIT {g.nit}</strong>
              <span className="muted" style={{ fontSize: 11 }}>· {g.clientes.length} registros</span>
            </div>
            {g.clientes.map(c => (
              <label key={c.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8,
                border: '1px solid var(--border)', cursor: 'pointer',
                background: mantener === c.id ? 'rgba(0,200,255,.08)' : 'transparent',
              }}>
                <input type="radio" name={`keep-${g.nit}`} checked={mantener === c.id}
                  onChange={() => setElegido(e => ({ ...e, [g.nit]: c.id }))} style={{ width: 'auto' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>
                    {c.nombre}{c.codigo ? ` · ${c.codigo}` : ''}
                  </div>
                  <div className="muted" style={{ fontSize: 11 }}>
                    {c.ciudad ?? ''}{c.barrio ? ` · ${c.barrio}` : ''}{c.listaPrecio ? ` · ${c.listaPrecio}` : ''} · {c._count.facturas} factura(s)
                  </div>
                </div>
                {mantener === c.id && <span className="accent" style={{ fontSize: 11, fontWeight: 700 }}>MANTENER</span>}
              </label>
            ))}
            <button className="btn" disabled={fusionar.isPending}
              onClick={() => {
                const eliminarIds = g.clientes.map(c => c.id).filter(id => id !== mantener);
                if (confirm(`Fusionar ${eliminarIds.length} duplicado(s) del NIT ${g.nit} en el cliente seleccionado?`)) {
                  fusionar.mutate({ mantenerId: mantener, eliminarIds });
                }
              }}>
              {fusionar.isPending ? 'Fusionando…' : 'Fusionar este grupo'}
            </button>
          </div>
        );
      })}
      {fusionar.isError && <div className="error-box">{(fusionar.error as Error).message}</div>}
    </div>
  );
}
