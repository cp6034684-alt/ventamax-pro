import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { importarApi, bodegasApi } from '../../api/servicios';
import type { Bodega } from '../../api/tipos';

type Tipo = 'clientes' | 'productos' | 'listas' | 'inventario';

const DESCRIPCION: Record<Tipo, string> = {
  clientes: 'Carga clientes nuevos a la base de datos.',
  productos: '⚠️ Solo para la carga INICIAL del catálogo. Crea productos nuevos; si el código ya existe, lo OMITE (no lo actualiza).',
  inventario: '📥 Uso diario: actualiza la EXISTENCIA y el PRECIO de cada producto según el informe de bodega, y crea las referencias nuevas.',
  listas: 'Asigna a cada cliente su lista de precios (lo busca por NIT; no crea clientes).',
};

const COLUMNAS: Record<Tipo, string> = {
  clientes: 'nombre*, razonSocial, nit, tipologia, listaPrecio, contacto, telefono, correo, direccion, barrio, ciudad, zona, segmento, diaVisita (1-7), lat, lng',
  productos: 'codigo, nombre*, marca, categoria, linea, segmento, subsegmento, unidad, iva, precioCompra, precioGeneral, precioMayorista, precioTat, precioDroguerias, precioTatViajeros, precioEntreSede, stock',
  listas: 'nit, listaPrecio (tipologia opcional) — actualiza la lista de los clientes existentes por NIT',
  inventario: 'REFERENCIA, DETALLE, MARCA, TAT, SALDO — informe de bodega: actualiza existencia y precio por referencia',
};

// El código del cliente lo genera el sistema (VMX-####), por eso no se importa.

// Normaliza un encabezado: minúsculas, sin tildes, sin espacios extra
const normHeader = (s: string) =>
  s.toString().trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Acepta encabezados en español / variantes y los mapea a las claves del backend
const ALIAS: Record<string, string> = {
  nombre: 'nombre', 'nombre del negocio': 'nombre', negocio: 'nombre', nomcom: 'nombre',
  'razon social': 'razonSocial', razonsocial: 'razonSocial', 'nombre cliente': 'razonSocial',
  tipologia: 'tipologia', 'tipologia cliente': 'tipologia',
  'lista precio': 'listaPrecio', listaprecio: 'listaPrecio', 'lista de precio': 'listaPrecio',
  contacto: 'contacto', tendero: 'contacto', 'nombre del tendero': 'contacto', propietario: 'contacto', cliente: 'contacto',
  telefono: 'telefono', celular: 'telefono', tel: 'telefono', movil: 'telefono',
  direccion: 'direccion', dir: 'direccion',
  barrio: 'barrio',
  ciudad: 'ciudad', municipio: 'ciudad', poblacion: 'ciudad',
  correo: 'correo', email: 'correo', 'e-mail': 'correo', 'email fe': 'correo', 'correo electronico': 'correo',
  nit: 'nit', 'nit/cc': 'nit', cc: 'nit', identificacion: 'nit', cedula: 'nit', documento: 'nit',
  zona: 'zona', ruta: 'zona',
  segmento: 'segmento', canal: 'segmento',
  dia: 'diaVisita', 'dia de visita': 'diaVisita', diavisita: 'diaVisita', 'dia visita': 'diaVisita',
  lat: 'lat', latitud: 'lat',
  lng: 'lng', lon: 'lng', long: 'lng', longitud: 'lng',
  codigo: 'codigo', sku: 'codigo', 'codigo de barras': 'codigo', referencia: 'codigo',
  detalle: 'nombre', descripcion: 'nombre', articulo: 'nombre',
  categoria: 'categoria', grupo: 'categoria',
  marca: 'marca', fabricante: 'marca',
  linea: 'linea', subsegmento: 'subsegmento', 'sub segmento': 'subsegmento',
  iva: 'iva', '% iva': 'iva', 'porcentaje iva': 'iva',
  unidad: 'unidad', embalaje: 'unidad',
  preciocompra: 'precioCompra', 'precio compra': 'precioCompra', costo: 'precioCompra', 'costo.prom': 'precioCompra',
  precioventa: 'precioVenta', 'precio venta': 'precioVenta', precio: 'precioVenta',
  preciogeneral: 'precioGeneral', general: 'precioGeneral', 'lista general': 'precioGeneral',
  preciomayorista: 'precioMayorista', mayorista: 'precioMayorista',
  preciotat: 'precioTat', tat: 'precioTat',
  preciodroguerias: 'precioDroguerias', droguerias: 'precioDroguerias',
  preciotatviajeros: 'precioTatViajeros', 'tat viajeros': 'precioTatViajeros', viajeros: 'precioTatViajeros',
  precioentresede: 'precioEntreSede', 'entre sede': 'precioEntreSede', entresede: 'precioEntreSede',
  stock: 'stock', existencia: 'stock', existencias: 'stock', cantidad: 'stock', saldo: 'stock',
  stockminimo: 'stockMinimo', 'stock minimo': 'stockMinimo', minimo: 'stockMinimo',
};

