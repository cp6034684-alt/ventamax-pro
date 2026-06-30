#!/usr/bin/env python3
"""
Inventario por CORREO: lee el buzón de Gmail por IMAP, busca el correo MÁS RECIENTE
cuyo ASUNTO contenga el nombre de la regional (QUINDIO / TOLIMA), toma su adjunto Excel
(REFERENCIA + SALDO [+ TAT, MARCA, DETALLE]) y lo envía al backend
(/api/importar/inventario-auto), que actualiza la existencia de la bodega de esa región.

Secrets requeridos (GitHub → Settings → Secrets and variables → Actions):
  GMAIL_USER          el correo (ej. cp6034684@gmail.com)
  GMAIL_APP_PASSWORD  clave de aplicación de Gmail (16 caracteres, NO la contraseña normal)
  API_BASE            https://ventamax-pro.onrender.com/api
  IMPORT_TOKEN        el mismo token configurado en Render
  INV_REGIONES        (opcional) por defecto QUINDIO,TOLIMA
"""
import os, io, imaplib, email, unicodedata
import requests, openpyxl

def norm(s):
    s = str(s or '').strip().lower()
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')

def campo(header):
    h = norm(header)
    if h == 'referencia' or h == 'codigo': return 'codigo'
    if h in ('detalle', 'descripcion', 'articulo', 'nombre'): return 'nombre'
    if h == 'marca': return 'marca'
    if h == 'tat': return 'precioTat'
    if h in ('saldo', 'existencia', 'existencias', 'stock'): return 'stock'
    return None

def parse_xlsx(data: bytes):
    wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    ws = wb[wb.sheetnames[0]]
    rows = list(ws.iter_rows(values_only=True))
    hi = next((i for i, r in enumerate(rows) if any(norm(c) == 'referencia' for c in r)), None)
    if hi is None:
        raise RuntimeError('No encontré la columna REFERENCIA en el archivo')
    colmap = {}
    for ci, c in enumerate(rows[hi]):
        f = campo(c)
        if f and f not in colmap.values():
            colmap[ci] = f
    filas = []
    for r in rows[hi + 1:]:
        d = {}
        for ci, f in colmap.items():
            if ci < len(r): d[f] = r[ci]
        cod = str(d.get('codigo') or '').strip()
        if not cod: continue
        fila = {'codigo': cod}
        if d.get('nombre'): fila['nombre'] = str(d['nombre']).strip()
        if d.get('marca'): fila['marca'] = str(d['marca']).strip()
        try:
            if d.get('precioTat') not in (None, ''): fila['precioTat'] = float(d['precioTat'])
        except Exception: pass
        try:
            fila['stock'] = round(float(d.get('stock'))) if d.get('stock') not in (None, '') else 0
        except Exception:
            fila['stock'] = 0
        filas.append(fila)
    return filas

def adjunto_excel(msg):
    for part in msg.walk():
        if part.get_content_maintype() == 'multipart': continue
        fn = part.get_filename()
        if fn and fn.lower().endswith(('.xlsx', '.xls')):
            return part.get_payload(decode=True), fn
    return None, None

def main():
    user = os.environ['GMAIL_USER'].strip()
    pw = os.environ['GMAIL_APP_PASSWORD'].strip().replace(' ', '')
    api = os.environ['API_BASE'].rstrip('/')
    token = os.environ['IMPORT_TOKEN'].strip()
    regiones = [x.strip().upper() for x in os.environ.get('INV_REGIONES', 'QUINDIO,TOLIMA').split(',') if x.strip()]

    M = imaplib.IMAP4_SSL('imap.gmail.com')
    M.login(user, pw)
    M.select('INBOX')
    errores = 0
    for region in regiones:
        typ, data = M.search(None, 'SUBJECT', region)
        ids = data[0].split() if data and data[0] else []
        if not ids:
            print(f"[{region}] sin correos con '{region}' en el asunto. Salto."); continue
        latest = ids[-1]  # el más reciente
        typ, msgdata = M.fetch(latest, '(RFC822)')
        msg = email.message_from_bytes(msgdata[0][1])
        attach, fname = adjunto_excel(msg)
        if not attach:
            print(f"[{region}] el correo más reciente no trae adjunto Excel. Salto."); continue
        try:
            filas = parse_xlsx(attach)
        except Exception as e:
            print(f"[{region}] error leyendo {fname}: {e}"); errores += 1; continue
        if not filas:
            print(f"[{region}] {fname} sin filas válidas. Salto."); continue
        try:
            r = requests.post(f"{api}/importar/inventario-auto",
                              headers={'x-import-token': token, 'content-type': 'application/json'},
                              json={'region': region, 'archivo': fname, 'filas': filas}, timeout=180)
            if r.status_code in (200, 201):
                print(f"[{region}] OK ({fname}) -> {r.json()}")
            else:
                print(f"[{region}] FALLO {r.status_code}: {r.text[:300]}"); errores += 1
        except Exception as e:
            print(f"[{region}] error enviando: {e}"); errores += 1
    M.logout()
    if errores:
        raise SystemExit(f"{errores} región(es) con error")

if __name__ == '__main__':
    main()
