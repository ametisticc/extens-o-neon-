import { isAdminConfigured, isSupabaseConfigured } from '@/lib/admin-config.js';

/** Aviso amigável quando o painel não está totalmente configurado. */
export function AdminSetupWarning() {
  const adminOk = isAdminConfigured();
  const supabaseOk = isSupabaseConfigured();

  if (adminOk && supabaseOk) return null;

  const missing = [];
  if (!adminOk) {
    missing.push('NEON_WARM_ADMIN_EMAIL', 'NEON_WARM_ADMIN_PASSWORD', 'NEON_WARM_ADMIN_SECRET');
  }
  if (!supabaseOk) {
    missing.push('SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY');
  }

  return (
    <div className="alert alert-error" style={{ fontSize: 13 }}>
      <strong>Painel incompleto.</strong> Faltam variáveis de ambiente:{' '}
      <strong>{missing.join(', ')}</strong>. Adicione no Vercel (Settings → Environment
      Variables), marque <strong>Production</strong> e faça um novo deploy.
    </div>
  );
}
