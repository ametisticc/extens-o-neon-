// ============================================================
// Wrapper do serviço de validação Neon Warm
// ============================================================
// Importa o client Supabase real (service role) e delega a lógica
// pura para validation-core.js (que é testável sem banco).
import { getSupabaseAdmin } from './supabase.js';
import { validateWithClient, REASONS } from './validation-core.js';

export { validateWithClient, REASONS };

/**
 * Valida se um número está autorizado a usar o Neon Warm,
 * usando o client Supabase padrão (service role).
 *
 * @param {{ phoneNumber: string, extensionId: string, deviceId: string, license?: object }} params
 * @returns {Promise<ValidationResult>}
 */
export async function validateNeonWarmAccess(params) {
  return validateWithClient(getSupabaseAdmin(), params);
}
