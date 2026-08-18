// ============================================================
// POST /api/maturador/validate
// ============================================================
// Confirmação do pareamento entre chips.
//
// O chip chama esta rota com confirm=true depois que recebeu o
// número do par via /pair (e abriu o chat com ele). Quando AMBOS os
// lados confirmarem, a resposta traz ambosConfirmados=true, e os
// dois chips podem trocar mensagens entre si.
//
// Respostas:
//   { code: 2, ambosConfirmados: true,  pairWith: "<número>" } → enviar
//   { code: 1, ambosConfirmados: false, pairWith: "<número>" } → aguardar (par não confirmou)
//   { code: 0, ambosConfirmados: false, pairWith: null }       → sem par ativo
//   { code: 3, ... }                                           → número inválido/não registrado
//
// Protegida por guardExtensionRoute (API key + rate limit).
import { guardExtensionRoute } from '@/lib/api-guard.js';
import { confirmPair, getActivePair } from '@/lib/pairing.js';
import { normalizePhone } from '@/lib/phone.js';
import { bumpDailyStatsWithClient, markPairStatsCountedWithClient, incrementCyclesWithClient } from '@/lib/maturation-plans.js';
import { getSupabaseAdmin } from '@/lib/supabase.js';
import { readJsonBody, jsonOk, jsonError } from '@/lib/http.js';
import { logEvent } from '@/lib/logger.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const guard = await guardExtensionRoute(request, 'maturador_validate');
  if (!guard.ok) return guard.response;

  const body = await readJsonBody(request);
  if (body === null) {
    return jsonError('Corpo JSON inválido.', 400, { reason: 'invalid_payload' });
  }

  const rawPhone = body?.phone_number || body?.chipId || body?.chip_id || null;
  const confirm = body?.confirm === true || body?.confirm === 'true' || body?.confirm === 1;
  const rawPairWith = body?.pair_with || body?.pairWith || null;

  const normalized = normalizePhone(rawPhone);
  if (!normalized) {
    return jsonOk({ code: 3, ambosConfirmados: false, pairWith: null, message: 'número_invalido' });
  }

  // Isolamento entre clientes (mesma regra do /pair): autenticação por
  // chave de licença só confirma/pareia o número vinculado à licença.
  if (guard.authMode === 'license') {
    const licenseNumber = guard.licenseNumber?.phone_number_normalized ?? null;
    if (!licenseNumber || licenseNumber !== normalized) {
      return jsonOk({ code: 3, ambosConfirmados: false, pairWith: null, message: 'numero_nao_pertence_licenca' });
    }
  }

  const result = confirm
    ? await confirmPair({ chip: normalized, pairWith: rawPairWith })
    : await getActivePair({ chip: normalized });

  if (!result.ok) {
    if (result.reason === 'no_active_pair') {
      return jsonOk({ code: 0, ambosConfirmados: false, pairWith: null, message: 'sem_par_ativos' });
    }
    if (result.reason === 'pair_mismatch') {
      return jsonOk({ code: 0, ambosConfirmados: false, pairWith: null, message: 'par_divergente' });
    }
    return jsonOk({ code: 1, ambosConfirmados: false, pairWith: null, message: 'servidor_ocupado' });
  }

  if (!result.pair || !result.other) {
    return jsonOk({ code: 0, ambosConfirmados: false, pairWith: null, message: 'sem_par_ativos' });
  }

  const other = result.other;
  const confirmed =
    result.confirmed === true ||
    (result.pair.status === 'confirmed' && result.pair.confirmed_a && result.pair.confirmed_b);

  // ------------------------------------------------------------------
  // CONTAGEM DIÁRIA (stats): quando o par está CONFIRMADO (ambos os
  // lados), conta +1 enviada e +1 recebida para CADA número do par.
  // O `markPairStatsCounted` é atômico (where stats_counted = false),
  // então só a PRIMEIRA confirmação do par incrementa — a segunda
  // (do outro lado) não duplica a contagem.
  // ------------------------------------------------------------------
  if (confirmed && result.pair && result.pair.id) {
    const counted = await markPairStatsCountedWithClient(getSupabaseAdmin(), result.pair.id);
    if (counted) {
      // Este lado enviou 1 (foi o confirm) e recebeu 1 (o outro também).
      // Ambos os lados do par ganham +1 sent e +1 received por ciclo.
      await bumpDailyStatsWithClient(getSupabaseAdmin(), normalized, { sent: 1, received: 1 }).catch(() => {});
      if (other) {
        await bumpDailyStatsWithClient(getSupabaseAdmin(), other, { sent: 1, received: 1 }).catch(() => {});
      }
      // Contador de ciclos (pares confirmados) — usado pelo limite de ciclos.
      await incrementCyclesWithClient(getSupabaseAdmin(), normalized).catch(() => {});
      if (other) {
        await incrementCyclesWithClient(getSupabaseAdmin(), other).catch(() => {});
      }
    }
  }

  await logEvent({
    eventType: 'pair_validate',
    metadata: {
      phone_number: normalized,
      pair_with: other,
      confirm,
      confirmed,
      status: result.pair.status,
    },
  }).catch(() => {});

  return jsonOk({
    code: confirmed ? 2 : 1,
    ambosConfirmados: confirmed,
    pairWith: other,
    otherOnline: result.otherOnline === true,
    status: result.pair.status,
    message: confirmed ? 'ambos_confirmados' : 'aguardando_confirmacao',
  });
}
