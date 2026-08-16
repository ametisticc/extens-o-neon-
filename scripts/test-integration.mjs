#!/usr/bin/env node
// ============================================================
// Teste de integração contra o Supabase REAL.
//
// Requer: .env.local com SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY,
// migration aplicada e seed.sql rodado.
//
// Uso:  npm run test:integration
// ============================================================
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizePhone } from '../src/lib/phone.js';
import { validateWithClient, REASONS } from '../src/lib/validation-core.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Carrega .env.local se existir
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnv();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('❌ Faltam SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY no .env.local');
  process.exit(1);
}

const supabase = createClient(url, key);

function log(name, passed, detail = '') {
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} ${name} ${detail ? '— ' + detail : ''}`);
}

async function run() {
  console.log('=== Teste de integração Neon Warm (Supabase real) ===\n');

  // 1. Normalização
  const normalized = normalizePhone('(11) 99999-9999');
  log('Normalização de telefone', normalized === '5511999999999', normalized);

  // 2. Consulta número
  const { data: number, error: numErr } = await supabase
    .from('neon_warm_numbers')
    .select('*')
    .eq('phone_number_normalized', '5511999999999')
    .maybeSingle();
  log('Número de teste encontrado', !numErr && !!number, number?.phone_number);

  if (numErr) {
    console.log('\n→ Certifique-se de ter aplicado a migration e rodado o seed.sql.');
    process.exit(1);
  }

  // 3. Validação completa (espera authorized=true se seed aplicado)
  const result = await validateWithClient(supabase, {
    phoneNumber: '5511999999999',
    extensionId: 'neon-warm-extension',
    deviceId: 'integration-device-001',
  });
  log('Validação (autorizada)', result.authorized === true, result.reason ?? result.message);
  log('Plano retornado', typeof result.plan === 'string', result.plan);
  log('Expiração retornada', !!result.expires_at);

  // 4. Validação de número inexistente
  const missing = await validateWithClient(supabase, {
    phoneNumber: '5511888888888',
    extensionId: 'neon-warm-extension',
    deviceId: 'integration-device-001',
  });
  log('Validação de número não cadastrado', missing.authorized === false && missing.reason === REASONS.NUMBER_NOT_FOUND, missing.reason);

  // 5. Sessão (se o número estiver autorizado)
  if (result.authorized) {
    const { data: session } = await supabase
      .from('neon_warm_sessions')
      .insert({
        user_id: result.user.id,
        phone_number_id: result.number.id,
        device_id: result.device?.id ?? null,
        session_token_hash: `it_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        started_at: new Date().toISOString(),
        last_heartbeat_at: new Date().toISOString(),
        status: 'active',
      })
      .select('id, status')
      .maybeSingle();
    log('Criação de sessão (DB)', !!session, session?.id);

    if (session) {
      const { data: ended } = await supabase
        .from('neon_warm_sessions')
        .update({ status: 'ended', ended_at: new Date().toISOString() })
        .eq('id', session.id)
        .select('status')
        .maybeSingle();
      log('Encerramento de sessão (DB)', ended?.status === 'ended', ended?.status);
    }
  }

  console.log('\n=== Fim do teste de integração ===');
}

run().catch((err) => {
  console.error('Erro no teste de integração:', err);
  process.exit(1);
});
