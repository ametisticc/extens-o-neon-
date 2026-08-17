// ============================================================
// Formatação segura de datas para o painel admin
// ============================================================
// Um `new Date(valor_inválido)` não lança na hora — mas o
// `.toLocaleDateString()`/`.toLocaleString()` subsequente lança
// `RangeError: Invalid time value`, que derruba a página inteira
// com "Application error" na Vercel. Estes helpers nunca lançam:
// se a data for inválida, retornam '—'.

function parseSafe(value) {
  if (value === null || value === undefined || value === '') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Data curta pt-BR (ex.: 16/08/2026) ou '—'. */
export function fmtDate(value) {
  const d = parseSafe(value);
  return d ? d.toLocaleDateString('pt-BR') : '—';
}

/** Data + hora pt-BR (ex.: 16/08/2026 14:30:00) ou '—'. */
export function fmtDateTime(value) {
  const d = parseSafe(value);
  return d ? d.toLocaleString('pt-BR') : '—';
}
