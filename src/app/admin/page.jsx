import { readAdminSession } from '@/lib/admin.js';
import { isAdminConfigured } from '@/lib/admin-config.js';
import { tryGetSupabaseAdmin, DB } from '@/lib/supabase.js';
import { fmtDateTime, fmtDate } from '@/lib/fmt.js';
import { AdminSetupWarning } from '@/components/AdminSetupWarning.jsx';
import Link from 'next/link';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Helper para contar registros sem trazer todos.
async function countRows(table, filters = {}) {
  const supabase = tryGetSupabaseAdmin();
  if (!supabase) return 0;
  let query = supabase.from(table).select('id', { count: 'exact', head: true });
  for (const [key, value] of Object.entries(filters)) {
    query = query.eq(key, value);
  }
  const { count, error } = await query;
  if (error) {
    console.error(`[admin] erro ao contar ${table}:`, error.message);
    return 0;
  }
  return count ?? 0;
}

/* ------------------------- ícones (inline) ------------------------- */
const ICONS = {
  check: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ),
  ban: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="m4.9 4.9 14.2 14.2" />
    </svg>
  ),
  key: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7.5" cy="15.5" r="5.5" />
      <path d="m21 2-9.6 9.6" />
      <path d="m15.5 7.5 3 3L22 7l-3-3" />
    </svg>
  ),
  clock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  ),
  bolt: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
    </svg>
  ),
  sparkle: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />
    </svg>
  ),
  bell: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  user: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
    </svg>
  ),
  arrowUp: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  ),
  arrowDown: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M19 12l-7 7-7-7" />
    </svg>
  ),
  activity: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  ),
  phone: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  ),
};

/* --------------------------- métricas --------------------------- */
// Cada métrica tem: label, valor, cor do ícone, texto complementar e
// ícone. Os dados são SEMPRE reais (countRows sobre as tabelas).
function buildStats({
  numbersActive,
  numbersBlocked,
  licensesActive,
  licensesExpired,
  sessionsActive,
  totalValidations,
}) {
  return [
    {
      label: 'Números autorizados',
      value: numbersActive,
      icon: 'check',
      tone: 'green',
      complement: 'chips liberados para parear',
    },
    {
      label: 'Números bloqueados',
      value: numbersBlocked,
      icon: 'ban',
      tone: 'red',
      complement: numbersBlocked > 0 ? 'exigem revisão manual' : 'nenhum bloqueio ativo',
    },
    {
      label: 'Licenças ativas',
      value: licensesActive,
      icon: 'key',
      tone: 'green',
      complement: 'clientes com acesso liberado',
    },
    {
      label: 'Licenças expiradas',
      value: licensesExpired,
      icon: 'clock',
      tone: 'orange',
      complement: licensesExpired > 0 ? 'aguardando renovação' : 'nenhuma vencida',
    },
    {
      label: 'Sessões ativas',
      value: sessionsActive,
      icon: 'bolt',
      tone: 'blue',
      complement: 'extensões conectadas agora',
    },
    {
      label: 'Validações (total)',
      value: totalValidations,
      icon: 'sparkle',
      tone: 'purple',
      complement: 'licenças verificadas no servidor',
    },
  ];
}

