import { readAdminSession } from '@/lib/admin.js';
import { getSupabaseAdmin, DB } from '@/lib/supabase.js';

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

  let query = getSupabaseAdmin()
    .from(DB.LOGS)
    .select('id, event_type, metadata, created_at, user_id, phone_number_id, device_id, neon_warm_users(email, name), neon_warm_numbers(phone_number)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (eventFilter) {
    query = query.eq('event_type', eventFilter);
  }

  const { data: logs } = await query;

  const eventOptions = Object.keys(EVENT_LABELS);

  return (
    <>
      <h1 className="page-title">Logs</h1>
      <p className="page-subtitle">Histórico de eventos do Neon Warm</p>

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
                    <td>{new Date(log.created_at).toLocaleString('pt-BR')}</td>
                    <td>{eventBadge(log.event_type)}</td>
                    <td className="mono">{log.neon_warm_numbers?.phone_number ?? '—'}</td>
                    <td>{log.neon_warm_users?.email ?? log.user_id?.slice(0, 8) ?? '—'}</td>
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
