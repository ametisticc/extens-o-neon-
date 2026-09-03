// ============================================================
// GET /api/admin/maturation/health/:phoneNumber
// ============================================================
// Análise detalhada de saúde de um número
// Retorna: score, fase, histórico, alertas, recomendações
import { readAdminSession } from '@/lib/admin.js';
import { tryGetSupabaseAdmin, DB } from '@/lib/supabase.js';
import { jsonOk, jsonError } from '@/lib/http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const session = await readAdminSession();
  if (!session) {
    return jsonError('Não autorizado', 401);
  }

  const { phoneNumber } = params;
  if (!phoneNumber) {
    return jsonError('phoneNumber é obrigatório', 400);
  }

  const supabase = tryGetSupabaseAdmin();
  if (!supabase) {
    return jsonError('Supabase não configurado', 500);
  }

  try {
    // 1. Resolve número para ID
    const { data: number } = await supabase
      .from(DB.NUMBERS)
      .select('id, user_id, phone_number_normalized, status, created_at')
      .eq('phone_number_normalized', phoneNumber)
      .maybeSingle();

    if (!number) {
      return jsonError('Número não encontrado', 404);
    }

    // 2. Pega dados de maturação (sessões ativas, pares, etc)
    const daysSinceCreation = Math.floor((Date.now() - new Date(number.created_at).getTime()) / (1000 * 60 * 60 * 24));

    // 3. Últimas 24h de atividade
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const { data: last24hLogs } = await supabase
      .from(DB.LOGS)
      .select('id, event_type, metadata, created_at')
      .eq('phone_number_id', number.id)
      .gte('created_at', twentyFourHoursAgo)
      .order('created_at', { ascending: false });

    // 4. Histórico de pares (últimos 7 dias)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    
    const { data: pairHistory } = await supabase
      .from(DB.PAIRS)
      .select('id, phone_1, phone_2, messages_sent, messages_total, status, created_at')
      .or(`phone_1.eq.${phoneNumber},phone_2.eq.${phoneNumber}`)
      .gte('created_at', sevenDaysAgo)
      .order('created_at', { ascending: false })
      .limit(50);

    // 5. Calcular métricas
    const logs = last24hLogs || [];
    const pairs = pairHistory || [];

    const messagesSent = logs.filter(l => l.event_type === 'heartbeat').length;
    const validationSuccesses = logs.filter(l => l.event_type === 'validation_success').length;
    const validationFailures = logs.filter(l => l.event_type === 'validation_failed').length;
    const successRate = validationSuccesses + validationFailures > 0 
      ? Math.round((validationSuccesses / (validationSuccesses + validationFailures)) * 100)
      : 0;

    // Taxa de resposta (mensagens bem sucedidas / tentativas)
    let responseRate = 0;
    if (pairs.length > 0) {
      const totalAttempted = pairs.reduce((sum, p) => sum + (p.messages_total || 0), 0);
      const totalSent = pairs.reduce((sum, p) => sum + (p.messages_sent || 0), 0);
      responseRate = totalAttempted > 0 ? Math.round((totalSent / totalAttempted) * 100) : 0;
    }

    // 6. Determinar fase (Frio/Aquecimento/Consolidação/Estabilização)
    let phase = 'Frio';
    if (daysSinceCreation <= 7) phase = 'Frio';
    else if (daysSinceCreation <= 21) phase = 'Aquecimento';
    else if (daysSinceCreation <= 45) phase = 'Consolidação';
    else phase = 'Estabilização';

    // 7. Calcular score (0-100)
    let score = 50; // Base
    score += Math.min(30, daysSinceCreation * 0.5); // Idade contribui
    score += Math.min(20, successRate * 0.2); // Taxa de sucesso
    score = Math.min(100, Math.max(0, score));

    // 8. Gerar alertas
    const alerts = [];
    
    if (successRate < 50) {
      alerts.push({
        severity: 'high',
        emoji: '⚠️',
        title: 'Taxa de sucesso baixa',
        message: `${successRate}% - Considere pausar por algumas horas`,
      });
    }

    if (daysSinceCreation < 3) {
      alerts.push({
        severity: 'info',
        emoji: 'ℹ️',
        title: 'Número novo',
        message: 'Mantenha uso normal e consistente nos próximos dias',
      });
    }

    if (pairs.length === 0 && daysSinceCreation > 1) {
      alerts.push({
        severity: 'medium',
        emoji: '🔍',
        title: 'Sem pares conectados',
        message: 'Verifique a conexão e tente novamente',
      });
    }

    // Detectar pico de atividade (mais de 30 mensagens em 1h)
    const lastHour = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const lastHourMessages = logs.filter(l => l.created_at >= lastHour && l.event_type === 'heartbeat').length;
    if (lastHourMessages > 30) {
      alerts.push({
        severity: 'medium',
        emoji: '📈',
        title: 'Pico de atividade detectado',
        message: `${lastHourMessages} mensagens na última hora - reduza a intensidade`,
      });
    }

    // 9. Recomendações
    const recommendations = [];
    
    if (daysSinceCreation < 7) {
      recommendations.push('Priorize uso normal com conversas reais');
      recommendations.push('Evite disparos em massa');
    } else if (daysSinceCreation < 21) {
      recommendations.push('Aumente atividade gradualmente');
      recommendations.push('Mantenha padrão consistente');
    } else {
      recommendations.push('Continue com padrão estável');
      recommendations.push('Não é necessário aumentar volume');
    }

    if (responseRate > 80) {
      recommendations.push('Excelente taxa de resposta - mantenha assim');
    }

    return jsonOk({
      ok: true,
      number: {
        phone: phoneNumber,
        status: number.status,
        created_at: number.created_at,
        days_old: daysSinceCreation,
      },
      health: {
        score,
        phase,
        status: score >= 70 ? 'Saudável' : score >= 50 ? 'Normal' : 'Crítico',
        status_emoji: score >= 70 ? '🟢' : score >= 50 ? '🟡' : '🔴',
      },
      metrics: {
        messages_last_24h: messagesSent,
        validations_success: validationSuccesses,
        validations_failed: validationFailures,
        success_rate: successRate,
        response_rate: responseRate,
        pairs_total: pairs.length,
      },
      alerts: alerts.sort((a, b) => {
        const severity = { high: 0, medium: 1, info: 2 };
        return severity[a.severity] - severity[b.severity];
      }),
      recommendations,
      pair_history: pairs.slice(0, 10).map(p => ({
        pair: `${p.phone_1.slice(-4)} ↔ ${p.phone_2.slice(-4)}`,
        messages: `${p.messages_sent}/${p.messages_total}`,
        status: p.status,
        time: new Date(p.created_at).toLocaleTimeString('pt-BR'),
      })),
    });
  } catch (error) {
    console.error('[admin/maturation/health] erro:', error);
    return jsonError('Erro ao analisar saúde', 500);
  }
}
