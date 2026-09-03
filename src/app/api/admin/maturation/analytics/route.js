// ============================================================
// GET /api/admin/maturation/analytics
// ============================================================
// Retorna dados agregados pra gráficos e análises
// Sucesso por hora, atividade por dia, padrões, etc

import { readAdminSession } from '@/lib/admin.js';
import { tryGetSupabaseAdmin, DB } from '@/lib/supabase.js';
import { jsonOk, jsonError } from '@/lib/http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const session = await readAdminSession();
  if (!session) {
    return jsonError('Não autorizado', 401);
  }

  const url = new URL(request.url);
  const range = url.searchParams.get('range') || '24h'; // 24h, 7d, 30d
  const phone = url.searchParams.get('phone'); // Opcional: filtrar por número

  const supabase = tryGetSupabaseAdmin();
  if (!supabase) {
    return jsonError('Supabase não configurado', 500);
  }

  try {
    // Calcular período
    let daysBack = 1;
    if (range === '7d') daysBack = 7;
    else if (range === '30d') daysBack = 30;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);
    startDate.setHours(0, 0, 0, 0);

    // 1. Buscar logs do período
    let query = supabase
      .from(DB.LOGS)
      .select('id, event_type, metadata, created_at')
      .gte('created_at', startDate.toISOString())
      .in('event_type', ['validation_success', 'validation_failed', 'heartbeat', 'session_started']);

    if (phone) {
      query = query.eq('metadata->>phone_number', phone);
    }

    const { data: logs } = await query;
    const logsList = logs || [];

    // 2. Agregar por hora (últimas 24h)
    const hourlyData = {};
    const now = new Date();

    for (let i = 0; i < 24; i++) {
      const hour = new Date(now);
      hour.setHours(now.getHours() - i, 0, 0, 0);
      const hourKey = hour.toISOString().slice(0, 13); // "2026-09-03T12"

      hourlyData[hourKey] = {
        hour: hour.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        success: 0,
        failed: 0,
        messages: 0,
        sessions: 0,
      };
    }

    logsList.forEach(log => {
      const logHour = log.created_at.slice(0, 13);
      if (hourlyData[logHour]) {
        if (log.event_type === 'validation_success') hourlyData[logHour].success++;
        else if (log.event_type === 'validation_failed') hourlyData[logHour].failed++;
        else if (log.event_type === 'heartbeat') hourlyData[logHour].messages++;
        else if (log.event_type === 'session_started') hourlyData[logHour].sessions++;
      }
    });

    const hourlyArray = Object.values(hourlyData).reverse();

    // 3. Taxa de sucesso por hora
    const successRateHourly = hourlyArray.map(h => ({
      hour: h.hour,
      rate: h.success + h.failed > 0 ? Math.round((h.success / (h.success + h.failed)) * 100) : 0,
    }));

    // 4. Atividade total por dia (últimos 7 dias)
    const dailyData = {};

    for (let i = 0; i < 7; i++) {
      const day = new Date(now);
      day.setDate(day.getDate() - i);
      day.setHours(0, 0, 0, 0);
      const dayKey = day.toISOString().slice(0, 10); // "2026-09-03"

      dailyData[dayKey] = {
        date: day.toLocaleDateString('pt-BR', { weekday: 'short', month: 'short', day: 'numeric' }),
        messages: 0,
        validations: 0,
        sessions: 0,
      };
    }

    logsList.forEach(log => {
      const logDay = log.created_at.slice(0, 10);
      if (dailyData[logDay]) {
        if (log.event_type === 'heartbeat') dailyData[logDay].messages++;
        else if (log.event_type.includes('validation')) dailyData[logDay].validations++;
        else if (log.event_type === 'session_started') dailyData[logDay].sessions++;
      }
    });

    const dailyArray = Object.values(dailyData).reverse();

    // 5. Resumo geral
    const summary = {
      total_validations: logsList.filter(l => l.event_type.includes('validation')).length,
      success_validations: logsList.filter(l => l.event_type === 'validation_success').length,
      failed_validations: logsList.filter(l => l.event_type === 'validation_failed').length,
      total_messages: logsList.filter(l => l.event_type === 'heartbeat').length,
      total_sessions: logsList.filter(l => l.event_type === 'session_started').length,
      success_rate: 0,
    };

    if (summary.total_validations > 0) {
      summary.success_rate = Math.round((summary.success_validations / summary.total_validations) * 100);
    }

    // 6. Distribuição por hora do dia (melhor horário)
    const hoursDistribution = {};
    logsList.forEach(log => {
      const hour = new Date(log.created_at).getHours();
      if (!hoursDistribution[hour]) {
        hoursDistribution[hour] = { hour: `${String(hour).padStart(2, '0')}:00`, count: 0 };
      }
      hoursDistribution[hour].count++;
    });

    const bestHours = Object.values(hoursDistribution)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    return jsonOk({
      ok: true,
      range,
      summary,
      hourly: hourlyArray,
      successRateHourly,
      daily: dailyArray,
      bestHours,
    });
  } catch (error) {
    console.error('[admin/maturation/analytics] erro:', error);
    return jsonError('Erro ao gerar analytics', 500);
  }
}
