import { readAdminSession } from '@/lib/admin.js';
import { tryGetSupabaseAdmin, DB } from '@/lib/supabase.js';
import { fmtDateTime } from '@/lib/fmt.js';
import { AdminSetupWarning } from '@/components/AdminSetupWarning.jsx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EVENT_LABELS = {
  validation_success: 'Validação OK',
  validation_failed: 'Validação negada',
  session_started: 'Sessão iniciada',
  session_ended: 'Sessão encerrada',
  heartbeat: 'Heartbeat',
  license_activated: 'Licença ativada',
  license_revoked: 'Licença revogada',
  subscription_expired: 'Assinatura expirada',
  number_blocked: 'Número bloqueado',
  device_blocked: 'Dispositivo bloqueado',
};

function eventBadge(eventType) {
  const classMap = {
    validation_success: 'success',
    validation_failed: 'blocked',
    session_started: 'success',
    session_ended: 'inactive',
    heartbeat: 'inactive',
    license_activated: 'success',
    license_revoked: 'blocked',
    subscription_expired: 'expired',
    number_blocked: 'blocked',
    device_blocked: 'blocked',
  };
  return <span className={`badge ${classMap[eventType] || 'inactive'}`}>{EVENT_LABELS[eventType] || eventType}</span>;
}

export default async function AdminLogsPage({ searchParams }) {
  const session = await readAdminSession();
  if (!session) return null;

  const params = await searchParams;
  const eventFilter = typeof params?.event === 'string' ? params.event : '';
  const limit = 200;

  const supabase = tryGetSupabaseAdmin();
  let logs = null;
  let fetchError = null;
  if (supabase) {
    try {
      // Busca sem embed (não depende das FKs de neon_warm_logs).
      // Sem isso o PostgREST falha com PGRST200 quando a FK ainda
      // não existe no banco (relação não encontrada no schema cache).
      let query = supabase
        .from(DB.LOGS)
        .select('id, event_type, metadata, created_at, user_id, phone_number_id, device_id')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (eventFilter) {
        query = query.eq('event_type', eventFilter);
      }

      const { data, error } = await query;
      if (error) {
        fetchError = `Falha ao carregar logs: ${error.message} (${error.code ?? 'sem código'})`;
      } else {
        logs = data;
      }
    } catch (err) {
      console.error('[admin] exceção ao carregar logs:', err);
      fetchError = `Erro inesperado ao carregar dados: ${err.message}`;
    }
  }

  // Lookup em lote de usuários e números para preencher a tabela.
  // Cada lookup é fail-safe: se falhar, mostra o id truncado.
  let usersById = {};
  let numbersById = {};
  if (supabase && logs && logs.length > 0) {
    const userIds = [...new Set(logs.map((l) => l.user_id).filter(Boolean))];
    const numberIds = [...new Set(logs.map((l) => l.phone_number_id).filter(Boolean))];

    try {
      if (userIds.length > 0) {
        const { data: users, error } = await supabase
          .from(DB.USERS)
          .select('id, email, name')
          .in('id', userIds);
        if (error) {
          console.error('[admin] erro ao buscar usuários dos logs:', error.message);
        } else if (users) {
          for (const u of users) usersById[u.id] = u;
        }
      }
    } catch (err) {
      console.error('[admin] exceção ao buscar usuários dos logs:', err.message);
    }

    try {
      if (numberIds.length > 0) {
        const { data: numbers, error } = await supabase
          .from(DB.NUMBERS)
          .select('id, phone_number')
          .in('id', numberIds);
        if (error) {
          console.error('[admin] erro ao buscar números dos logs:', error.message);
        } else if (numbers) {
          for (const n of numbers) numbersById[n.id] = n;
        }
      }
    } catch (err) {
      console.error('[admin] exceção ao buscar números dos logs:', err.message);
    }
  }

  const eventOptions = Object.keys(EVENT_LABELS);

  return (
    <>
      <h1 className="page-title">Logs</h1>
      <p className="page-subtitle">Histórico de eventos do Neon Warm</p>

      <AdminSetupWarning />

      {fetchError && (
        <div className="alert alert-error" style={{ fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          <strong>Erro ao carregar o painel:</strong> {fetchError}
        </div>
      )}

      <div className="card">
        <form method="get" className="form-row">
          <label htmlFor="event">Filtrar por evento:</label>
          <select id="event" name="event">
            <option value="">Todos</option>
            {eventOptions.map((e) => (
              <option key={e} value={e} selected={eventFilter === e}>
                {EVENT_LABELS[e]}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-sm">Filtrar</button>
          {eventFilter && (
            <a href="/admin/logs" className="btn btn-outline btn-sm">Limpar</a>
          )}
        </form>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Evento</th>
                <th>Número</th>
                <th>Usuário</th>
                <th>Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {logs && logs.length > 0 ? (
                logs.map((log) => (
                  <tr key={log.id}>
                    <td>{fmtDateTime(log.created_at)}</td>
                    <td>{eventBadge(log.event_type)}</td>
                    <td className="mono">{numbersById[log.phone_number_id]?.phone_number ?? '—'}</td>
                    <td>{usersById[log.user_id]?.email ?? usersById[log.user_id]?.name ?? log.user_id?.slice(0, 8) ?? '—'}</td>
                    <td className="muted">
                      {log.event_type === 'validation_failed' && log.metadata?.reason
                        ? `Motivo: ${log.metadata.reason}`
                        : log.event_type === 'validation_success'
                          ? `Plano: ${log.metadata?.plan ?? '—'}`
                          : log.metadata?.session_id
                            ? `Sessão: ${log.metadata.session_id.slice(0, 8)}…`
                            : '—'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="empty">Nenhum log encontrado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
