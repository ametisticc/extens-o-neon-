#!/usr/bin/env node
// ============================================================
// Script de seed — executa o supabase/seed.sql contra o banco real.
//
// Requer .env.local com SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.
//
// Uso:  npm run db:seed
// ============================================================
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Carrega .env.local
const envPath = path.join(__dirname, '..', '.env.local');
if (existsSync(envPath)) {
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

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('❌ Faltam SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY no .env.local');
  process.exit(1);
}

const sql = readFileSync(path.join(__dirname, '..', 'supabase', 'seed.sql'), 'utf8');

console.log('Executando seed.sql via service role...');
console.log('ATENÇÃO: este script usa a REST API. Para SQL complexo (CTEs, inserts condicionais),');
console.log('prefira executar o seed.sql direto no SQL Editor do Supabase.\n');

const supabase = createClient(url, key);

// Extrai comandos INSERT simples do seed para executar via REST.
// Para o seed completo, use o SQL Editor.
async function run() {
  // 1. Plano
  const { data: plan } = await supabase.from('neon_warm_plans').select('id').eq('name', 'Neon Warm Pro').maybeSingle();
  if (!plan) {
    const { data: newPlan } = await supabase.from('neon_warm_plans').insert({
      name: 'Neon Warm Pro', description: 'Plano pago com acesso ao Neon Warm', price: 49.9, active: true, neon_warm_enabled: true, max_numbers: 5, max_devices: 2,
    }).select('id').maybeSingle();
    console.log('✅ Plano "Neon Warm Pro" criado:', newPlan?.id);
  } else {
    console.log('ℹ️  Plano "Neon Warm Pro" já existe:', plan.id);
  }

  // 2. Usuário
  const { data: user } = await supabase.from('neon_warm_users').select('id').eq('email', 'teste@neonwarm.com').maybeSingle();
  if (!user) {
    const { data: newUser } = await supabase.from('neon_warm_users').insert({
      id: '00000000-0000-0000-0000-000000000001', email: 'teste@neonwarm.com', name: 'Cliente Teste', status: 'active',
    }).select('id').maybeSingle();
    console.log('✅ Usuário de teste criado:', newUser?.id);
  } else {
    console.log('ℹ️  Usuário de teste já existe:', user.id);
  }

  console.log('\n⚠️  Para o restante (assinatura, número, licença), execute supabase/seed.sql no SQL Editor.');
  console.log('   Ou aplique manualmente via painel.');
}

run().catch((err) => {
  console.error('Erro no seed:', err);
  process.exit(1);
});
