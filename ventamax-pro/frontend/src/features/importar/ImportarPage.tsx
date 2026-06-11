import { useState } from 'react';
import * as XLSX from 'xlsx';
import { importarApi } from '../../api/servicios';

type Tipo = 'clientes' | 'productos';

const COLUMNAS: Record<Tipo, string> = {
  clientes: 'nombre*, contacto, telefono, direccion, barrio, diaVisita (1-7), lat, lng',
  productos: 'nombre*, codigo, categoria, precioCompra, precioVenta*, stock, stockMinimo',
};

export function ImportarPage() {
  const [tipo, setTipo] = useState<Tipo>('clientes');
  const [filas, setFilas] = useState<any[]>([]);
  const [resultado, setResultado] = useState('');
  const [error, setError] = useState('');
  const [subiendo, setSubiendo] = useState(false);

  const leerArchivo = async (archivo: File) => {
    setError(''); setResultado('');
    const buffer = await archivo.arrayBuffer();
    const libro = XLSX.read(buffer);
    const hoja = libro.Sheets[libro.SheetNames[0]];
    const datos = XLSX.utils.sheet_to_json<any>(hoja, { defval: undefined });

    // Normalizar: trim de strings y conversión numérica donde aplica
    const limpias = datos.map(f => {
      const fila: any = {};
      for (const [k, v] of Object.entries(f)) {
        const clave = String(k).trim();
        if (v === undefined || v === '') continue;
        fila[clave] = ['precioCompra', 'precioVenta', 'stock', 'stockMinimo', 'diaVisita', 'lat', 'lng']
          .includes(clave) ? Number(v) : String(v).trim();
      }
      return fila;
    }).filter(f => f.nombre);

    if (!limpias.length) return setError('No se encontraron filas válidas. La primera fila debe tener los nombres de columna.');
    setFilas(limpias);
  };

  const subir = async () => {
    setSubiendo(true); setError('');
    try {
      const r = tipo === 'clientes'
        ? await importarApi.clientes(filas)
        : await importarApi.productos(filas);
      setResultado(`✅ ${r.insertados} fila(s) importada(s)${'omitidos' in r && r.omitidos ? ` · ${r.omitidos} omitida(s) por código duplicado` : ''}`);
      setFilas([]);
    } catch (e: any) {
      setError(e.message);
    } finally { setSubiendo(false); }
  };

  const descargarPlantilla = () => {
    const columnas = COLUMNAS[tipo].replace(/\*| \(1-7\)/g, '').split(', ');
    const hoja = XLSX.utils.aoa_to_sheet([columnas]);
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, tipo);
    XLSX.writeFile(libro, `plantilla-${tipo}.xlsx`);
  };

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {(['clientes', 'productos'] as Tipo[]).map(t => (
          <button key={t} className={`btn ${tipo === t ? '' : 'btn-ghost'}`} style={{ flex: 1 }}
            onClick={() => { setTipo(t); setFilas([]); setResultado(''); }}>
            {t === 'clientes' ? '👥 Clientes' : '📦 Productos'}
          </button>
        ))}
      </div>

      <div className="card">
        <p style={{ fontSize: 13, marginBottom: 6 }}>Columnas esperadas en el Excel (fila 1 = encabezados):</p>
        <p className="mono accent" style={{ fontSize: 12, marginBottom: 12 }}>{COLUMNAS[tipo]}</p>
        <div style={{ display: 'grid', gap: 8 }}>
          <button className="btn btn-ghost" onClick={descargarPlantilla}>⬇ Descargar plantilla</button>
          <label className="btn" style={{ textAlign: 'center' }}>
            📂 Seleccionar archivo Excel
            <input type="file" accept=".xlsx,.xls,.csv" hidden
              onChange={e => e.target.files?.[0] && leerArchivo(e.target.files[0])} />
          </label>
        </div>
      </div>

      {filas.length > 0 && (
        <div className="card">
          <strong>{filas.length} fila(s) lista(s) para importar</strong>
          <div style={{ overflowX: 'auto', margin: '10px 0' }}>
            <table style={{ fontSize: 11, borderCollapse: 'collapse', width: '100%' }}>
              <thead><tr>{Object.keys(filas[0]).map(k =>
                <th key={k} style={{ textAlign: 'left', padding: 4, borderBottom: '1px solid var(--border)', color: 'var(--muted)' }}>{k}</th>)}
              </tr></thead>
              <tbody>{filas.slice(0, 5).map((f, i) => (
                <tr key={i}>{Object.keys(filas[0]).map(k =>
                  <td key={k} style={{ padding: 4, borderBottom: '1px solid var(--border)' }}>{String(f[k] ?? '')}</td>)}
                </tr>
              ))}</tbody>
            </table>
            {filas.length > 5 && <p className="muted" style={{ fontSize: 11, marginTop: 4 }}>… y {filas.length - 5} más</p>}
          </div>
          <button className="btn" style={{ width: '100%' }} onClick={subir} disabled={subiendo}>
            {subiendo ? 'Importando…' : `Importar ${filas.length} ${tipo}`}
          </button>
        </div>
      )}

      {resultado && <div className="card" style={{ borderColor: 'var(--green)', color: 'var(--green)', textAlign: 'center' }}>{resultado}</div>}
      {error && <div className="error-box">{error}</div>}
    </div>
  );
}
