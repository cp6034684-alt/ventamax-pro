export const fmtMoneda = (n: number | string | null | undefined) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
    .format(Number(n ?? 0));

export const fmtFecha = (iso: string) =>
  new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

// Código visible del cliente: VMX-0001
export const fmtCodigo = (n: number | null | undefined) =>
  n == null ? '' : 'VMX-' + String(n).padStart(4, '0');

export const COLOR_ESTADO: Record<string, string> = {
  PENDIENTE: 'var(--orange)', ENTREGADA: 'var(--accent)',
  PAGADA: 'var(--green)', CREDITO: 'var(--purple)', ANULADA: 'var(--red)',
};
