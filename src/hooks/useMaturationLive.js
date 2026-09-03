// ============================================================
// Hook: useMaturationLive
// ============================================================
// Conecta ao WebSocket e gerencia eventos de maturação em tempo real

import { useEffect, useState, useCallback, useRef } from 'react';

/**
 * Hook para conectar ao stream de eventos em tempo real
 * @param {object} options - { onEvent, autoReconnect, maxRetries }
 * @returns { connected, events, error, disconnect }
 */
export function useMaturationLive(options = {}) {
  const { onEvent, autoReconnect = true, maxRetries = 5 } = options;

  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(null);
  const wsRef = useRef(null);
  const retriesRef = useRef(0);
  const reconnectTimeoutRef = useRef(null);

  // Conectar ao WebSocket
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return; // Já conectado
    }

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${protocol}//${window.location.host}/api/admin/maturation/live`;

      wsRef.current = new WebSocket(url);

      wsRef.current.onopen = () => {
        console.log('[ws] conectado');
        setConnected(true);
        setError(null);
        retriesRef.current = 0;
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Adicionar à lista de eventos (últimos 100)
          setEvents(prev => [data, ...prev].slice(0, 100));

          // Callback customizado
          if (onEvent) {
            onEvent(data);
          }
        } catch (err) {
          console.error('[ws] erro ao parsear:', err);
        }
      };

      wsRef.current.onerror = (err) => {
        console.error('[ws] erro:', err);
        setError('Erro na conexão WebSocket');
        setConnected(false);
      };

      wsRef.current.onclose = () => {
        console.log('[ws] desconectado');
        setConnected(false);

        // Tentar reconectar
        if (autoReconnect && retriesRef.current < maxRetries) {
          retriesRef.current++;
          const delay = Math.min(1000 * Math.pow(2, retriesRef.current), 30000);
          console.log(`[ws] tentando reconectar em ${delay}ms (tentativa ${retriesRef.current})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        }
      };
    } catch (err) {
      console.error('[ws] erro ao conectar:', err);
      setError(err.message);
    }
  }, [onEvent, autoReconnect, maxRetries]);

  // Desconectar
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
    retriesRef.current = maxRetries; // Evitar reconectar
  }, [maxRetries]);

  // Conectar ao montar
  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  // Enviar mensagem (ping, filters, etc)
  const send = useCallback((message) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  return {
    connected,
    events,
    error,
    disconnect,
    send,
  };
}
