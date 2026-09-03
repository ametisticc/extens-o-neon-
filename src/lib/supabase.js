// ============================================================
// Cliente Supabase (somente servidor — service role key)
// ============================================================
import { createClient } from '@supabase/supabase-js';

function assertEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente ausente: ${name}`);
  }
  return value;
}

let cachedClient = null;

/**
 * Retorna o client Supabase com a service_role key.
 * Só pode ser importado em código de servidor (API Routes, scripts).
 * Nunca importe este módulo a partir de componentes de cliente.
 */
export function getSupabaseAdmin() {
  if (cachedClient) return cachedClient;

  const url = assertEnv('SUPABASE_URL');
  const serviceRoleKey = assertEnv('SUPABASE_SERVICE_ROLE_KEY');

  cachedClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return cachedClient;
}

/**
 * Retorna o client Supabase OU null se as variáveis não estiverem
 * configuradas. Usado pelo painel admin para não quebrar a página.
 */
export function tryGetSupabaseAdmin() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  try {
    return getSupabaseAdmin();
  } catch (err) {
    console.error('[supabase] env inválida, painel fail-safe:', err.message);
    return null;
  }
}

export const DB = {
  USERS: 'neon_warm_users',
  PLANS: 'neon_warm_plans',
  SUBSCRIPTIONS: 'neon_warm_subscriptions',
  NUMBERS: 'neon_warm_numbers',
  LICENSES: 'neon_warm_licenses',
  DEVICES: 'neon_warm_devices',
  SESSIONS: 'neon_warm_sessions',
  LOGS: 'neon_warm_logs',
  EXTENSION_KEYS: 'neon_warm_extension_keys',
  BEARER_TOKENS: 'neon_warm_bearer_tokens',
  PAIRS: 'neon_warm_pairs',
  MESSAGES: 'neon_warm_messages',
  MATURATION_SCHEDULES: 'neon_warm_maturation_schedules',
  AUTO_PAUSE_EVENTS: 'neon_warm_auto_pause_events',
};
