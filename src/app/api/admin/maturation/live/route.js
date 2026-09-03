// ============================================================
// WebSocket: GET /api/admin/maturation/live
// ============================================================
// Stream de eventos em tempo real via WebSocket
// Cliente conecta uma vez, recebe eventos continuamente
// Eventos: session_started, validation, pair_update, alert, etc

import { readAdminSession } from '@/lib/admin.js';
import { tryGetSupabaseAdmin, DB } from '@/lib/supabase.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Store de conexões WebSocket ativas
const activeConnections = new Map();

/**
 * Broadcast um evento para todos os clientes conectados
 * @param {object} event - { type, data, timestamp }
 */
export function broadcastEvent(event) {
  const message = JSON.stringify({
    ...event,
    timestamp: new Date().toISOString(),
  });

  activeConnections.forEach((ws, clientId) => {
    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      } else {
        activeConnections.delete(clientId);
      }
    } catch (error) {
      console.error(`[ws] erro ao enviar para ${clientId}:`, error);
      activeConnections.delete(clientId);
    }
  });
}

/**
 * Middleware para autenticar WebSocket
 */
async function authenticateWS(request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return { ok: false, reason: 'token ausente' };
  }

  // TODO: Validar token do admin (usar JWT ou sessão)
  // Por enquanto, vamos usar a sessão existente

  return { ok: true };
}

export async function GET(request) {
  const auth = await authenticateWS(request);
  if (!auth.ok) {
    return new Response(JSON.stringify({ error: auth.reason }), { status: 401 });
  }

  // Verifica se é uma requisição de upgrade (WebSocket)
  if (request.headers.get('upgrade') !== 'websocket') {
    return new Response('Esperado upgrade WebSocket', { status: 400 });
  }

  // Node.js com WebSocket nativo (v21+)
  const { WebSocketPair } = require('node:net');

  try {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    const clientId = `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    activeConnections.set(clientId, server);

    console.log(`[ws] cliente ${clientId} conectado. Total: ${activeConnections.size}`);

    server.addEventListener('message', async (event) => {
      try {
        const data = JSON.parse(event.data);

        // Tipos de mensagem que o cliente pode enviar
        if (data.type === 'ping') {
          server.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
        } else if (data.type === 'filter') {
          // Cliente quer filtrar por tipo de evento
          // TODO: Implementar filtros personalizados
        }
      } catch (error) {
        console.error(`[ws] erro ao processar mensagem:`, error);
      }
    });

    server.addEventListener('close', () => {
      activeConnections.delete(clientId);
      console.log(`[ws] cliente ${clientId} desconectado. Total: ${activeConnections.size}`);
    });

    // Enviar primeira mensagem de boas-vindas
    server.send(JSON.stringify({
      type: 'connected',
      message: 'Conectado ao stream de eventos',
      client_id: clientId,
      timestamp: new Date().toISOString(),
    }));

    // Manter conexão aberta
    return new Response(null, {
      status: 101,
      statusText: 'Switching Protocols',
      headers: {
        Upgrade: 'websocket',
        Connection: 'Upgrade',
      },
    });
   } catch (error) {
     console.error('[ws] erro ao criar WebSocket:', error);
     return new Response(JSON.stringify({ error: 'Falha ao conectar' }), { status: 500 });
   }
}
