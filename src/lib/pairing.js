// ============================================================
// Gerenciador de pareamento entre chips (maturação real)
// ============================================================
// Quando o chip A (número conectado na extensão) chama /pair, o
// servidor encontra outro chip B que também está com a extensão
// conectada e devolve B para A. Os dois então trocam mensagens
// entre si — maturação real entre chips da própria rede.
//
// "Conectado" é definido por uma SESSÃO ativa recente
// (neon_warm_sessions) — ver pairing-presence.js (isSessionOnline).
//
// Este módulo é o wrapper com o client Supabase real (service role).
// A lógica pura (testável) fica em pairing-core.js.
import { getSupabaseAdmin } from './supabase.js';
import {
  findOrCreatePairWithClient,
  confirmPairWithClient,
  releasePairWithClient,
  getActivePairWithClient,
  findEligibleSessionsWithClient,
  PAIR_TTL_MS,
} from './pairing-core.js';

export { PAIR_TTL_MS };

export async function findOrCreatePair(params) {
  return findOrCreatePairWithClient(getSupabaseAdmin(), params);
}

export async function confirmPair(params) {
  return confirmPairWithClient(getSupabaseAdmin(), params);
}

export async function releasePair(params) {
  return releasePairWithClient(getSupabaseAdmin(), params);
}

export async function getActivePair(params) {
  return getActivePairWithClient(getSupabaseAdmin(), params);
}

export async function findEligibleSessions(params) {
  return findEligibleSessionsWithClient(getSupabaseAdmin(), params);
}
