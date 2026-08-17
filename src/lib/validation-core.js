// ============================================================
// Núcleo do serviço de validação Neon Warm (sem dependências de infra)
// ============================================================
// Este módulo NÃO importa o supabase-js. Recebe o client Supabase
// por injeção (validateWithClient). O wrapper com o client real
// fica em validation.js.
//
// Ordem das verificações (definida no spec):
//   1. Número existe?
//   2. Número está bloqueado?
//   3. Usuário existe?
//   4. Usuário está ativo?
//   5. Existe assinatura?
//   6. Assinatura está ativa?
//   7. Assinatura expirou?
//   8. Plano está ativo?
//   9. Plano permite Neon Warm?
//  10. Existe licença?
//  11. Licença está ativa?
//  12. Licença expirou?
//  13. Dispositivo está autorizado?
//  14. Limite do plano foi excedido?
//
// Consultas parametrizadas (supabase-js) — sem SQL injection.
import { normalizePhone } from './phone.js';

export const REASONS = {
  NUMBER_NOT_FOUND: 'number_not_found',
  USER_NOT_FOUND: 'user_not_found',
  SUBSCRIPTION_NOT_FOUND: 'subscription_not_found',
  SUBSCRIPTION_EXPIRED: 'subscription_expired',
  SUBSCRIPTION_CANCELLED: 'subscription_cancelled',
  SUBSCRIPTION_SUSPENDED: 'subscription_suspended',
  PLAN_INACTIVE: 'plan_inactive',
  NEON_WARM_DISABLED: 'neon_warm_disabled',
  LICENSE_NOT_FOUND: 'license_not_found',
  LICENSE_EXPIRED: 'license_expired',
  LICENSE_REVOKED: 'license_revoked',
  NUMBER_BLOCKED: 'number_blocked',
  DEVICE_BLOCKED: 'device_blocked',
  DEVICE_LIMIT_REACHED: 'device_limit_reached',
  NUMBER_LIMIT_REACHED: 'number_limit_reached',
};

export const DB = {
  USERS: 'neon_warm_users',
  PLANS: 'neon_warm_plans',
  SUBSCRIPTIONS: 'neon_warm_subscriptions',
  NUMBERS: 'neon_warm_numbers',
  LICENSES: 'neon_warm_licenses',
  DEVICES: 'neon_warm_devices',
  SESSIONS: 'neon_warm_sessions',
  LOGS: 'neon_warm_logs',
  EXTENSION_KEYS: 'neon_warm_extension_keys',
  PAIRS: 'neon_warm_pairs',
};

function nowIso() {
  return new Date().toISOString();
}

/**
 * Executa todas as verificações de autorização para um número.
 *
 * @param {object} supabase  Client Supabase (real ou mock).
 * @param {object} params
 * @param {string} params.phoneNumber  Telefone bruto (será normalizado).
 * @param {string} params.extensionId  ID da extensão.
 * @param {string} params.deviceId     ID do dispositivo.
 * @param {object} [params.license]    Licença pré-resolvida (ex.: autenticação
 *   por chave de licença NW-...). Quando presente, as etapas de licença
 *   (10-12) usam este registro em vez de buscar pelo número.
 * @returns {Promise<ValidationResult>}
 */
