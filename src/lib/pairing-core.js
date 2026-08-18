// ============================================================
// Núcleo do pareamento entre chips (sem dependências de infra)
// ============================================================
// Este módulo NÃO importa o supabase-js. Recebe o client Supabase
// por injeção (primeiro argumento de cada função), o que permite
// testes unitários com um mock em memória. O wrapper com o client
// real fica em pairing.js.
//
// FONTE DA VERDADE DE "ONLINE": neon_warm_sessions.
//   Uma sessão é elegível para pareamento quando isSessionOnline()
//   retorna true (status active + heartbeat recente + vinculada a
//   número). O backfill com neon_warm_pairs (chips que chamaram
//   /pair recentemente) é um reforço, NÃO a fonte primária.
//
// Segurança do pareamento:
//   - Nunca parear consigo mesmo (mesmo phone, session_id ou device_id)
//   - Só parear sessões elegíveis (isSessionOnline)
//   - Só parear números ativos e licenciados (pairing_enabled = true)
//   - Cada lado recebe apenas o TELEFONE do outro (sem dados de cliente)
//
// Tabela: neon_warm_pairs (ver migration 00002).
//   status: waiting | paired | confirmed | ended
//   confirmed_a / confirmed_b: confirmação individual; 'confirmed'
//   só é atingido quando os DOIS confirmaram via /validate.
import { normalizePhone } from './phone.js';
import { isSessionOnline, presenceWindowMs, nowIso } from './pairing-presence.js';
import { getFlaggedPhonesWithClient } from './maturation-plans.js';

const PAIR_TTL_MS = 30 * 60 * 1000; // 30 min sem chamar /pair => par expira

function iso(msOffset) {
  return new Date(Date.now() + msOffset).toISOString();
}

/** Retorna o "outro lado" de um par. */
function otherSide(pair, chip) {
  if (pair.chip_a === chip) return pair.chip_b;
  if (pair.chip_b === chip) return pair.chip_a;
  return null;
}

/** Coluna last_seen_* referente a um chip. */
function seenColFor(pair, chip) {
  return pair.chip_a === chip ? 'last_seen_a' : 'last_seen_b';
}

/** Coluna confirmed_* referente a um chip. */
function confirmedColFor(pair, chip) {
  return pair.chip_a === chip ? 'confirmed_a' : 'confirmed_b';
}

/** Escolhe o "lado" de um par: chip_a se o chip for o menor, senão chip_b. */
function pickSide(chip, other) {
  const a = String(chip);
  const b = String(other);
  return a < b ? { chipA: a, chipB: b } : { chipA: b, chipB: a };
}

/**
 * Retorna os parceiros com quem o chip JÁ interagiu (pares terminados),
 * do mais recente para o mais antigo. Usado pela rotação para EVITAR
 * repetir parceiros: os primeiros da lista são os mais recentes.
 *
 * @param {object} client  Client Supabase (injetado).
 * @param {string} chip    Número normalizado do chip.
 * @param {number} [limit] Máximo de parceiros recentes a considerar.
 * @returns {Promise<string[]>} Lista de telefones normalizados.
 */
