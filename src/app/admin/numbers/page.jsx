// ============================================================
// Painel de Números — /admin/numbers
// ============================================================
// Mostra os números cadastrados com:
//   - Cliente / Número / Plano / Status (online) / Maturação /
//     Vencimento / Última atividade / Dispositivos
//   - Ações: 🌡️ Iniciar maturação (só para números elegíveis) +
//     seleção em massa.
//
// Server Component: busca números + enriquece com sessões (online) e
// planos (maturação) via buildNumberMaturationRowsWithClient. A tabela
// interativa é renderizada pelo Client Component StartMaturation, que
// dispara POST /admin/numbers/action (a rota revalida no servidor e
// chama a função EXISTENTE startPlanWithClient).
//
// Nenhuma lógica de maturação, extensão ou pareamento foi alterada.
import { readAdminSession } from '@/lib/admin.js';
import { tryGetSupabaseAdmin, DB } from '@/lib/supabase.js';
import { buildNumberMaturationRowsWithClient } from '@/lib/maturation-eligibility.js';
import { fmtDateTime } from '@/lib/fmt.js';
import { AdminSetupWarning } from '@/components/AdminSetupWarning.jsx';
import StartMaturation from './StartMaturation.jsx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AdminNumbersPage() {
  const session = await readAdminSession();
  if (!session) return null; // layout renderiza o login

  const supabase = tryGetSupabaseAdmin();
  let numbers = null;
  let fetchError = null;
  let enriched = null;
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from(DB.NUMBERS)
        .select('*, neon_warm_users(email, name), neon_warm_devices(id, device_id, last_seen_at, status)')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) {
        fetchError = `Falha ao carregar números: ${error.message} (${error.code ?? 'sem código'})`;
      } else {
        numbers = data;
      }
    } catch (err) {
      console.error('[admin] exceção ao carregar números:', err);
      fetchError = `Erro inesperado ao carregar dados: ${err.message}`;
    }
  }

  // Enriquece com sessão online + plano de maturação + elegibilidade.
  if (numbers && !fetchError) {
    const res = await buildNumberMaturationRowsWithClient(supabase, numbers);
    if (res.ok) {
      enriched = res.rows;
    } else {
      fetchError = `Falha ao avaliar maturação: ${res.error ?? 'erro desconhecido'}`;
    }
  }

  // Formata "última atividade" para exibição (usa last_heartbeat_at ou last_seen_at).
  const rows = (enriched || []).map((r) => ({
    ...r,
    last_activity: r.last_heartbeat_at
      ? fmtDateTime(r.last_heartbeat_at)
      : r.last_seen_at
        ? fmtDateTime(r.last_seen_at)
        : '—',
  }));

  return (
    <>
      <h1 className="page-title">Números</h1>
      <p className="page-subtitle">
        Números de WhatsApp cadastrados no Neon Warm. O botão <strong>🌡️ Iniciar</strong> fica
        disponível apenas para números <strong>online e ativos</strong> — ele dispara o mesmo fluxo
        de maturação já existente (nada muda na extensão).
      </p>

      <AdminSetupWarning />

      {fetchError && (
        <div className="alert alert-error" style={{ fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          <strong>Erro ao carregar o painel:</strong> {fetchError}
        </div>
      )}

      <div className="card">
        {rows.length > 0 ? (
          <StartMaturation rows={rows} />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Número</th>
                  <th>Status</th>
                  <th>Maturação</th>
                  <th>Última atividade</th>
                  <th>Dispositivos</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={6} className="empty">Nenhum número cadastrado.</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