export async function validateWithClient(supabase, { phoneNumber, extensionId, deviceId, license: preLicense }) {
  const normalized = normalizePhone(phoneNumber);

  if (!normalized) {
    return {
      authorized: false,
      reason: REASONS.NUMBER_NOT_FOUND,
      status: 'unauthorized',
      plan: null,
      expires_at: null,
      number: null,
      license: null,
      user: null,
      subscription: null,
      planRecord: null,
      device: null,
      message: 'Número de telefone inválido.',
    };
  }

  // ---- 1. Número existe? ----
  const { data: number, error: numberError } = await supabase
    .from(DB.NUMBERS)
    .select('id, user_id, phone_number, phone_number_normalized, status, verified_at, last_seen_at')
    .eq('phone_number_normalized', normalized)
    .maybeSingle();

  if (numberError) {
    console.error('[validate] erro ao buscar número:', numberError.message);
    return errorResult('internal_error', 'Erro interno ao validar o número.');
  }

  if (!number) {
    return {
      authorized: false,
      reason: REASONS.NUMBER_NOT_FOUND,
      status: 'unauthorized',
      plan: null,
      expires_at: null,
      number: null,
      license: null,
      user: null,
      subscription: null,
      planRecord: null,
      device: null,
      message: 'Número não cadastrado no Neon Warm.',
    };
  }

  // ---- 2. Número está bloqueado? ----
  if (number.status === 'blocked') {
    return {
      authorized: false,
      reason: REASONS.NUMBER_BLOCKED,
      status: 'unauthorized',
      plan: null,
      expires_at: null,
      number,
      license: null,
      user: null,
      subscription: null,
      planRecord: null,
      device: null,
      message: 'Número bloqueado.',
    };
  }

  if (!number.user_id) {
    return {
      authorized: false,
      reason: REASONS.USER_NOT_FOUND,
      status: 'unauthorized',
      plan: null,
      expires_at: null,
      number,
      license: null,
      user: null,
      subscription: null,
      planRecord: null,
      device: null,
      message: 'Número não vinculado a um usuário.',
    };
  }

  // ---- 3. Usuário existe? ----
  const { data: user, error: userError } = await supabase
    .from(DB.USERS)
    .select('id, email, name, status')
    .eq('id', number.user_id)
    .maybeSingle();

  if (userError) {
    console.error('[validate] erro ao buscar usuário:', userError.message);
    return errorResult('internal_error', 'Erro interno ao validar o usuário.');
  }

  if (!user) {
    return {
      authorized: false,
      reason: REASONS.USER_NOT_FOUND,
      status: 'unauthorized',
      plan: null,
      expires_at: null,
      number,
      license: null,
      user: null,
      subscription: null,
      planRecord: null,
      device: null,
      message: 'Usuário não encontrado.',
    };
  }

  // ---- 4. Usuário está ativo? ----
  if (user.status !== 'active') {
    return {
      authorized: false,
      reason: REASONS.USER_NOT_FOUND,
      status: 'unauthorized',
      plan: null,
      expires_at: null,
      number,
      license: null,
      user,
      subscription: null,
      planRecord: null,
      device: null,
      message: 'Usuário não ativo.',
    };
  }

  // ---- 5. Existe assinatura? (mais recente do usuário) ----
  const { data: subscription, error: subscriptionError } = await supabase
    .from(DB.SUBSCRIPTIONS)
    .select('id, user_id, plan_id, status, started_at, expires_at, external_subscription_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subscriptionError) {
    console.error('[validate] erro ao buscar assinatura:', subscriptionError.message);
    return errorResult('internal_error', 'Erro interno ao validar a assinatura.');
  }

  if (!subscription) {
    return {
      authorized: false,
      reason: REASONS.SUBSCRIPTION_NOT_FOUND,
      status: 'unauthorized',
      plan: null,
      expires_at: null,
      number,
      license: null,
      user,
      subscription: null,
      planRecord: null,
      device: null,
      message: 'Nenhuma assinatura encontrada.',
    };
  }

  // ---- 6/7. Assinatura ativa e não expirada ----
  if (subscription.status === 'expired' || (subscription.status === 'active' && subscription.expires_at && new Date(subscription.expires_at).getTime() <= Date.now())) {
    return {
      authorized: false,
      reason: REASONS.SUBSCRIPTION_EXPIRED,
      status: 'unauthorized',
      plan: null,
      expires_at: subscription.expires_at,
      number,
      license: null,
      user,
      subscription,
      planRecord: null,
      device: null,
      message: 'Assinatura vencida.',
    };
  }

  if (subscription.status === 'cancelled') {
    return {
      authorized: false,
      reason: REASONS.SUBSCRIPTION_CANCELLED,
      status: 'unauthorized',
      plan: null,
      expires_at: subscription.expires_at,
      number,
      license: null,
      user,
      subscription,
      planRecord: null,
      device: null,
      message: 'Assinatura cancelada.',
    };
  }

  if (subscription.status === 'suspended') {
    return {
      authorized: false,
      reason: REASONS.SUBSCRIPTION_SUSPENDED,
      status: 'unauthorized',
      plan: null,
      expires_at: subscription.expires_at,
      number,
      license: null,
      user,
      subscription,
      planRecord: null,
      device: null,
      message: 'Assinatura suspensa.',
    };
  }

  if (subscription.status !== 'active') {
    return {
      authorized: false,
      reason: REASONS.SUBSCRIPTION_NOT_FOUND,
      status: 'unauthorized',
      plan: null,
      expires_at: subscription.expires_at,
      number,
      license: null,
      user,
      subscription,
      planRecord: null,
      device: null,
      message: 'Assinatura não ativa.',
    };
  }

  // ---- 8. Plano está ativo? ----
  const { data: planRecord, error: planError } = await supabase
    .from(DB.PLANS)
    .select('id, name, description, price, active, neon_warm_enabled, max_numbers, max_devices')
    .eq('id', subscription.plan_id)
    .maybeSingle();

  if (planError) {
    console.error('[validate] erro ao buscar plano:', planError.message);
    return errorResult('internal_error', 'Erro interno ao validar o plano.');
  }

  if (!planRecord) {
    return {
      authorized: false,
      reason: REASONS.SUBSCRIPTION_NOT_FOUND,
      status: 'unauthorized',
      plan: null,
      expires_at: subscription.expires_at,
      number,
      license: null,
      user,
      subscription,
      planRecord: null,
      device: null,
      message: 'Plano não encontrado.',
    };
  }

  if (!planRecord.active) {
    return {
      authorized: false,
      reason: REASONS.PLAN_INACTIVE,
      status: 'unauthorized',
      plan: planRecord.name,
      expires_at: subscription.expires_at,
      number,
      license: null,
      user,
      subscription,
      planRecord,
      device: null,
      message: 'Plano inativo.',
    };
  }

  // ---- 9. Plano permite Neon Warm? ----
  if (!planRecord.neon_warm_enabled) {
    return {
      authorized: false,
      reason: REASONS.NEON_WARM_DISABLED,
      status: 'unauthorized',
      plan: planRecord.name,
      expires_at: subscription.expires_at,
      number,
      license: null,
      user,
      subscription,
      planRecord,
      device: null,
      message: 'Plano não inclui o Neon Warm.',
    };
  }

  // ---- 10. Existe licença? ----
  // Se a autenticação veio por chave de licença (NW-...), o auth já
  // resolveu a licença e o número vinculado. Usamos esse registro,
  // mas garantimos que a licença pertence ao MESMO número que está
  // sendo validado (isolamento entre clientes).
  let license = preLicense ?? null;
  if (license && license.phone_number_id !== number.id) {
    return {
      authorized: false,
      reason: REASONS.LICENSE_NOT_FOUND,
      status: 'unauthorized',
      plan: null,
      expires_at: null,
      number,
      license: null,
      user: null,
      subscription: null,
      planRecord: null,
      device: null,
      message: 'A licença não pertence a este número.',
    };
  }

  if (!license) {
    const { data: fetchedLicense, error: licenseError } = await supabase
      .from(DB.LICENSES)
      .select('id, user_id, phone_number_id, plan_id, status, license_key, activated_at, expires_at, last_validation_at, last_extension_id')
      .eq('phone_number_id', number.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (licenseError) {
      console.error('[validate] erro ao buscar licença:', licenseError.message);
      return errorResult('internal_error', 'Erro interno ao validar a licença.');
    }

    if (!fetchedLicense) {
      return {
        authorized: false,
        reason: REASONS.LICENSE_NOT_FOUND,
        status: 'unauthorized',
        plan: planRecord.name,
        expires_at: subscription.expires_at,
        number,
        license: null,
        user,
        subscription,
        planRecord,
        device: null,
        message: 'Licença não encontrada para este número.',
      };
    }

    license = fetchedLicense;
  }

  // ---- 11. Licença está ativa? ----
  if (license.status === 'revoked') {
    return {
      authorized: false,
      reason: REASONS.LICENSE_REVOKED,
      status: 'unauthorized',
      plan: planRecord.name,
      expires_at: license.expires_at,
      number,
      license,
      user,
      subscription,
      planRecord,
      device: null,
      message: 'Licença revogada.',
    };
  }

  if (license.status === 'blocked') {
    return {
      authorized: false,
      reason: REASONS.NUMBER_BLOCKED,
      status: 'unauthorized',
      plan: planRecord.name,
      expires_at: license.expires_at,
      number,
      license,
      user,
      subscription,
      planRecord,
      device: null,
      message: 'Licença bloqueada.',
    };
  }

  // ---- 12. Licença expirou? ----
  if (license.status === 'expired' || (license.expires_at && new Date(license.expires_at).getTime() <= Date.now())) {
    return {
      authorized: false,
      reason: REASONS.LICENSE_EXPIRED,
      status: 'unauthorized',
      plan: planRecord.name,
      expires_at: license.expires_at,
      number,
      license,
      user,
      subscription,
      planRecord,
      device: null,
      message: 'Licença expirada.',
    };
  }

  if (license.status !== 'active') {
    return {
      authorized: false,
      reason: REASONS.LICENSE_NOT_FOUND,
      status: 'unauthorized',
      plan: planRecord.name,
      expires_at: license.expires_at,
      number,
      license,
      user,
      subscription,
      planRecord,
      device: null,
      message: 'Licença não ativa.',
    };
  }

  // ---- 13. Dispositivo autorizado? ----
  // Sempre registra (ou reutiliza) o dispositivo no primeiro uso.
  // Se estiver bloqueado, nega.
  let device = null;
  if (deviceId) {
    const { data: existingDevice } = await supabase
      .from(DB.DEVICES)
      .select('id, user_id, phone_number_id, extension_id, device_id, browser, operating_system, status')
      .eq('extension_id', extensionId)
      .eq('device_id', deviceId)
      .maybeSingle();

    if (existingDevice) {
      if (existingDevice.status === 'blocked') {
        return {
          authorized: false,
          reason: REASONS.DEVICE_BLOCKED,
          status: 'unauthorized',
          plan: planRecord.name,
          expires_at: license.expires_at,
          number,
          license,
          user,
          subscription,
          planRecord,
          device: existingDevice,
          message: 'Dispositivo bloqueado.',
        };
      }
      device = existingDevice;
    } else {
      // ---- 14. Limite de dispositivos do plano ----
      const { count, error: countError } = await supabase
        .from(DB.DEVICES)
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id);

      if (!countError && count >= planRecord.max_devices) {
        return {
          authorized: false,
          reason: REASONS.DEVICE_LIMIT_REACHED,
          status: 'unauthorized',
          plan: planRecord.name,
          expires_at: license.expires_at,
          number,
          license,
          user,
          subscription,
          planRecord,
          device: null,
          message: 'Limite de dispositivos do plano excedido.',
        };
      }

      const { data: newDevice, error: createError } = await supabase
        .from(DB.DEVICES)
        .insert({
          user_id: user.id,
          phone_number_id: number.id,
          extension_id: extensionId,
          device_id: deviceId,
          browser: null,
          operating_system: null,
          status: 'active',
          first_seen_at: nowIso(),
          last_seen_at: nowIso(),
        })
        .select('id, user_id, phone_number_id, extension_id, device_id, browser, operating_system, status')
        .maybeSingle();

      if (createError) {
        // Se der conflito de unique (corrida), tenta buscar de novo.
        const { data: retryDevice } = await supabase
          .from(DB.DEVICES)
          .select('id, user_id, phone_number_id, extension_id, device_id, browser, operating_system, status')
          .eq('extension_id', extensionId)
          .eq('device_id', deviceId)
          .maybeSingle();
        device = retryDevice || null;
        if (!retryDevice) {
          console.error('[validate] erro ao criar dispositivo:', createError.message);
          return errorResult('internal_error', 'Erro interno ao registrar o dispositivo.');
        }
      } else {
        device = newDevice;
      }
    }
  }

  // ---- Número: verificar limite de números por usuário ----
  const { count: userNumberCount, error: numberCountError } = await supabase
    .from(DB.NUMBERS)
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'active');

  if (!numberCountError && userNumberCount > planRecord.max_numbers) {
    return {
      authorized: false,
      reason: REASONS.NUMBER_LIMIT_REACHED,
      status: 'unauthorized',
      plan: planRecord.name,
      expires_at: license.expires_at,
      number,
      license,
      user,
      subscription,
      planRecord,
      device,
      message: 'Limite de números do plano excedido.',
    };
  }

  // ---- Tudo OK ----
  // Atualiza last_seen_at do número e last_validation_at da licença.
  await Promise.allSettled([
    supabase.from(DB.NUMBERS).update({ last_seen_at: nowIso() }).eq('id', number.id),
    supabase.from(DB.LICENSES).update({ last_validation_at: nowIso() }).eq('id', license.id),
  ]);

  return {
    authorized: true,
    reason: null,
    status: 'active',
    plan: planRecord.name,
    expires_at: license.expires_at ?? subscription.expires_at,
    number,
    license,
    user,
    subscription,
    planRecord,
    device,
    message: 'Número autorizado para utilizar o Neon Warm',
  };
}

// Helper de resultado de erro interno
function errorResult(reason, message) {
  return {
    authorized: false,
    reason,
    status: 'error',
    plan: null,
    expires_at: null,
    number: null,
    license: null,
    user: null,
    subscription: null,
    planRecord: null,
    device: null,
    message,
  };
}