export async function recentPartnersWithClient(client, chip, limit = 10) {
  try {
    const normalized = normalizePhone(chip);
    if (!normalized) return [];
    const { data: rows, error } = await client
      .from('neon_warm_pairs')
      .select('chip_a, chip_b')
      .or(`chip_a.eq.${normalized},chip_b.eq.${normalized}`)
      .eq('status', 'ended')
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (error) {
      console.error('[pairing] erro ao buscar parceiros recentes:', error.message);
      return [];
    }
    return (rows || [])
      .map((p) => (p.chip_a === normalized ? p.chip_b : p.chip_a))
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Escolhe o candidato "menos usado recentemente" para a rotação.
 *
 * Garante que todos os chips interajam entre si (round-robin):
 *   1. Dá prioridade a quem NUNCA foi parceiro (não está em `recent`).
 *   2. Entre os já usados, escolhe o que está há MAIS TEMPO sem ser
 *      parceiro (último da lista de recentes).
 *   3. Fallback: o candidato que espera há mais tempo (heartbeat antigo).
 *
 * @param {Array<object>} candidates  Candidatos elegíveis (com `.phone`).
 * @param {string[]} recent           Parceiros recentes (mais recente primeiro).
 * @returns {object|null} Candidato escolhido.
 */
function pickLeastRecentPartner(candidates, recent) {
  if (!candidates.length) return null;
  // 1) Nunca foi parceiro → prioridade total (ordem de espera = heartbeat antigo).
  const fresh = candidates.filter((c) => !recent.includes(c.phone));
  if (fresh.length > 0) return fresh[0];
  // 2) Todos já foram parceiros → escolhe o que foi usado há mais tempo.
  //    A lista `recent` está do mais recente para o mais antigo; o último
  //    elemento que ainda é candidato é o menos recente.
  for (let i = recent.length - 1; i >= 0; i--) {
    const found = candidates.find((c) => c.phone === recent[i]);
    if (found) return found;
  }
  // 3) Fallback: o que espera há mais tempo.
  return candidates[0];
}

/**
 * Verifica se um número está ONLINE (tem sessão ativa + heartbeat recente).
 * Mesma regra do painel (isSessionOnline) — usada para não manter pares
 * com um parceiro que caiu offline.
 */
async function isChipOnlineWithClient(client, phone) {
  try {
    if (!phone) return false;
    const number = await loadNumberByPhone(client, phone);
    if (!number) return false;
    const session = await loadSessionForChip(client, {
      chip: phone,
      phoneNumberId: number.id,
      deviceId: null,
    });
    if (!session) return false;
    return isSessionOnline(session).online === true;
  } catch {
    return false;
  }
}

/**
 * Libera (marca como ended) pares que ficaram órfãos: um dos lados
 * não chama /pair há mais de PAIR_TTL_MS.
 */
async function expireStalePairs(client) {
  try {
    const cutoff = new Date(Date.now() - PAIR_TTL_MS).toISOString();
    await client
      .from('neon_warm_pairs')
      .update({ status: 'ended', updated_at: nowIso() })
      .in('status', ['waiting', 'paired', 'confirmed'])
      .or(`last_seen_a.lt.${cutoff},last_seen_b.lt.${cutoff}`);
  } catch (err) {
    console.error('[pairing] erro ao expirar pares antigos:', err.message);
  }
}

/**
 * Busca o par ativo existente de um chip (waiting/paired/confirmed).
 * @returns {Promise<{ ok: boolean, pair?: object|null, other?: string|null, reason?: string }>}
 */
async function findActivePair(client, chip) {
  const { data: rows, error } = await client
    .from('neon_warm_pairs')
    .select('*')
    .or(`chip_a.eq.${chip},chip_b.eq.${chip}`)
    .in('status', ['waiting', 'paired', 'confirmed']);

  if (error) {
    console.error('[pairing] erro ao buscar par ativo:', error.message);
    return { ok: false, reason: 'internal_error' };
  }
  if (!rows || rows.length === 0) return { ok: true, pair: null, other: null };

  const pair = rows.sort((x, y) => new Date(y.updated_at) - new Date(x.updated_at))[0];
  return { ok: true, pair, other: otherSide(pair, chip) };
}

/**
 * Cria um registro de par no banco. Se houver colisão de unique
 * (outro request criou o mesmo par), recupera o par existente.
 */
async function createPair(client, a, b, status, seenA = nowIso(), seenB = nowIso()) {
  const side = pickSide(a, b);
  try {
    const { data, error } = await client
      .from('neon_warm_pairs')
      .insert({ chip_a: side.chipA, chip_b: side.chipB, status, last_seen_a: seenA, last_seen_b: seenB })
      .select('*')
      .maybeSingle();

    if (error) {
      if (error.code === '23505') {
        const { data: existing } = await client
          .from('neon_warm_pairs')
          .select('*')
          .eq('chip_a', side.chipA)
          .eq('chip_b', side.chipB)
          .in('status', ['waiting', 'paired', 'confirmed'])
          .maybeSingle();
        if (existing) return { ok: true, pair: existing, other: otherSide(existing, a), created: false };
      }
      console.error('[pairing] erro ao criar par:', error.message);
      return { ok: false, reason: 'internal_error' };
    }

    return { ok: true, pair: data, other: otherSide(data, a), created: true };
  } catch (err) {
    console.error('[pairing] erro em createPair:', err.message);
    return { ok: false, reason: 'internal_error' };
  }
}

const NUMBER_COLS_WITH_PAIRING = 'id, phone_number_normalized, status, pairing_enabled';
const NUMBER_COLS_BASE = 'id, phone_number_normalized, status';

/** Normaliza o resultado de número, tratando pairing_enabled como true quando ausente. */
function normalizeNumberRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    phone_number_normalized: row.phone_number_normalized,
    status: row.status,
    pairing_enabled: row.pairing_enabled ?? true, // default true (backward compat)
  };
}

