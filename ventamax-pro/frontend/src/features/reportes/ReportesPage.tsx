import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { reportesApi } from '../../api/servicios';
import { fmtMoneda } from '../../api/formato';

const hoyISO = () => new Date().toISOString().slice(0, 10);
const inicioMesISO = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };

export function ReportesPage() {
  const [desde, setDesde] = useState(inicioMesISO());
  const [hasta, setHasta] = useState(hoyISO());
  const [exportando, setExportando] = useState(false);

  const { data: resumen, isLoading } = useQuery({
    queryKey: ['resumen', desde, hasta],
    queryFn: () => reportesApi.resumen(desde, hasta),
  });
  const { data: semana } = useQuery({ queryKey: ['semana'], queryFn: reportesApi.semana });
  const { data: cartera } = useQuery({ queryKey: ['cartera'], queryFn: reportesApi.cartera });

  const exportarExcel = async () => {
    setExportando(true);
    try {
      const filas = await reportesApi.exportarFacturas(desde, hasta);
      if (!filas.length) return alert('No hay facturas en ese rango.');
      const hoja = XLSX.utils.json_to_sheet(filas);
      const libro = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(libro, hoja, 'Facturas');
      XLSX.writeFile(libro, `facturas_${desde}_a_${hasta}.xlsx`);
    } finally { setExportando(false); }
  };

  const totalVentas = Number(resumen?.ventas._sum.total ?? 0);
  const totalGastos = Number(resumen?.gastos._sum.monto ?? 0);
  const maxSemana = Math.max(1, ...(semana ?? []).map(d => d.total));

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', display: 'grid', gap: 14 }}>
      <div className="card" style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap' }}>
        <label style={{ flex: 1, minWidth: 130, fontSize: 11, color: 'var(--muted)' }}>
          DESDE<input type="date" value={desde} onChange={e => setDesde(e.target.value)} />
        </label>
        <label style={{ flex: 1, minWidth: 130, fontSize: 11, color: 'var(--muted)' }}>
          HASTA<input type="date" value={hasta} onChange={e => setHasta(e.target.value)} />
        </label>
        <button className="btn" onClick={exportarExcel} disabled={exportando}>
          {exportando ? 'Generando…' : '⬇ Excel'}
        </button>
      </div>

      {isLoading && <p className="muted">Calculando…</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <div className="card">
          <div className="muted" style={{ fontSize: 11, fontWeight: 700 }}>VENTAS</div>
          <div className="mono green" style={{ fontSize: 20, fontWeight: 700 }}>{fmtMoneda(totalVentas)}</div>
          <div className="muted" style={{ fontSize: 11 }}>{resumen?.ventas._count ?? 0} facturas</div>
        </div>
        <div className="card">
          <div className="muted" style={{ fontSize: 11, fontWeight: 700 }}>GASTOS</div>
          <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: 'var(--red)' }}>{fmtMoneda(totalGastos)}</div>
          <div className="muted" style={{ fontSize: 11 }}>{resumen?.gastos._count ?? 0} registros</div>
        </div>
        <div className="card">
          <div className="muted" style={{ fontSize: 11, fontWeight: 700 }}>UTILIDAD BRUTA</div>
          <div className="mono accent" style={{ fontSize: 20, fontWeight: 700 }}>{fmtMoneda(totalVentas - totalGastos)}</div>
        </div>
        <div className="card">
          <div className="muted" style={{ fontSize: 11, fontWeight: 700 }}>CARTERA (deben)</div>
          <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: 'var(--orange)' }}>{fmtMoneda(cartera?.total ?? 0)}</div>
          <div className="muted" style={{ fontSize: 11 }}>{cartera?.clientes.length ?? 0} clientes</div>
        </div>
      </div>

      {!!semana?.length && (
        <div className="card">
          <strong style={{ fontSize: 13 }}>Últimos 7 días</strong>
          <div style={{ display: 'flex', alignItems: 'end', gap: 6, height: 110, marginTop: 12 }}>
            {semana.map(d => (
              <div key={d.dia} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{
                  height: Math.max(4, (d.total / maxSemana) * 80),
                  background: 'linear-gradient(180deg, var(--accent), #0044ff)',
                  borderRadius: 4,
                }} title={fmtMoneda(d.total)} />
                <div className="muted" style={{ fontSize: 9, marginTop: 4 }}>
                  {new Date(d.dia).toLocaleDateString('es-CO', { weekday: 'short' })}
                </div>
                <div className="mono" style={{ fontSize: 9 }}>{d.ventas}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <strong style={{ fontSize: 13 }}>Ranking de vendedores</strong>
        {resumen?.porVendedor.map((v, i) => (
          <div key={v.vendedorId} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13, alignItems: 'center' }}>
            <span className="mono muted" style={{ width: 22 }}>{i + 1}</span>
            <span style={{ flex: 1 }}>{v.nombre}</span>
            <span className="muted" style={{ fontSize: 11 }}>{v._count} ventas</span>
            <span className="mono green">{fmtMoneda(v._sum.total)}</span>
          </div>
        ))}
        {resumen && !resumen.porVendedor.length && <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>Sin ventas en el rango.</p>}
      </div>

      <div className="card">
        <strong style={{ fontSize: 13 }}>Top 20 productos</strong>
        {resumen?.topProductos.map((p, i) => (
          <div key={p.productoId} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13, alignItems: 'center' }}>
            <span className="mono muted" style={{ width: 22 }}>{i + 1}</span>
            <span style={{ flex: 1 }}>{p.nombre}</span>
            <span className="muted" style={{ fontSize: 11 }}>{p._sum.cantidad} uds</span>
            <span className="mono accent">{fmtMoneda(p._sum.total)}</span>
          </div>
        ))}
      </div>

      {!!cartera?.clientes.length && (
        <div className="card">
          <strong style={{ fontSize: 13 }}>Cartera — clientes con saldo</strong>
          {cartera.clientes.slice(0, 30).map(c => (
            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
              <span>{c.nombre} <span className="muted" style={{ fontSize: 11 }}>{c.barrio ?? ''}</span></span>
              <span className="mono" style={{ color: 'var(--orange)' }}>{fmtMoneda(c.saldoPendiente)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
