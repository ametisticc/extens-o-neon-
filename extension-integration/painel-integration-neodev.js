/* ============================================================
 *  NEON DEV — Integração com Painel Admin na Vercel v2.0
 *  Controla maturação via Bearer Tokens e WebSocket
 *  Sincroniza status e recebe comandos em tempo real
 * ============================================================ */

'use strict';

const PANEL_CONFIG = {
  baseUrl: 'https://extens-o-neons.vercel.app',
  apiUrl: 'https://extens-o-neons.vercel.app/api/admin/maturation',
  wsUrl: 'wss://extens-o-neons.vercel.app/api/admin/maturation/live',
  bearerToken: '', // será carregado do storage
  extensionId: 'neon-dev-v1.0.4',
  syncInterval: 5000 // sincronizar a cada 5 segundos
};

let wsConnection = null;
let lastSyncTime = 0;
let isExtensionPaused = false;
let maturationStats = {
  filaTamanho: 0,
  esperaTamanho: 0,
  enviadasHoje: 0,
  limiteDiario: 0,
  emJanela: true,
  waConectado: false,
  campanhasAtivas: 0,
  atividades: []
};

/* =================== Bearer Token =================== */
async function carregarBearerToken() {
  const stored = await chrome.storage.local.get(['bearerToken']);
  if (stored.bearerToken) {
    PANEL_CONFIG.bearerToken = stored.bearerToken;
    return true;
  }
  return false;
}