/**
 * Carrega o número (id, phone_number_normalized, status, pairing_enabled)
 * a partir do phone_number_id de uma sessão. Tolerante: se a coluna
 * pairing_enabled não existir (migration 00003 pendente), faz fallback.
 */
async function loadNumberById(client, id) {
  if (!id) return null;
  try {
    const { data, error } = await client
      .from('neon_warm_numbers')
      .select(NUMBER_COLS_WITH_PAIRING)
      .eq('id', id)
      .maybeSingle();
    if (error) {
      const { data: fallback, error: fbError } = await client
        .from('neon_warm_numbers')
        .select(NUMBER_COLS_BASE)
        .eq('id', id)
        .maybeSingle();
      return normalizeNumberRow(fbError ? null : fallback);
    }
    return normalizeNumberRow(data);
  } catch {
    return null;
  }
}

/**
 * Carrega o número a partir do telefone normalizado (E.164).
 */
async function loadNumberByPhone(client, normalized) {
  if (!normalized) return null;
  try {
    const { data, error } = await client
      .from('neon_warm_numbers')
      .select(NUMBER_COLS_WITH_PAIRING)
      .eq('phone_number_normalized', normalized)
      .maybeSingle();
    if (error) {
      const { data: fallback, error: fbError } = await client
        .from('neon_warm_numbers')
        .select(NUMBER_COLS_BASE)
        .eq('phone_number_normalized', normalized)
        .maybeSingle();
      return normalizeNumberRow(fbError ? null : fallback);
    }
    return normalizeNumberRow(data);
  } catch {
    return null;
  }
}

/**
 * Carrega a sessão atual do chip.
 *
 * Regras:
 *   - Se sessionId for informado, busca por id = sessionId.
 *   - Senão, filtra por phoneNumberId (id do número do chip) e deviceId.
 *   - Nunca retorna uma sessão de OUTRO número (evita parear com self
 *     usando uma sessão alheia como "sessão atual").
 *
 * @param {object} client  Client Supabase (injetado).
 * @param {object} params
 * @param {string} params.chip           Número normalizado (diagnóstico).
 * @param {string|null} [params.phoneNumberId]  id de neon_warm_numbers do chip.
 * @param {string|null} [params.sessionId]     sessão atual informada pela extensão.
 * @param {string|null} [params.deviceId]      device do chip.
 */
