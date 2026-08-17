// ============================================================
// POST /api/maturador/pair
// ============================================================
// Pareamento real entre chips conectados pela extensão.
//
// O chip A (número conectado na extensão) chama esta rota. O
// servidor encontra outro chip B que também está com a extensão
// conectada (sessão ativa + heartbeat recente) e devolve B. Os dois
// então trocam mensagens entre si.
//
// Parâmetros (JSON):
//   phone_number  Número do chip (normalizado para E.164)
//   chipId        Alias (backward compat)
//   session_id    Sessão atual do chip (para excluir self)
//   device_id     Device do chip (para excluir self)
//   pair_with     (opcional) preferência de parceiro
//
// Respostas:
//   { code: 2, pairWith: "<número>" }   → par encontrado (enviar p/ ele)
//   { code: 3, ... }                    → número não encontrado/autorizado
//   { code: 0, pairWith: null }         → sem par disponível agora
//   { code: 1, ... }                    → erro interno / aguardando
//
// Protegida por guardExtensionRoute (API key + rate limit).
import { guardExtensionRoute } from '@/lib/api-guard.js';
import { findOrCreatePair } from '@/lib/pairing.js';
import { getSupabaseAdmin, DB } from '@/lib/supabase.js';
import { normalizePhone } from '@/lib/phone.js';
import { readJsonBody, jsonOk, jsonError } from '@/lib/http.js';
import { logEvent } from '@/lib/logger.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Garante que o número está registrado e ativo no banco.
 * @returns {Promise<{ ok: boolean, numberId?: string, reason?: string }>}
 */
async function ensureRegisteredNumber(phoneNumber) {
  const normalized = normalizePhone(phoneNumber);
  if (!normalized) return { ok: false, reason: 'invalid_phone' };

  const { data: row, error } = await getSupabaseAdmin()
    .from(DB.NUMBERS)
    .select('id, status')
    .eq('phone_number_normalized', normalized)
    .maybeSingle();

  if (error) {
    console.error('[pair] erro ao buscar número:', error.message);
    return { ok: false, reason: 'internal_error' };
  }
  if (!row) return { ok: false, reason: 'number_not_found' };
  if (row.status !== 'active') return { ok: false, reason: 'number_blocked' };

  return { ok: true, numberId: row.id };
}

// ------------------------------------------------------------------
// DEBUG TEMPORÁRIO — logs não-sensíveis para diagnosticar o pareamento.
// Remove/reduz depois de confirmado o fluxo (seção 9 do pedido).
// ------------------------------------------------------------------
function logDebug(lines) {
  try {
    console.log('[pair:debug] ' + lines.join('\n[pair:debug] '));
  } catch {
    /* noop */
  }
}

export async function POST(request) {
  const guard = await guardExtensionRoute(request, 'maturador_pair');
  if (!guard.ok) return guard.response;

  const body = await readJsonBody(request);
  if (body === null) {
    return jsonError('Corpo JSON inválido.', 400, { reason: 'invalid_payload' });
  }

  const rawPhone = body?.phone_number || body?.chipId || body?.chip_id || null;
  const rawPreferred = body?.pair_with || body?.preferred_with || null;
  const sessionId = typeof body?.session_id === 'string' && body.session_id ? body.session_id.trim() : null;
  const deviceId = typeof body?.device_id === 'string' && body.device_id ? body.device_id.trim() : null;

  const normalized = normalizePhone(rawPhone);
  if (!normalized) {
    logDebug([
      'PAIR REQUEST',
      `phone_number: ${rawPhone || 'null'}`,
      `session_id: ${sessionId || 'null'}`,
      `device_id: ${deviceId || 'null'}`,
      'RESULT: phone inválido',
    ]);
    return jsonOk({ code: 3, pairWith: null, message: 'número_invalido' });
  }

  // O número precisa estar registrado e ativo no banco (foi cadastrado
  // pelo operador como número licenciado). Sem isso, não pareamos.
  const reg = await ensureRegisteredNumber(normalized);
  if (!reg.ok) {
    await logEvent({
      eventType: 'pair_rejected',
      metadata: { phone_number: normalized, reason: reg.reason },
    }).catch(() => {});
    logDebug([
      'PAIR REQUEST',
      `phone_number: ${normalized}`,
      `session_id: ${sessionId || 'null'}`,
      `device_id: ${deviceId || 'null'}`,
      'RESULT: número não registrado/inativo',
    ]);
    return jsonOk({
      code: 3,
      pairWith: null,
      message: reg.reason === 'number_not_found' ? 'numero_nao_encontrado' : 'numero_indisponivel',
    });
  }

  const result = await findOrCreatePair({
    chip: normalized,
    preferredWith: rawPreferred,
    sessionId,
    deviceId,
  });

  if (!result.ok) {
    if (result.reason === 'invalid_phone') {
      return jsonOk({ code: 3, pairWith: null, message: 'número_invalido' });
    }
    return jsonOk({ code: 1, pairWith: null, message: 'servidor_ocupado' });
  }

  if (!result.pair || !result.other) {
    await logEvent({
      eventType: 'pair_waiting',
      phoneNumberId: reg.numberId,
      metadata: { phone_number: normalized, diagnostics: result.diagnostics ?? null },
    }).catch(() => {});

    // Log de debug estruturado (seção 9 do pedido) — sem dados sensíveis.
    const diag = result.diagnostics ?? {};
    const candidates = diag.candidates ?? [];
    logDebug([
      'PAIR REQUEST',
      `phone_number: ${normalized}`,
      `session_id: ${sessionId || 'null'}`,
      `device_id: ${deviceId || 'null'}`,
      `CURRENT SESSION: ${diag.current_session ? JSON.stringify(diag.current_session) : 'não encontrada'}`,
      `ELIGIBLE SESSIONS: ${diag.eligible_count ?? '?'}`,
      'CANDIDATES:',
      ...(candidates.length
        ? candidates.map((c) =>
            `- phone: ${c.phone} | status: ${c.status} | last_heartbeat: ${c.last_heartbeat} | online: ${c.online} | eligible: ${c.eligible} | reason: ${c.reason ?? '-'}`
          )
        : ['- nenhuma'],
      ),
      'SELECTED: nenhum',
      'RESULT: sem_par_disponivel',
    ]);

    return jsonOk({ code: 0, pairWith: null, message: 'sem_par_disponivel' });
  }

  const other = result.other;

  await logEvent({
    eventType: 'pair_found',
    phoneNumberId: reg.numberId,
    metadata: {
      phone_number: normalized,
      pair_with: other,
      pair_id: result.pair.id,
      created: result.created === true,
      status: result.pair.status,
    },
  }).catch(() => {});

  logDebug([
    'PAIR REQUEST',
    `phone_number: ${normalized}`,
    `session_id: ${sessionId || 'null'}`,
    `device_id: ${deviceId || 'null'}`,
    `CURRENT SESSION: ${result.diagnostics?.current_session ? JSON.stringify(result.diagnostics.current_session) : 'não encontrada'}`,
    'RESULT: par_encontrado',
    `SELECTED: ${other}`,
  ]);

  return jsonOk({
    code: 2,
    pairWith: other,
    pairId: result.pair.id,
    status: result.pair.status,
    message: 'par_encontrado',
  });
}
