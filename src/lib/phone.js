// ============================================================
// Normalização de números de telefone (padrão internacional E.164)
// ============================================================

/**
 * Remove tudo que não for dígito.
 */
export function digitsOnly(value) {
  return String(value ?? '').replace(/\D/g, '');
}

/**
 * Normaliza um número de telefone para E.164 (sem o "+").
 *
 * Regras:
 *  - Remove tudo que não for dígito.
 *  - Se já começa com o país (ex.: 55), mantém.
 *  - Se começa com "00" (prefixo internacional), descarta o "00".
 *  - Caso contrário assume DDI 55 (Brasil).
 *
 * Exemplos:
 *  "5511999999999"          -> "5511999999999"
 *  "+55 11 99999-9999"      -> "5511999999999"
 *  "(11) 99999-9999"        -> "5511999999999"
 *  "00115511999999999"      -> "5511999999999"
 *
 * @param {string} value
 * @returns {string|null} número normalizado ou null se inválido.
 */
export function normalizePhone(value) {
  const d = digitsOnly(value);

  if (d.length < 10) return null;

  let normalized;
  if (d.startsWith('00')) {
    // Prefixo internacional "00": descarta e reavalia (ex: "005511999999999" -> "5511999999999")
    normalized = d.slice(2);
  } else if (d.startsWith('55') && d.length >= 12) {
    // Já está em E.164 (DDI Brasil + DDD + número)
    normalized = d;
  } else if (d.startsWith('55') && d.length === 10) {
    // "5599999999" — DDI 55 + número local de 8 dígitos (fixo antigo)
    normalized = d;
  } else {
    // Assume DDI Brasil
    normalized = '55' + d;
  }

  // Validação grosseira de comprimento E.164 (até 15 dígitos, mínimo 8 após DDI).
  if (normalized.length < 10 || normalized.length > 15) return null;

  return normalized;
}

/**
 * Extrai o DDI do número normalizado.
 */
export function extractCountryCode(normalized) {
  const d = digitsOnly(normalized);
  if (d.startsWith('55')) return '55';
  // Fallback simples: 1-3 dígitos iniciais.
  if (d.length >= 3) return d.slice(0, 3);
  return d.slice(0, 1);
}
