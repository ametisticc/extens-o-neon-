// ============================================================
// Configuração do painel administrativo (fail-safe)
// ============================================================
// Estas funções NUNCA lançam exceção por env ausente. Em vez disso,
// retornam false/null para que o painel mostre um aviso amigável em
// vez de derrubar a aplicação inteira (Application error na Vercel).

/** Retorna true se as variáveis do admin estão configuradas. */
export function isAdminConfigured() {
  return Boolean(
    process.env.NEON_WARM_ADMIN_EMAIL &&
    process.env.NEON_WARM_ADMIN_PASSWORD &&
    process.env.NEON_WARM_ADMIN_SECRET
  );
}

/** Retorna true se as variáveis do Supabase (service role) estão configuradas. */
export function isSupabaseConfigured() {
  return Boolean(
    process.env.SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}