async function loadSessionForChip(client, { chip, phoneNumberId = null, sessionId = null, deviceId = null }) {
  try {
    const cols = 'id, user_id, phone_number_id, device_id, status, last_heartbeat_at, ended_at, started_at';
    let q = client.from('neon_warm_sessions').select(cols).eq('status', 'active').is('ended_at', null);

    if (sessionId) {
      q = q.eq('id', sessionId);
    } else {
      // Sem sessionId: só aceita sessão do MESMO número (por id ou device).
      if (phoneNumberId) q = q.eq('phone_number_id', phoneNumberId);
      else if (deviceId) q = q.eq('device_id', deviceId);
      else return null; // sem âncora → não sabe qual sessão é "a do chip"
    }

    q = q.order('last_heartbeat_at', { ascending: false }).limit(1);
    const { data } = await q.maybeSingle();
    if (data) {
      // Defesa: se veio sessionId mas pertence a outro número, ignora.
      if (sessionId && phoneNumberId && data.phone_number_id && data.phone_number_id !== phoneNumberId) {
        return null;
      }
      return data;
    }

    // Fallback: última sessão do número (qualquer status).
    if (phoneNumberId) {
      let q2 = client
        .from('neon_warm_sessions')
        .select(cols)
        .eq('phone_number_id', phoneNumberId);
      if (sessionId) q2 = q2.eq('id', sessionId);
      if (deviceId) q2 = q2.eq('device_id', deviceId);
      q2 = q2.order('last_heartbeat_at', { ascending: false }).limit(1);
      const { data: d2 } = await q2.maybeSingle();
      return d2 || null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Encontra as sessões elegíveis (online) para pareamento.
 * Retorna uma lista enriquecida com { session, number, online } para
 * cada sessão, SEM dados sensíveis (apenas telefone + flags técnicas).
 */
export async function findEligibleSessionsWithClient(client, { excludeChip = null, excludeSessionId = null, excludeDeviceId = null, limit = 20 } = {}) {
  try {
    const cutoff = new Date(Date.now() - presenceWindowMs()).toISOString();

    // Números marcados como banidos/restritos (WhatsApp baniu/restringiu a
    // conta). Eles NÃO podem ser escolhidos como parceiro de ninguém.
    const flaggedPhones = await getFlaggedPhonesWithClient(client);

    const { data: sessions, error } = await client
      .from('neon_warm_sessions')
      .select('id, user_id, phone_number_id, device_id, status, last_heartbeat_at, ended_at, started_at')
      .eq('status', 'active')
      .is('ended_at', null)
      .gte('last_heartbeat_at', cutoff)
      .order('last_heartbeat_at', { ascending: true }) // mais antigos primeiro
      .limit(limit);

    if (error) {
      console.error('[pairing] erro ao buscar sessões ativas:', error.message);
      return [];
    }

    const out = [];
    for (const session of sessions || []) {
      const online = isSessionOnline(session);
      const number = await loadNumberById(client, session.phone_number_id);
      if (!number) continue;

      const phone = number.phone_number_normalized;
      if (excludeChip && phone === excludeChip) continue;        // nunca self por número
      if (excludeSessionId && session.id === excludeSessionId) continue; // nunca self por sessão
      if (excludeDeviceId && session.device_id === excludeDeviceId) continue; // nunca self por device

      // Número penalizado (banido/restrito) → nunca candidato, mesmo
      // online. O operador precisa desmarcar no painel para liberar.
      const penalty = flaggedPhones.includes(phone) ? 'banido/restrito' : null;

      const eligible =
        online.online === true &&
        number.status === 'active' &&
        number.pairing_enabled !== false && // null → elegível (backward compat)
        !penalty;

      out.push({
        session,
        number,
        phone,
        online: online.online,
        online_reason: online.reason,
        eligible,
        ineligible_reason: eligible
          ? null
          : penalty || online.reason || (number.status !== 'active' ? 'number_not_active' : 'pairing_disabled'),
      });
    }

    // Mais antigos primeiro (quem espera há mais tempo tem prioridade).
    out.sort((a, b) => new Date(a.session.last_heartbeat_at) - new Date(b.session.last_heartbeat_at));
    return out;
  } catch (err) {
    console.error('[pairing] erro em findEligibleSessions:', err.message);
    return [];
  }
}

/**
 * Encontra (ou cria) o par de um chip.
 *
 * Estratégia de matching (por prioridade):
 *  1. Se o chip já tem par ativo, devolve ele. Se o par estava em
 *     'waiting' (o outro lado ainda não tinha chamado /pair), promove
 *     para 'paired'.
 *     - Com `rotate: true` (extensão troca de parceiro a cada ciclo),
 *       se o par atual já está CONFIRMADO (ambos os lados), o par é
 *       encerrado e o chip procura um parceiro novo (passo 3). Se o
 *       par ainda está em andamento (waiting/paired, ou confirmado só
 *       por um lado), mantém — não abandonamos um par no meio da troca.
 *  2. Se foi pedido um parceiro específico e ele está elegível e solto,
 *     cria o par direto em 'paired'.
 *  3. Senão, procura uma sessão elegível solta e cria par novo em
 *     'waiting', devolvendo o número dela.
 *     - Com `rotate: true`, evita re-parear com o ÚLTIMO parceiro se
 *       houver outra opção (distribui as trocas entre todas as contas
 *       online). Se só houver o último, ele é aceito (fallback).
 *  4. Senão, sem par disponível.
 *
 * @param {object} client  Client Supabase (injetado).
 * @param {object} params
 * @param {string} params.chip            Número do chip que pediu par.
 * @param {string} [params.preferredWith] Se vier, tenta parear com este número.
 * @param {string} [params.sessionId]     Sessão atual do chip (para excluir self).
 * @param {string} [params.deviceId]      Device do chip (para excluir self).
 * @param {boolean} [params.rotate]       true → encerra par confirmado e procura novo (a cada ciclo).
 * @returns {Promise<{ ok: boolean, pair?: object, other?: string|null, created?: boolean, reason?: string, diagnostics?: object }>}
 */
export async function findOrCreatePairWithClient(
  client,
  { chip, preferredWith = null, sessionId = null, deviceId = null, rotate = false }
) {
  const normalized = normalizePhone(chip);
  if (!normalized) return { ok: false, reason: 'invalid_phone' };

  // ---- Número do chip (para âncora da sessão atual e exclusão de self) ----
  const chipNumber = await loadNumberByPhone(client, normalized);
  const chipPhoneNumberId = chipNumber?.id ?? null;

  // ---- Sessão atual do chip ----
  const session = await loadSessionForChip(client, {
    chip: normalized,
    phoneNumberId: chipPhoneNumberId,
    sessionId,
    deviceId,
  });
  const currentOnline = session ? isSessionOnline(session) : { online: false, reason: 'no_session' };

  // ---- 1. Já tem par ativo? ----
  const active = await findActivePair(client, normalized);
  if (!active.ok) return { ok: false, reason: active.reason };
  if (active.pair && active.other) {
    const pair = active.pair;
    const partnerOnline = await isChipOnlineWithClient(client, active.other);

    // Se o parceiro NÃO está mais online, encerra o par e procura um
    // novo — não adianta manter um par com quem não está trocando.
    if (!partnerOnline) {
      await client
        .from('neon_warm_pairs')
        .update({ status: 'ended', updated_at: nowIso() })
        .eq('id', pair.id)
        .in('status', ['waiting', 'paired', 'confirmed']);
      // Cai para o passo 3 (procurar novo parceiro) com `active.other`
      // ainda disponível como "parceiro anterior" para a rotação.
    } else if (rotate && pair.status === 'confirmed' && pair.confirmed_a === true && pair.confirmed_b === true) {
      // Rotação a cada ciclo: se o par já foi confirmado por AMBOS os
      // lados, encerra e procura um parceiro novo (distribui as trocas
      // entre todas as contas online). Se ainda está em andamento
      // (waiting/paired, ou confirmado por apenas um lado), mantém —
      // não abandonamos um par no meio da troca.
      await client
        .from('neon_warm_pairs')
        .update({ status: 'ended', updated_at: nowIso() })
        .eq('id', pair.id)
        .in('status', ['waiting', 'paired', 'confirmed']);
    } else {
      const sideCol = seenColFor(pair, normalized);
      const updates = { [sideCol]: nowIso() };
      if (pair.status === 'waiting') updates.status = 'paired';
      const { data: refreshed } = await client
        .from('neon_warm_pairs')
        .update(updates)
        .eq('id', pair.id)
        .select('*')
        .maybeSingle();
      const refreshedPair = refreshed || pair;
      return {
        ok: true,
        pair: refreshedPair,
        other: active.other,
        created: false,
        diagnostics: { current_session: session ? { id: session.id, status: session.status, online: currentOnline.online, online_reason: currentOnline.reason } : null },
      };
    }
  }

  await expireStalePairs(client);

  // ---- 2. Parceiro específico pedido ----
  if (preferredWith) {
    const pWith = normalizePhone(preferredWith);
    if (pWith && pWith !== normalized) {
      const partnerActive = await findActivePair(client, pWith);
      if (partnerActive.ok && !partnerActive.pair) {
        const elig = await findEligibleSessionsWithClient(client, {
          excludeChip: normalized,
          excludeSessionId: sessionId,
          excludeDeviceId: deviceId,
        });
        const match = elig.find((e) => e.phone === pWith && e.eligible);
        if (match) return createPair(client, normalized, pWith, 'paired');
      }
    }
  }

  // ---- 3. Chip conectado solto (sessões elegíveis) ----
  const elig = await findEligibleSessionsWithClient(client, {
    excludeChip: normalized,
    excludeSessionId: sessionId,
    excludeDeviceId: deviceId,
  });
  let candidates = elig.filter((e) => e.eligible);

  // Exclui candidatos que JÁ estão em outro par ativo (waiting/paired/
  // confirmed) — evita que um número seja alvo de vários chips ao mesmo
  // tempo (bug que deixava 3 chips pareados com o MESMO parceiro).
  if (candidates.length > 1) {
    const { data: takenPairs, error: takenErr } = await client
      .from('neon_warm_pairs')
      .select('chip_a, chip_b')
      .in('status', ['waiting', 'paired', 'confirmed']);
    if (!takenErr && takenPairs && takenPairs.length > 0) {
      const busyPhones = new Set();
      for (const p of takenPairs) {
        if (p.chip_a !== normalized) busyPhones.add(p.chip_a);
        if (p.chip_b !== normalized) busyPhones.add(p.chip_b);
      }
      candidates = candidates.filter((c) => !busyPhones.has(c.phone));
    }
  }

  if (candidates.length === 0) {
    // Continua para o passo 4 (sem par disponível).
  } else if (candidates.length === 1) {
    // Só existe um candidato (além de self) — aceita mesmo que seja o
    // último parceiro (evita ficar travado sem trocar mensagens).
    const only = candidates[0];
    return createPair(client, normalized, only.phone, 'waiting');
  } else if (rotate) {
    // Rotação: garante que TODOS os chips interajam entre si (round-robin).
    // Usa o histórico de pares terminados para EVITAR repetir parceiro —
    // prioridade para quem nunca foi parceiro, depois para quem está há
    // mais tempo sem interagir. (Não repete o parceiro do ciclo anterior
    // quando há outra opção.)
    const recent = await recentPartnersWithClient(client, normalized, 10);
    const chosen = pickLeastRecentPartner(candidates, recent);
    if (chosen) return createPair(client, normalized, chosen.phone, 'waiting');
    // fallback: nenhum candidato → cai no passo 4
  } else {
    // Sem rotação: escolhe o candidato com sessão mais antiga (quem
    // espera há mais tempo tem prioridade).
    const candidate = candidates[0];
    return createPair(client, normalized, candidate.phone, 'waiting');
  }

  // ---- 4. Sem par disponível ----
  return {
    ok: true,
    pair: null,
    other: null,
    reason: 'no_partner_available',
    diagnostics: {
      current_session: session
        ? { id: session.id, status: session.status, online: currentOnline.online, online_reason: currentOnline.reason }
        : null,
      eligible_count: elig.filter((e) => e.eligible).length,
      candidates: elig.map((e) => ({
        phone: e.phone,
        status: e.session.status,
        last_heartbeat: e.session.last_heartbeat_at,
        online: e.online,
        eligible: e.eligible,
        reason: e.ineligible_reason,
      })),
    },
  };
}

/**
 * Marca um lado como confirmado. Quando ambos confirmaram, promove o
 * status para 'confirmed'.
 */
export async function confirmPairWithClient(client, { chip, pairWith = null }) {
  const normalized = normalizePhone(chip);
  if (!normalized) return { ok: false, reason: 'invalid_phone' };

  const active = await findActivePair(client, normalized);
  if (!active.ok) return { ok: false, reason: active.reason };
  if (!active.pair) return { ok: false, reason: 'no_active_pair' };

  const pair = active.pair;
  const other = active.other;

  if (pairWith) {
    const pWith = normalizePhone(pairWith);
    if (pWith && pWith !== other) return { ok: false, reason: 'pair_mismatch' };
  }

  const myCol = confirmedColFor(pair, normalized);
  const otherCol = confirmedColFor(pair, other);
  const mySeen = seenColFor(pair, normalized);
  const otherSeenCol = seenColFor(pair, other);

  const otherOnline = !!pair[otherSeenCol] &&
    new Date(pair[otherSeenCol]).getTime() >= Date.now() - PAIR_TTL_MS;

  // Este lado está confirmando AGORA (myCol vai para true). Ambos estão
  // confirmados quando o OUTRO lado já tinha confirmado antes.
  const bothConfirmed = pair[otherCol] === true;
  let updates = { [myCol]: true, [mySeen]: nowIso() };
  if (bothConfirmed) {
    updates.status = 'confirmed';
    updates.confirmed_at = pair.confirmed_at || nowIso();
  }

  const { data: updated, error } = await client
    .from('neon_warm_pairs')
    .update(updates)
    .eq('id', pair.id)
    .in('status', ['waiting', 'paired', 'confirmed'])
    .select('*')
    .maybeSingle();

  if (error) {
    console.error('[pairing] erro ao confirmar par:', error.message);
    const { data: fresh } = await client
      .from('neon_warm_pairs')
      .select('*')
      .eq('id', pair.id)
      .maybeSingle();
    if (fresh) {
      const confirmed = fresh.status === 'confirmed' && fresh.confirmed_a && fresh.confirmed_b;
      return { ok: true, confirmed, pair: fresh, other, otherOnline };
    }
    return { ok: false, reason: 'internal_error' };
  }

  const confirmed = updated.status === 'confirmed' && updated.confirmed_a && updated.confirmed_b;
  return { ok: true, confirmed, pair: updated, other, otherOnline };
}

/**
 * Encerra o par ativo de um chip (ex.: maturação parou).
 */
export async function releasePairWithClient(client, { chip }) {
  const normalized = normalizePhone(chip);
  if (!normalized) return { ok: false, reason: 'invalid_phone' };

  const active = await findActivePair(client, normalized);
  if (!active.ok) return { ok: false, reason: active.reason };
  if (!active.pair) return { ok: true, pair: null };

  const { error } = await client
    .from('neon_warm_pairs')
    .update({ status: 'ended', updated_at: nowIso() })
    .eq('id', active.pair.id)
    .in('status', ['waiting', 'paired', 'confirmed']);

  if (error) {
    console.error('[pairing] erro ao encerrar par:', error.message);
    return { ok: false, reason: 'internal_error' };
  }
  return { ok: true, pair: active.pair };
}

/**
 * Consulta o par ativo de um chip (diagnóstico / painel).
 */
export async function getActivePairWithClient(client, { chip }) {
  const normalized = normalizePhone(chip);
  if (!normalized) return { ok: false, reason: 'invalid_phone' };

  const active = await findActivePair(client, normalized);
  if (!active.ok) return { ok: false, reason: active.reason };
  if (!active.pair) return { ok: true, pair: null, other: null };

  return { ok: true, pair: active.pair, other: active.other };
}

/**
 * Encerra pares ativos (waiting/paired/confirmed).
 *
 * Dois usos (painel admin):
 *   - Sem `onlyPhone` (release_stale): encerra os pares em que PELO MENOS
 *     UM dos lados não está mais online (sem sessão ativa + heartbeat
 *     recente). Destrava chips presos com parceiro que caiu offline.
 *   - Com `onlyPhone` (release_number): encerra TODOS os pares ativos que
 *     envolvem aquele número, independente de estarem online — "tirar o
 *     número do pareamento" de forma explícita.
 *
 * @param {object} client  Client Supabase (injetado).
 * @param {object} [params]
 * @param {string|null} [params.onlyPhone]  Se informado, encerra TODOS os
 *   pares que envolvem este número (força desvinculação).
 * @returns {Promise<{ ok: boolean, released: number, reason?: string, error?: string }>}
 */
export async function releaseStalePairsWithClient(client, { onlyPhone = null } = {}) {
  try {
    let query = client
      .from('neon_warm_pairs')
      .select('*')
      .in('status', ['waiting', 'paired', 'confirmed']);
    if (onlyPhone) {
      const p = normalizePhone(onlyPhone);
      if (!p) return { ok: false, reason: 'invalid_phone', released: 0 };
      query = query.or(`chip_a.eq.${p},chip_b.eq.${p}`);
    }
    const { data: pairs, error } = await query;
    if (error) {
      console.error('[pairing] erro ao listar pares para release:', error.message);
      return { ok: false, reason: 'internal_error', error: error.message, released: 0 };
    }

    const toRelease = [];
    for (const pair of pairs || []) {
      if (onlyPhone) {
        // Desvinculação explícita: encerra todos os pares do número.
        toRelease.push(pair.id);
      } else {
        // Release automático: só encerra se um dos lados não está online.
        const aOnline = await isChipOnlineWithClient(client, pair.chip_a);
        const bOnline = await isChipOnlineWithClient(client, pair.chip_b);
        if (!aOnline || !bOnline) toRelease.push(pair.id);
      }
    }

    let released = 0;
    if (toRelease.length > 0) {
      const { error: updErr } = await client
        .from('neon_warm_pairs')
        .update({ status: 'ended', updated_at: nowIso() })
        .in('id', toRelease)
        .in('status', ['waiting', 'paired', 'confirmed']);
      if (updErr) {
        console.error('[pairing] erro ao encerrar pares stale:', updErr.message);
        return { ok: false, reason: 'internal_error', error: updErr.message, released: 0 };
      }
      released = toRelease.length;
    }

    return { ok: true, released };
  } catch (err) {
    console.error('[pairing] exceção em releaseStalePairs:', err.message);
    return { ok: false, reason: 'internal_error', error: err.message, released: 0 };
  }
}

/**
 * Rotaciona TODOS os pares ativos de uma vez (painel admin).
 *
 * Diferente de releaseStalePairs (que só encerra pares com lado offline),
 * esta função encerra TODOS os pares em status waiting/paired/confirmed,
 * mesmo que ambos os lados estejam online. No próximo ciclo de /pair
 * (com a extensão já enviando rotate:true), os chips formam pares novos.
 *
 * Uso: botão "Rotacionar todos os pares" — forçar troca geral de parceiro.
 *
 * @param {object} client  Client Supabase (injetado).
 * @returns {Promise<{ ok: boolean, rotated: number, reason?: string, error?: string }>}
 */
export async function rotateAllPairsWithClient(client) {
  try {
    const { data: pairs, error } = await client
      .from('neon_warm_pairs')
      .select('id')
      .in('status', ['waiting', 'paired', 'confirmed']);
    if (error) {
      console.error('[pairing] erro ao listar pares para rotação:', error.message);
      return { ok: false, reason: 'internal_error', error: error.message, rotated: 0 };
    }

    const ids = (pairs || []).map((p) => p.id);
    let rotated = 0;
    if (ids.length > 0) {
      const { error: updErr } = await client
        .from('neon_warm_pairs')
        .update({ status: 'ended', updated_at: nowIso() })
        .in('id', ids)
        .in('status', ['waiting', 'paired', 'confirmed']);
      if (updErr) {
        console.error('[pairing] erro ao rotacionar pares:', updErr.message);
        return { ok: false, reason: 'internal_error', error: updErr.message, rotated: 0 };
      }
      rotated = ids.length;
    }

    return { ok: true, rotated };
  } catch (err) {
    console.error('[pairing] exceção em rotateAllPairs:', err.message);
    return { ok: false, reason: 'internal_error', error: err.message, rotated: 0 };
  }
}

export { PAIR_TTL_MS };