async function obterDeviceId() {
  let deviceId = await chrome.storage.local.get(['deviceId']);
  if (!deviceId.deviceId) {
    deviceId.deviceId = `device-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    await chrome.storage.local.set({ deviceId: deviceId.deviceId });
  }
  return deviceId.deviceId;
}

/* =================== Sincronização com Painel =================== */
async function sincronizarComPainel() {
  if (!PANEL_CONFIG.bearerToken) {
    if (!await carregarBearerToken()) {
      return; // Sem token, não sincroniza
    }
  }

  const agora = new Date();
  const deviceId = await obterDeviceId();
  const cfg = await getConfig();

  const dados = {
    extension_id: PANEL_CONFIG.extensionId,
    device_id: deviceId,
    status: isExtensionPaused ? 'paused' : 'active',
    fila_tamanho: maturationStats.filaTamanho,
    espera_tamanho: maturationStats.esperaTamanho,
    enviadas_hoje: maturationStats.enviadasHoje,
    limit_diario: maturationStats.limiteDiario,
    em_janela: maturationStats.emJanela,
    wa_conectado: maturationStats.waConectado,
    campanhas_ativas: maturationStats.campanhasAtivas,
    atividades_recentes: maturationStats.atividades.slice(0, 10),
    timestamp: agora.toISOString()
  };

  try {
    const response = await fetch(`${PANEL_CONFIG.apiUrl}/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PANEL_CONFIG.bearerToken}`
      },
      body: JSON.stringify(dados)
    });

    if (!response.ok && response.status === 401) {
      // Token expirado, limpa
      await chrome.storage.local.remove(['bearerToken']);
      PANEL_CONFIG.bearerToken = '';
      return;
    }

    if (response.ok) {
      lastSyncTime = Date.now();
      
      // Processa comandos do painel
      const resposta = await response.json();
      await processarComandosDoPainel(resposta);

      console.log('[Neon Dev] Sincronização com painel OK', dados);
    }
  } catch (e) {
    console.error('[Neon Dev] Erro ao sincronizar com painel:', e);
  }
}

/* =================== Processar Comandos do Painel =================== */
async function processarComandosDoPainel(resposta) {
  if (!resposta || !resposta.commands) return;

  for (const cmd of resposta.commands) {
    try {
      switch (cmd.type) {
        case 'pause':
          await pausarMaturacao();
          break;
        
        case 'resume':
          await retomarMaturacao();
          break;
        
        case 'stop':
          await pararMaturacao();
          break;
        
        case 'add_contact':
          // Envia mensagem para content script adicionar contato
          await broadcast({ type: 'NEON_ADD_CONTACT', payload: cmd.payload });
          registrarAtividadeIntegracao('info', `Contato adicionado: ${cmd.payload.numero}`);
          break;
        
        case 'update_config':
          await atualizarConfiguracao(cmd.payload);
          break;

        default:
          console.warn(`[Neon Dev] Comando desconhecido: ${cmd.type}`);
      }
    } catch (e) {
      console.error(`[Neon Dev] Erro ao processar comando ${cmd.type}:`, e);
    }
  }
}

/* =================== Comandos de Controle =================== */
async function pausarMaturacao() {
  isExtensionPaused = true;
  await chrome.storage.local.set({ extensionPaused: true });
  await broadcast({ type: 'NEON_PAUSE' });
  registrarAtividadeIntegracao('info', 'Maturação pausada pelo painel');
}

async function retomarMaturacao() {
  isExtensionPaused = false;
  await chrome.storage.local.set({ extensionPaused: false });
  await broadcast({ type: 'NEON_RESUME' });
  registrarAtividadeIntegracao('info', 'Maturação retomada pelo painel');
}

async function pararMaturacao() {
  isExtensionPaused = true;
  await chrome.storage.local.set({ extensionPaused: true });
  await broadcast({ type: 'NEON_STOP' });
  registrarAtividadeIntegracao('info', 'Maturação parada completamente pelo painel');
}

async function atualizarConfiguracao(payload) {
  if (!payload) return;
  
  const cfg = await getConfig();
  
  if (payload.apiKey) cfg.apiKey = payload.apiKey;
  if (payload.extensionId) cfg.extensionId = payload.extensionId;
  
  await saveConfig(cfg);
  registrarAtividadeIntegracao('info', 'Configuração atualizada pelo painel');
}

/* =================== WebSocket Live =================== */
function conectarWebSocket() {
  if (wsConnection && wsConnection.readyState === WebSocket.OPEN) return;

  try {
    wsConnection = new WebSocket(`${PANEL_CONFIG.wsUrl}?token=${PANEL_CONFIG.bearerToken}`);

    wsConnection.onopen = () => {
      console.log('[Neon Dev] WebSocket conectado ao painel');
      registrarAtividadeIntegracao('info', 'WebSocket conectado ao painel');
      
      wsConnection.send(JSON.stringify({
        type: 'register',
        extension_id: PANEL_CONFIG.extensionId,
        device_id: obterDeviceId()
      }));
    };

    wsConnection.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'command') {
          processarComandosDoPainel({ commands: [msg.command] });
        }
      } catch (e) {
        console.error('[Neon Dev] Erro ao processar mensagem WebSocket:', e);
      }
    };

    wsConnection.onerror = (error) => {
      console.error('[Neon Dev] Erro WebSocket:', error);
      registrarAtividadeIntegracao('erro', 'Erro na conexão WebSocket');
    };

    wsConnection.onclose = () => {
      console.log('[Neon Dev] WebSocket desconectado');
      registrarAtividadeIntegracao('info', 'WebSocket desconectado');
      setTimeout(() => conectarWebSocket(), 5000); // reconectar após 5s
    };
  } catch (e) {
    console.error('[Neon Dev] Erro ao conectar WebSocket:', e);
  }
}

/* =================== Atividades =================== */
async function registrarAtividadeIntegracao(tipo, texto) {
  maturationStats.atividades.unshift({
    tipo,
    texto: `[Painel] ${texto}`,
    timestamp: new Date().toISOString()
  });
  
  // Manter apenas as últimas 100
  if (maturationStats.atividades.length > 100) {
    maturationStats.atividades = maturationStats.atividades.slice(0, 100);
  }
}

/* =================== Broadcast para Content Scripts =================== */
async function broadcast(message) {
  try {
    const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
    for (const tab of tabs) {
      try {
        await chrome.tabs.sendMessage(tab.id, message);
      } catch (e) {
        // Aba pode não ter content script injetado
      }
    }
  } catch (e) {
    console.error('[Neon Dev] Erro ao fazer broadcast:', e);
  }
}

/* =================== Atualizar Stats da Maturação =================== */
async function atualizarStatsMaturation() {
  // Pode ser chamado pelos content scripts ou periodicamente
  // Para agora: apenas sincroniza o que temos
  // Futuramente: pode consultar dados da página
  
  const cfg = await getConfig();
  maturationStats.limiteDiario = cfg.limiteDiario || 30;
}

/* =================== Mensagens de Content Script =================== */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;

  // Atualizar stats de maturação
  if (msg.type === 'NEON_UPDATE_STATS') {
    maturationStats = { ...maturationStats, ...msg.stats };
    sendResponse({ ok: true });
    return true;
  }

  // Status da extensão
  if (msg.type === 'NEON_PANEL_STATUS') {
    sendResponse({
      ok: true,
      paused: isExtensionPaused,
      stats: maturationStats,
      panel: PANEL_CONFIG
    });
    return true;
  }

  // Forçar sincronização
  if (msg.type === 'NEON_FORCE_SYNC') {
    sincronizarComPainel();
    sendResponse({ ok: true });
    return true;
  }
});

/* =================== Inicialização =================== */
async function inicializarIntegracao() {
  console.log('[Neon Dev] Inicializando integração com painel...');

  // Carregar token existente
  if (!await carregarBearerToken()) {
    console.log('[Neon Dev] Nenhum token encontrado, aguardando configuração');
  } else {
    console.log('[Neon Dev] Token carregado com sucesso');
    
    // Conectar WebSocket
    conectarWebSocket();

    // Sincronizar imediatamente
    await sincronizarComPainel();

    // Sincronizar periodicamente
    setInterval(() => {
      sincronizarComPainel();
    }, PANEL_CONFIG.syncInterval);

    registrarAtividadeIntegracao('info', 'Integração com painel iniciada');
  }

  // Verificar se extension estava pausada
  const stored = await chrome.storage.local.get(['extensionPaused']);
  isExtensionPaused = !!stored.extensionPaused;
}

/* =================== Iniciar na Instalação =================== */
chrome.runtime.onInstalled.addListener(() => {
  inicializarIntegracao();
});

// Chamar na primeira vez que o background script carrega
(async () => {
  const stored = await chrome.storage.local.get(['panelIntegrationInitialized']);
  if (!stored.panelIntegrationInitialized) {
    await chrome.storage.local.set({ panelIntegrationInitialized: true });
    inicializarIntegracao();
  } else {
    // Apenas reconectar WebSocket
    const hasToken = await carregarBearerToken();
    if (hasToken) {
      conectarWebSocket();
      // Tentar sincronizar
      sincronizarComPainel();
    }
  }
})();

/* =================== Expor para testes =================== */
globalThis.NeonDevPanel = {
  sincronizar: sincronizarComPainel,
  pausar: pausarMaturacao,
  retomar: retomarMaturacao,
  parar: pararMaturacao,
  conectarWS: conectarWebSocket,
  stats: () => maturationStats,
  config: () => PANEL_CONFIG
};

console.log('[Neon Dev] Integração com painel carregada. Use window.NeonDevPanel para testes.');