/* ------------------------- formatação ------------------------- */
function formatDateBR() {
  try {
    const d = new Date();
    return d.toLocaleDateString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

// Máscara de telefone: +55 (11) 95555-5566
function fmtPhone(raw) {
  if (!raw) return '—';
  const d = String(raw).replace(/\D/g, '');
  if (d.length === 13) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  return String(raw);
}

// Classificação da validação mais recente → indicador de evolução
function growthLabel(series) {
  if (!series || series.length < 2) {
    return {
      text: 'Histórico começando — novos dados a cada validação',
      className: 'neutral',
    };
  }
  const first = series[0]?.ok ? 1 : 0;
  const last = series[series.length - 1]?.ok ? 1 : 0;
  if (last > first) return { text: 'Tendência positiva', className: '', icon: 'up' };
  if (last < first) return { text: 'Queda nas autorizações', className: 'down', icon: 'down' };
  return { text: 'Estável nas últimas validações', className: 'neutral', icon: 'flat' };
}

/* ---------------------------- Login ---------------------------- */
async function LoginPage({ searchParams }) {
  const params = await searchParams;
  const error = params?.error;
  const configured = isAdminConfigured();

  return (
    <div className="login-card">
      <h1>
        <span className="login-brand">{ICONS.sparkle}</span>
        Painel Neon Warm
      </h1>
      <p className="muted">Acesso restrito ao operador.</p>

      {error === 'invalid' && <div className="alert alert-error">Credenciais inválidas.</div>}

      {!configured && (
        <div className="alert alert-error" style={{ fontSize: 13 }}>
          Painel não configurado. Adicione <strong>NEON_WARM_ADMIN_EMAIL</strong>,{' '}
          <strong>NEON_WARM_ADMIN_PASSWORD</strong> e <strong>NEON_WARM_ADMIN_SECRET</strong> nas
          variáveis de ambiente do Vercel e faça um novo deploy.
        </div>
      )}

      {configured && <AdminSetupWarning />}

      <form action="/admin/login" method="post" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input type="email" name="email" placeholder="E-mail" required autoComplete="username" />
        <input type="password" name="password" placeholder="Senha" required autoComplete="current-password" />
        <button type="submit" className="btn">Entrar</button>
      </form>
    </div>
  );
}

/* --------------------------- Dashboard --------------------------- */
export default async function AdminPage({ searchParams }) {
  const session = await readAdminSession();
  if (!session) return <LoginPage searchParams={searchParams} />;

  // Todas as consultas REAIS preservadas (mesma fonte do dashboard atual).
  const [
    numbersActive,
    numbersBlocked,
    licensesActive,
    licensesExpired,
    sessionsActive,
    totalValidations,
  ] = await Promise.all([
    countRows(DB.NUMBERS, { status: 'active' }),
    countRows(DB.NUMBERS, { status: 'blocked' }),
    countRows(DB.LICENSES, { status: 'active' }),
    countRows(DB.LICENSES, { status: 'expired' }),
    countRows(DB.SESSIONS, { status: 'active' }),
    countRows(DB.LOGS),
  ]);

  // Últimas validações (mesma query do dashboard atual).
  const supabase = tryGetSupabaseAdmin();
  let lastLogs = null;
  if (supabase) {
    const res = await supabase
      .from(DB.LOGS)
      .select('id, event_type, metadata, created_at, phone_number_id')
      .in('event_type', ['validation_success', 'validation_failed'])
      .order('created_at', { ascending: false })
      .limit(10);
    lastLogs = res.data;
  }

  const logs = Array.isArray(lastLogs) ? lastLogs : [];
  const stats = buildStats({
    numbersActive,
    numbersBlocked,
    licensesActive,
    licensesExpired,
    sessionsActive,
    totalValidations,
  });

  // Evolução real das validações (derivada dos MESMOS logs já buscados —
  // sem query nova, sem inventar dados). Ordem cronológica.
  const series = [...logs].reverse().map((log) => ({
    ok: log.event_type === 'validation_success',
    date: log.created_at,
  }));

  const okCount = logs.filter((l) => l.event_type === 'validation_success').length;
  const deniedCount = logs.filter((l) => l.event_type === 'validation_failed').length;
  const growth = growthLabel(series);

  // Ações rápidas — APENAS rotas reais existentes.
  const quickActions = [
    { href: '/admin/numbers', label: 'Números', desc: 'Ver e gerenciar chips', icon: 'phone' },
    { href: '/admin/licenses', label: 'Licenças', desc: 'Criar ou revogar acesso', icon: 'key' },
    { href: '/admin/plans', label: 'Planos', desc: 'Limite e ciclo por número', icon: 'activity' },
    { href: '/admin/pairing', label: 'Pareamento', desc: 'Quem está online agora', icon: 'bolt' },
  ];

  const today = formatDateBR();

  return (
    <>
      {/* Header da página */}
      <div className="admin-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Visão geral do Neon Warm</p>
        </div>
        <div className="header-right">
          <span className="header-date">{today}</span>
          <button type="button" className="icon-btn" aria-label="Notificações" title="Notificações">
            {ICONS.bell}
            <span className="dot" />
          </button>
        </div>
      </div>

      <AdminSetupWarning />

      {/* Métricas */}
      <div className="dashboard-stats">
        {stats.map((s) => (
          <div className="stat-card" key={s.label}>
            <span className={`stat-icon ${s.tone}`}>{ICONS[s.icon]}</span>
            <span className="label">{s.label}</span>
            <div className={`value ${s.tone === 'green' ? 'success' : s.tone === 'red' ? 'danger' : s.tone === 'orange' ? 'warning' : s.tone === 'purple' ? 'primary' : ''}`}>
              {s.value}
            </div>
            <div className="stat-complement">{s.complement}</div>
          </div>
        ))}
      </div>

      {/* Validações — card principal com evolução REAL */}
      <div className="card">
        <div className="validation-card">
          <div className="validation-info">
            <div className="label">Validações (total)</div>
            <div className="value">{totalValidations}</div>
            <p className="validation-text">
              Licenças verificadas no servidor. Nas últimas validações,{' '}
              <strong style={{ color: 'var(--success)' }}>{okCount} autorizada(s)</strong> e{' '}
              <strong style={{ color: 'var(--danger)' }}>{deniedCount} negada(s)</strong>.
            </p>
            <span className={`validation-growth ${growth.className}`}>
              {growth.icon === 'up' ? ICONS.arrowUp : growth.icon === 'down' ? ICONS.arrowDown : ICONS.activity}
              {growth.text}
            </span>
          </div>

          <div className="validation-chart">
            <div className="chart-title">
              <span>Últimas validações</span>
              <span>{logs.length > 0 ? fmtDate(logs[0]?.created_at) : 'sem dados'}</span>
            </div>
            {series.length > 0 ? (
              <>
                <div className="sparkline">
                  {series.map((bar, i) => (
                    <div
                      key={i}
                      className={`spark-bar ${bar.ok ? 'ok' : 'denied'}`}
                      style={{ height: `${Math.max(14, bar.ok ? 62 : 30)}%` }}
                      title={bar.ok ? `Autorizada · ${fmtDateTime(bar.date)}` : `Negada · ${fmtDateTime(bar.date)}`}
                    />
                  ))}
                </div>
                <div className="chart-legend">
                  <span><i className="lg-ok" /> Autorizada</span>
                  <span><i className="lg-denied" /> Negada</span>
                </div>
              </>
            ) : (
              <div className="empty">Nenhuma validação registrada ainda. O gráfico aparece com os primeiros dados reais.</div>
            )}
          </div>
        </div>
      </div>

      {/* Ações rápidas */}
      <h2 className="page-title" style={{ fontSize: 17, marginBottom: 12 }}>Ações rápidas</h2>
      <div className="quick-actions" style={{ marginBottom: 24 }}>
        {quickActions.map((qa) => (
          <Link key={qa.href} href={qa.href} className="qa-card">
            <span className="qa-icon">{ICONS[qa.icon]}</span>
            <span className="qa-meta">
              <strong>{qa.label}</strong>
              <span>{qa.desc}</span>
            </span>
          </Link>
        ))}
      </div>

      {/* Últimas validações */}
      <div className="card">
        <div className="card-head">
          <h2>Últimas validações</h2>
          <Link href="/admin/logs" className="card-link">
            Ver todos os logs
          </Link>
        </div>
        {logs.length > 0 ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Evento</th>
                  <th>Número</th>
                  <th>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td>{fmtDateTime(log.created_at)}</td>
                    <td>
                      <span className={`badge ${log.event_type === 'validation_success' ? 'success' : 'blocked'}`}>
                        {log.event_type === 'validation_success' ? 'Autorizado' : 'Negado'}
                      </span>
                    </td>
                    <td className="mono">{fmtPhone(log.metadata?.phone_number)}</td>
                    <td>{log.metadata?.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">Nenhuma validação registrada ainda.</div>
        )}
      </div>
    </>
  );
}
