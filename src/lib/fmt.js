// ============================================================
// Formatação segura de datas para o painel admin
// ============================================================
// Um `new Date(valor_inválido)` não lança na hora — mas o
// `.toLocaleDateString()`/`.toLocaleString()` subsequente lança
// `RangeError: Invalid time value`, que derruba a página inteira
// com "Application error" na Vercel. Estes helpers nunca lançam:
// se a data for inválida, retornam '—'.
//
// FUSO HORÁRIO: o servidor da Vercel roda em UTC. Se usarmos
// `toLocaleString('pt-BR')` sem timeZone, a data aparece em UTC —
// 3h à frente do horário real para quem está em America/Sao_Paulo.
// Fixamos o fuso do operador (Brasil) para o painel mostrar o
// horário local correto.

const TZ = 'America/Sao_Paulo';

function parseSafe(value) {
  if (value === null || value === undefined || value === '') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Data curta pt-BR no fuso de São Paulo (ex.: 16/08/2026) ou '—'. */
export function fmtDate(value) {
  const d = parseSafe(value);
  return d ? d.toLocaleDateString('pt-BR', { timeZone: TZ }) : '—';
}

/** Data + hora pt-BR no fuso de São Paulo (ex.: 16/08/2026 21:34:43) ou '—'. */
export function fmtDateTime(value) {
  const d = parseSafe(value);
  return d ? d.toLocaleString('pt-BR', { timeZone: TZ }) : '—';
}
