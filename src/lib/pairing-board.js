// ============================================================
// Quadro de pareamento (painel admin)
// ============================================================
// Monta a visão "quem está online e para quem manda mensagem" que o
// operador vê no painel. Para cada número conectado mostra:
//   - phone            número (e normalizado)
//   - user             nome/e-mail do cliente (quando existir)
//   - online           se a sessão conta como online
//   - online_reason    motivo quando offline
//   - eligible         se está elegível para parear
//   - pair_status      status do par ativo (waiting/paired/confirmed) ou null
//   - pair_with        número do parceiro ATUAL (para quem envia) ou null
//   - last_heartbeat_at último heartbeat da sessão
//
// Fonte da verdade de "online": neon_warm_sessions (isSessionOnline).
// Fonte da verdade do "par atual": neon_warm_pairs (status em
// waiting/paired/confirmed). Uma query por status evita N consultas
// de findActivePair — o pareamento por chip já usa findActivePair;
// aqui preferimos ler o quadro inteiro em poucas queries.
//
// Não importa o supabase-js: recebe o client por injeção (testável).
import { isSessionOnline, presenceWindowMs } from './pairing-presence.js';

/**
 * Monta o quadro de pareamento.
 *
 * @param {object} client  Client Supabase (injetado).
 * @param {object} [params]
 * @param {number} [params.limit]  Máximo de sessões ativas a considerar.
 * @returns {Promise<{ ok: boolean, rows?: Array, stats?: object, error?: string, reason?: string }>}
 */
export async function buildPairingBoardWithClient(client, { limit = 200 } = {}) {
  const cutoff = new Date(Date.now() - presenceWindowMs()).toISOString();

  // ---- 1. Sessões ativas com heartbeat recente ----
  const { data: sessions, error } = await client
    .from('neon_warm_sessions')
    .select('id, user_id, phone_number_id, device_id, status, last_heartbeat_at, ended_at, started_at')
    .eq('status', 'active')
    .is('ended_at', null)
    .gte('last_heartbeat_at', cutoff)
    .order('last_heartbeat_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[board] erro ao buscar sessões ativas:', error.message);
    return { ok: false, reason: 'internal_error', error: error.message };
  }

  // ---- 2. Uma sessão por número (a mais recente) ----
  const sessionByNumberId = new Map();
  for (const session of sessions || []) {
    if (!session.phone_number_id) continue;
    const existing = sessionByNumberId.get(session.phone_number_id);
    if (!existing || new Date(session.last_heartbeat_at) > new Date(existing.last_heartbeat_at)) {
      sessionByNumberId.set(session.phone_number_id, session);
    }
  }

  const numberIds = [...sessionByNumberId.keys()];

  // ---- 3. Números vinculados ----
  const numberById = new Map();
  if (numberIds.length > 0) {
    const { data: numRows, error: numErr } = await client
      .from('neon_warm_numbers')
      .select('id, phone_number_normalized, phone_number, status, pairing_enabled')
      .in('id', numberIds);
    if (numErr) {
      console.error('[board] erro ao buscar números:', numErr.message);
      return { ok: false, reason: 'internal_error', error: numErr.message };
    }
    for (const n of numRows || []) numberById.set(n.id, n);
  }

  // ---- 4. Usuários (nome/e-mail) — opcional, para enriquecer a tabela ----
  const userIds = [...new Set([...sessionByNumberId.values()].map((s) => s.user_id).filter(Boolean))];
  const userById = new Map();
  if (userIds.length > 0) {
    const { data: userRows } = await client
      .from('neon_warm_users')
      .select('id, name, email')
      .in('id', userIds);
    for (const u of userRows || []) userById.set(u.id, u);
  }

  // ---- 5. Pares ativos (uma query por status, evita N consultas) ----
  const activePairs = [];
  if (numberIds.length > 0) {
    const { data: pairRows } = await client
      .from('neon_warm_pairs')
      .select('*')
      .in('status', ['waiting', 'paired', 'confirmed']);
    activePairs.push(...(pairRows || []));
  }

  // ---- 6. Monta as linhas ----
  const rows = [];
  for (const [numberId, session] of sessionByNumberId) {
    const number = numberById.get(numberId);
    if (!number) continue;

    const online = isSessionOnline(session);
    const eligible =
      online.online === true &&
      number.status === 'active' &&
      number.pairing_enabled !== false; // null → elegível (backward compat)

    const phone = number.phone_number_normalized;
    const pair = activePairs.find(
      (p) => p.chip_a === phone || p.chip_b === phone
    );
    const other = pair ? (pair.chip_a === phone ? pair.chip_b : pair.chip_a) : null;

    const user = userById.get(session.user_id);

    rows.push({
      phone: number.phone_number || phone,
      phone_normalized: phone,
      user: user?.name || user?.email || null,
      online: online.online,
      online_reason: online.reason,
      eligible,
      ineligible_reason: eligible
        ? null
        : online.reason || (number.status !== 'active' ? 'number_not_active' : 'pairing_disabled'),
      pair_status: pair?.status ?? null,
      pair_with: other,
      last_heartbeat_at: session.last_heartbeat_at,
    });
  }

  // ---- 7. Ordena: online primeiro, pareados antes de aguardando ----
  rows.sort((a, b) => {
    if (a.online !== b.online) return a.online ? -1 : 1;
    if (Boolean(a.pair_with) !== Boolean(b.pair_with)) return a.pair_with ? -1 : 1;
    return new Date(a.last_heartbeat_at) - new Date(b.last_heartbeat_at);
  });

  const onlineRows = rows.filter((r) => r.online);
  // Conjunto de números online, para saber se o parceiro do par também está online.
  const onlinePhones = new Set(rows.filter((r) => r.online).map((r) => r.phone_normalized));
  for (const r of rows) {
    if (r.pair_with) r.pair_with_online = onlinePhones.has(r.pair_with);
    else r.pair_with_online = null;
  }

  return {
    ok: true,
    rows,
    generated_at: new Date().toISOString(),
    stats: {
      online: onlineRows.length,
      paired: onlineRows.filter((r) => r.pair_with).length,
      waiting: onlineRows.filter((r) => !r.pair_with).length,
    },
  };
}
