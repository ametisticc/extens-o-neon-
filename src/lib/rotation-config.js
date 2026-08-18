// ============================================================
// Configuração da rotação automática de parceiros (100% backend)
// ============================================================
// Com 3+ números ativos, o pareamento pode ficar com par FIXO quando a
// extensão do cliente não manda rotate:true a cada ciclo. Esta config
// faz o SERVIDOR forçar a rotação independentemente da extensão:
//
//   enabled      boolean  → liga/desliga a rotação automática (painel)
//   min_online   integer  → só rotaciona com >= este nº de contas online
//
// Quando habilitada e o nº de sessões online >= min_online, o /pair
// trata cada ciclo como rotate=true (round-robin: não repete parceiro
// recente). A extensão continua funcionando do mesmo jeito.
//
// Config em tabela neon_warm_rotation_config (linha única, id=1).
// Recebe o client por injeção (testável com mock).
import { presenceWindowMs } from './pairing-presence.js';

export const ROTATION_CONFIG_TABLE = 'neon_warm_rotation_config';

const DEFAULT_CONFIG = { enabled: false, min_online: 3 };

/**
 * Carrega a configuração de rotação automática.
 * Tolerante: se a tabela não existir (migration pendente) ou falhar,
 * devolve o padrão (desligada) — comportamento atual intacto.
 * @returns {Promise<{ enabled: boolean, min_online: number }>}
 */
export async function getRotationConfigWithClient(client) {
  try {
    const { data, error } = await client
      .from(ROTATION_CONFIG_TABLE)
      .select('enabled, min_online, updated_at')
      .eq('id', 1)
      .maybeSingle();
    if (error) {
      console.error('[rotation] erro ao buscar config:', error.message);
      return { ...DEFAULT_CONFIG };
    }
    if (!data) return { ...DEFAULT_CONFIG };
    return {
      enabled: data.enabled === true,
      min_online: Number.isFinite(Number(data.min_online)) ? Number(data.min_online) : DEFAULT_CONFIG.min_online,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Salva a configuração de rotação automática (linha id=1).
 * @param {object} client  Client Supabase (injetado).
 * @param {object} cfg
 * @param {boolean} cfg.enabled     Liga/desliga.
 * @param {number} [cfg.minOnline]  Mínimo de contas online (>= 2).
 * @returns {Promise<{ ok: boolean, config?: object, reason?: string, error?: string }>}
 */
export async function setRotationConfigWithClient(client, { enabled, minOnline }) {
  const min = Math.max(2, Math.round(Number(minOnline) || 0) || 3);
  try {
    const { data, error } = await client
      .from(ROTATION_CONFIG_TABLE)
      .upsert({ id: 1, enabled: enabled === true, min_online: min }, { onConflict: 'id' })
      .select('enabled, min_online, updated_at')
      .maybeSingle();
    if (error) {
      console.error('[rotation] erro ao salvar config:', error.message);
      return { ok: false, reason: 'internal_error', error: error.message };
    }
    return {
      ok: true,
      config: {
        enabled: data?.enabled === true,
        min_online: Number(data?.min_online ?? min),
      },
    };
  } catch (err) {
    console.error('[rotation] exceção ao salvar config:', err.message);
    return { ok: false, reason: 'internal_error', error: err.message };
  }
}

/**
 * Decide se a rotação automática DEVE estar ativa AGORA.
 * Requer: enabled e nº de sessões online (heartbeat recente) >= min_online.
 *
 * @param {object} client  Client Supabase (injetado).
 * @returns {Promise<{ rotate: boolean, enabled: boolean, min_online: number, online_count: number }>}
 */
export async function shouldAutoRotateWithClient(client) {
  const cfg = await getRotationConfigWithClient(client);
  if (!cfg.enabled) {
    return { rotate: false, enabled: false, min_online: cfg.min_online, online_count: 0 };
  }

  const cutoff = new Date(Date.now() - presenceWindowMs()).toISOString();
  try {
    const { count, error } = await client
      .from('neon_warm_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .is('ended_at', null)
      .gte('last_heartbeat_at', cutoff);
    const onlineCount = error ? 0 : Number(count ?? 0);
    return {
      rotate: onlineCount >= cfg.min_online,
      enabled: true,
      min_online: cfg.min_online,
      online_count: onlineCount,
    };
  } catch {
    return { rotate: false, enabled: true, min_online: cfg.min_online, online_count: 0 };
  }
}