const DIA_NUM: Record<string, number> = {
  lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6, domingo: 7,
};
const NUMERICAS = ['precioCompra', 'precioVenta', 'precioGeneral', 'precioMayorista', 'precioTat', 'precioDroguerias', 'precioTatViajeros', 'precioEntreSede', 'iva', 'stock', 'stockMinimo', 'lat', 'lng'];

export function ImportarPage() {
  const [tipo, setTipo] = useState<Tipo>('clientes');
  const [filas, setFilas] = useState<any[]>([]);
  const [resultado, setResultado] = useState('');
  const [error, setError] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [asignarCodigo, setAsignarCodigo] = useState(false);
  const [bodegas, setBodegas] = useState<Bodega[]>([]);
  const [bodegaId, setBodegaId] = useState('');
  const [nombreArchivo, setNombreArchivo] = useState('');
  const [ultimaCarga, setUltimaCarga] = useState<string | null>(null);
  useEffect(() => { bodegasApi.listar().then(setBodegas).catch(() => undefined); }, []);

  const leerArchivo = async (archivo: File) => {
    setError(''); setResultado(''); setUltimaCarga(null); setNombreArchivo(archivo.name);
    const buffer = await archivo.arrayBuffer();
    const libro = XLSX.read(buffer);
    const hoja = libro.Sheets[libro.SheetNames[0]];
    let datos: any[];
    if (tipo === 'inventario') {
      const aoa = XLSX.utils.sheet_to_json<any[]>(hoja, { header: 1, defval: '' });
      const hi = aoa.findIndex(r => Array.isArray(r) && r.some(c => normHeader(String(c)) === 'referencia'));
      if (hi < 0) return setError('No encontre la columna REFERENCIA en el archivo de bodega.');
      datos = XLSX.utils.sheet_to_json<any>(hoja, { range: hi, defval: undefined });
    } else {
      datos = XLSX.utils.sheet_to_json<any>(hoja, { defval: undefined });
    }

    // Normalizar: mapear encabezados (alias en español), trim y conversión numérica
    const limpias = datos.map(f => {
      const fila: any = {};
      for (const [k, v] of Object.entries(f)) {
        const clave = ALIAS[normHeader(k)] ?? String(k).trim();
        if (v === undefined || v === null || String(v).trim() === '') continue;
        if (clave === 'diaVisita') {
          const txt = normHeader(String(v));
          fila.diaVisita = DIA_NUM[txt] ?? (Number(v) || undefined);
        } else if (NUMERICAS.includes(clave)) {
          fila[clave] = Number(v);
        } else {
          fila[clave] = String(v).trim();
        }
      }
      return fila;
    }).filter(f => tipo === 'listas' ? (f.nit && f.listaPrecio) : tipo === 'inventario' ? (f.codigo && f.nombre) : f.nombre);

    let finales = limpias;
    if (tipo === 'listas') {
      // Un cliente puede aparecer muchas veces: deduplicamos por NIT y nos
      // quedamos con la lista de precio más frecuente.
      const conteo = new Map<string, Map<string, number>>();
      const tip = new Map<string, string>();
      for (const f of limpias) {
        const nit = String(f.nit);
        if (!conteo.has(nit)) conteo.set(nit, new Map());
        const c = conteo.get(nit)!;
        const l = String(f.listaPrecio);
        c.set(l, (c.get(l) ?? 0) + 1);
        if (f.tipologia) tip.set(nit, String(f.tipologia));
      }
      finales = [...conteo].map(([nit, c]) => {
        const lista = [...c].sort((a, b) => b[1] - a[1])[0][0];
        const row: any = { nit, listaPrecio: lista };
        if (tip.has(nit)) row.tipologia = tip.get(nit);
        return row;
      });
    }

    if (!finales.length) return setError('No se encontraron filas válidas. La primera fila debe tener los nombres de columna.');
    setFilas(finales);
  };

  const subir = async () => {
    if (tipo === 'inventario' && !bodegaId) { setError('Elige primero la bodega a la que va este inventario.'); return; }
    setSubiendo(true); setError(''); setUltimaCarga(null);
    try {
      if (tipo === 'listas') {
        const r = await importarApi.listasCliente(filas);
        setResultado(`✅ ${r.actualizados} cliente(s) con lista asignada${r.invalidas ? ` · ${r.invalidas} lista(s) no reconocida(s)` : ''}`);
        setFilas([]); setSubiendo(false);
        return;
      }
    } catch (e: any) {
      setError(e.message); setSubiendo(false); return;
    }
    // El backend acepta hasta 2.000 por lote; subimos en bloques para soportar
    // archivos grandes (miles de clientes) sin reventar el límite.
    const LOTE = tipo === 'inventario' ? 5000 : 1000;
    let insertados = 0, omitidos = 0, actualizados = 0, creados = 0;
    try {
      for (let i = 0; i < filas.length; i += LOTE) {
        const bloque = filas.slice(i, i + LOTE);
        if (tipo === 'inventario') {
          const r = await importarApi.inventario(bodegaId, bloque, nombreArchivo);
          actualizados += r.actualizados; creados += r.creados;
          if (r.cargaId) setUltimaCarga(r.cargaId);
        } else {
          const r: { insertados: number; omitidos?: number } = tipo === 'clientes'
            ? await importarApi.clientes(bloque, asignarCodigo)
            : await importarApi.productos(bloque);
          insertados += r.insertados;
          if ('omitidos' in r && r.omitidos) omitidos += r.omitidos;
        }
        setResultado(`Importando… ${Math.min(i + LOTE, filas.length)} / ${filas.length}`);
      }
      if (tipo === 'inventario') { const nb = bodegas.find(b => b.id === bodegaId)?.nombre ?? ''; setResultado(`✅ Inventario en ${nb}: ${actualizados} actualizado(s), ${creados} nuevo(s)`); }
      else setResultado(`✅ ${insertados} fila(s) importada(s)${omitidos ? ` · ${omitidos} omitida(s) por código duplicado` : ''}`);
      setFilas([]);
    } catch (e: any) {
      setError(`${e.message} (importadas ${insertados} antes del error)`);
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
        {(['clientes', 'productos', 'inventario', 'listas'] as Tipo[]).map(t => (
          <button key={t} className={`btn ${tipo === t ? '' : 'btn-ghost'}`} style={{ flex: 1, fontSize: 13 }}
            onClick={() => { setTipo(t); setFilas([]); setResultado(''); }}>
            {t === 'clientes' ? '👥 Clientes' : t === 'productos' ? '📦 Productos' : t === 'inventario' ? '📥 Inventario' : '🏷️ Listas'}
          </button>
        ))}
      </div>

      <div className="card">
        <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, lineHeight: 1.4 }}>{DESCRIPCION[tipo]}</p>
        <p className="muted" style={{ fontSize: 12, marginBottom: 4 }}>{tipo === 'inventario' ? 'El archivo de bodega tal cual (encabezados donde diga REFERENCIA):' : 'Columnas esperadas en el Excel (fila 1 = encabezados):'}</p>
        <p className="mono accent" style={{ fontSize: 12, marginBottom: 12 }}>{COLUMNAS[tipo]}</p>
        <div style={{ display: 'grid', gap: 8 }}>
          <button className="btn btn-ghost" onClick={descargarPlantilla}>⬇ Descargar plantilla</button>
          <label className="btn" style={{ textAlign: 'center' }}>
            📂 Seleccionar archivo Excel
            <input type="file" accept=".xlsx,.xls,.csv" hidden
              onChange={e => e.target.files?.[0] && leerArchivo(e.target.files[0])} />
          </label>
        </div>
        {tipo === 'inventario' && (
          <div style={{ marginTop: 10 }}>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Bodega a la que entra este inventario:
              <select value={bodegaId} onChange={e => setBodegaId(e.target.value)} style={{ marginTop: 4 }}>
                <option value="">Elegir bodega…</option>
                {bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
              </select>
            </label>
            {!bodegas.length && <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>No hay bodegas creadas. Créalas en MÁS → Bodegas.</p>}
          </div>
        )}
        {tipo === 'clientes' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={asignarCodigo} onChange={e => setAsignarCodigo(e.target.checked)}
              style={{ width: 'auto' }} />
            <span>Asignar código del sistema (VMX) a estos clientes
              <br /><span className="muted" style={{ fontSize: 11 }}>
                Actívalo para el rutero de <b>familia</b>. Déjalo apagado para <b>surtimax</b> (su código queda vacío y se asigna luego).
              </span>
            </span>
          </label>
        )}
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
          <button className="btn" style={{ width: '100%' }} onClick={subir} disabled={subiendo || (tipo === 'inventario' && !bodegaId)}>
            {subiendo ? 'Importando…' : `Importar ${filas.length} ${tipo}`}
          </button>
        </div>
      )}

      {resultado && <div className="card" style={{ borderColor: 'var(--green)', color: 'var(--green)', textAlign: 'center' }}>{resultado}</div>}
      {ultimaCarga && tipo === 'inventario' && (
        <button className="btn btn-ghost" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}
          onClick={async () => {
            if (!confirm('¿Devolver esta última carga? El inventario de esa bodega vuelve a como estaba antes.')) return;
            try { await importarApi.revertirCarga(ultimaCarga); setResultado('↩️ Carga devuelta. El inventario volvió a su estado anterior.'); setUltimaCarga(null); }
            catch (e: any) { setError(e.message); }
          }}>
          ↩️ Devolver esta carga (si fue a la bodega equivocada)
        </button>
      )}
      {error && <div className="card" style={{ borderColor: 'var(--red)', color: 'var(--red)', textAlign: 'center' }}>{error}</div>}
    </div>
  );
}
