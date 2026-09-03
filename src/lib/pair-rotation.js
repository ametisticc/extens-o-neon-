// ============================================================
// lib/pair-rotation.js
// ============================================================
// Serviço de rotação inteligente de pares
// Evita parear 2x com mesmo número em 48h
// Prioriza números novos e balanceia carga

import { tryGetSupabaseAdmin, DB } from './supabase.js';

const MIN_HOURS_BETWEEN_PAIRS = 48; // Não parear 2x em 48h
const RECENT_PAIR_LOOKBACK_DAYS = 7; // Considerar últimos 7 dias

/**
 * Busca o melhor par disponível para um número
 * Prioriza: números novos > não pareados recentemente > balanceado
 *
 * @param {string} sourcePhone - Número que procura par
 * @returns { pairPhone: string, reason: string } ou null
 */
export async function findBestPairFor(sourcePhone) {
  const supabase = tryGetSupabaseAdmin();
  if (!supabase) {
    console.error('[pair-rotation] supabase unavailable');
    return null;
  }

  try {
    // 1. Buscar números com sessão ativa (online)
    const { data: activeSessions } = await supabase
      .from(DB.SESSIONS)
      .select('phone_number_id')
      .eq('status', 'active')
      .gt('last_heartbeat_at', new Date(Date.now() - 5 * 60 * 1000).toISOString()); // Heartbeat nos últimos 5min

    if (!activeSessions || activeSessions.length === 0) {
      return null; // Ninguém online
    }

    const activePhoneIds = activeSessions.map(s => s.phone_number_id);

    // 2. Resolver IDs para números normalizados
    const { data: phoneNumbers } = await supabase
      .from(DB.NUMBERS)
      .select('id, phone_number_normalized')
      .in('id', activePhoneIds);

    if (!phoneNumbers) return null;

    const phoneMap = {};
    phoneNumbers.forEach(p => {
      phoneMap[p.id] = p.phone_number_normalized;
    });

    // 3. Buscar último pareamento do sourcePhone
    const minHoursAgo = new Date(Date.now() - MIN_HOURS_BETWEEN_PAIRS * 60 * 60 * 1000).toISOString();

    const { data: recentPairs } = await supabase
      .from(DB.PAIRS)
      .select('phone_1, phone_2')
      .or(`phone_1.eq.${sourcePhone},phone_2.eq.${sourcePhone}`)
      .gte('created_at', minHoursAgo);

    const recentPartners = new Set();
    (recentPairs || []).forEach(p => {
      const partner = p.phone_1 === sourcePhone ? p.phone_2 : p.phone_1;
      recentPartners.add(partner);
    });

    // 4. Filtrar: excluir sourcePhone e parceiros recentes
    const candidates = Object.values(phoneMap).filter(
      phone => phone !== sourcePhone && !recentPartners.has(phone)
    );

    if (candidates.length === 0) {
      // Nenhum candidato válido (todos já pareados recentemente)
      // Retornar qualquer um (menos ideal, mas melhor que nada)
      return {
        pairPhone: Object.values(phoneMap).find(p => p !== sourcePhone) || null,
        reason: 'force_repeat_recent_pair',
      };
    }

    // 5. Priorizar números "novos" (fewer total pairs)
    const { data: pairCounts } = await supabase
      .from(DB.PAIRS)
      .select('phone_1, phone_2')
      .gte('created_at', new Date(Date.now() - RECENT_PAIR_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString());

    const pairFrequency = {};
    (pairCounts || []).forEach(p => {
      pairFrequency[p.phone_1] = (pairFrequency[p.phone_1] || 0) + 1;
      pairFrequency[p.phone_2] = (pairFrequency[p.phone_2] || 0) + 1;
    });

    // Ordenar por menos frequência (números novos primeiro)
    const sorted = candidates.sort((a, b) => {
      const freqA = pairFrequency[a] || 0;
      const freqB = pairFrequency[b] || 0;
      return freqA - freqB;
    });

    return {
      pairPhone: sorted[0],
      reason: 'optimal_rotation',
      frequency: pairFrequency[sorted[0]] || 0,
    };
  } catch (error) {
    console.error('[pair-rotation] erro ao buscar par:', error);
    return null;
  }
}

/**
 * Registra um pareamento (para futuras rotações evitarem repetição)
 * Chamado após um pareamento bem-sucedido
 *
 * @param {string} phone1
 * @param {string} phone2
 * @param {number} messagesSent
 * @param {number} messagesTotal
 */
export async function recordPair(phone1, phone2, messagesSent = 0, messagesTotal = 0) {
  const supabase = tryGetSupabaseAdmin();
  if (!supabase) {
    return { ok: false, error: 'supabase_unavailable' };
  }

  try {
    const { error } = await supabase
      .from(DB.PAIRS)
      .insert({
        phone_1: phone1,
        phone_2: phone2,
        messages_sent: messagesSent,
        messages_total: messagesTotal,
        status: 'completed',
        created_at: new Date().toISOString(),
      });

    if (error) {
      console.error('[pair-rotation] erro ao registrar par:', error);
      return { ok: false, error: error.message };
    }

    return { ok: true };
  } catch (error) {
    console.error('[pair-rotation] erro:', error);
    return { ok: false, error: error.message };
  }
}

/**
 * Análise de rotação: mostra estatísticas de balanceamento
 */
export async function getRotationStats() {
  const supabase = tryGetSupabaseAdmin();
  if (!supabase) {
    return { ok: false, error: 'supabase_unavailable' };
  }

  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: pairs } = await supabase
      .from(DB.PAIRS)
      .select('phone_1, phone_2')
      .gte('created_at', sevenDaysAgo);

    // Contar frequência de cada número
    const frequency = {};
    const pairs_list = [];

    (pairs || []).forEach(p => {
      frequency[p.phone_1] = (frequency[p.phone_1] || 0) + 1;
      frequency[p.phone_2] = (frequency[p.phone_2] || 0) + 1;
      pairs_list.push({ phone_1: p.phone_1, phone_2: p.phone_2 });
    });

    // Calcular desvio padrão (balanceamento)
    const frequencies = Object.values(frequency);
    const mean = frequencies.length > 0 ? frequencies.reduce((a, b) => a + b, 0) / frequencies.length : 0;
    const variance = frequencies.length > 0 
      ? frequencies.reduce((sum, f) => sum + Math.pow(f - mean, 2), 0) / frequencies.length 
      : 0;
    const stdDev = Math.sqrt(variance);

    // Top 10 números com mais pares
    const topNumbers = Object.entries(frequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([phone, count]) => ({ phone, count }));

    return {
      ok: true,
      stats: {
        total_pairs: pairs_list.length,
        unique_numbers: Object.keys(frequency).length,
        mean_pairs_per_number: Math.round(mean * 10) / 10,
        std_dev: Math.round(stdDev * 10) / 10,
        balance_score: stdDev < 2 ? 'excellent' : stdDev < 5 ? 'good' : 'poor',
        top_numbers: topNumbers,
      },
    };
  } catch (error) {
    console.error('[pair-rotation] erro ao calcular stats:', error);
    return { ok: false, error: error.message };
  }
}
