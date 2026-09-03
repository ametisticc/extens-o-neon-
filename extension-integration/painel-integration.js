/* ============================================================
 *  NEON ZAP — Integração com Painel Admin na Vercel
 *  Controla maturação via Bearer Tokens e WebSocket
 * ============================================================ */

// Configuração da API do painel
const PANEL_CONFIG = {
  baseUrl: 'https://extens-o-neons.vercel.app',
  apiUrl: 'https://extens-o-neons.vercel.app/api/admin/maturation',
  wsUrl: 'wss://extens-o-neons.vercel.app/api/admin/maturation/live',
  bearerToken: '', // será carregado do storage
  extensionId: chrome.runtime.id, // ID único da extensão
  sincInterval: 5000 // sincronizar a cada 5 segundos
};

let wsConnection = null;
let lastSyncTime = 0;
let isPaused = false; // controle de pausa via painel

/* =================== Bearer Token =================== */
async function carregarBearerToken() {
  const stored = await chrome.storage.local.get(['bearerToken']);
  if (stored.bearerToken) {
    PANEL_CONFIG.bearerToken = stored.bearerToken;
    return true;
  }
  return false;
}

async function gerarNovoToken() {
  try {
    const response = await fetch(`${PANEL_CONFIG.apiUrl}/../auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        extension_id: PANEL_CONFIG.extensionId,
        device_id: await obterDeviceId()
      })
    });

    if (response.ok) {
      const { token } = await response.json();
      await chrome.storage.local.set({ bearerToken: token });
      PANEL_CONFIG.bearerToken = token;
      registrarAtividadeIntegracao('sucesso', 'Bearer Token gerado');
      return true;
    }
  } catch (e) {
    registrarAtividadeIntegracao('erro', `Falha ao gerar token: ${e.message}`);
  }
  return false;
}

/* =================== Device ID =================== */
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
      if (!await gerarNovoToken()) return;
    }
  }

  const s = await getState();
  const agora = new Date();

  const dados = {
    extension_id: PANEL_CONFIG.extensionId,
    device_id: await obterDeviceId(),
    status: isPaused ? 'paused' : 'active',
    fila_tamanho: s.fila.length,
    espera_tamanho: s.espera.length,
    enviadas_hoje: s.stats.enviadasHoje,
    limit_diario: s.cfg.limiteDiario,
    em_janela: dentroDaJanela(s.cfg),
    wa_conectado: !!s.waConectado,
    campanhas_ativas: Object.keys(s.campanhas).length,
    atividades_recentes: s.atividades.slice(0, 10),
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
      // Token expirado, gera um novo
      await gerarNovoToken();
      return sincronizarComPainel();
    }

    if (response.ok) {
      lastSyncTime = Date.now();
      
      // Processa comandos do painel
      const resposta = await response.json();
      await processarComandosDoPainel(resposta);
    }
  } catch (e) {
    console.error('[Neon Zap] Erro ao sincronizar com painel:', e);
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
          await retomar Maturacao();
          break;
        
        case 'add_contact':
          await adicionarContatoFila(cmd.payload);
          break;
        
        case 'clear_queue':
          await limparFila();
          break;
        
        case 'update_config':
          await atualizarConfiguracao(cmd.payload);
          break;
        
        case 'stop':
          await pararMaturacao();
          break;

        default:
          console.warn(`[Neon Zap] Comando desconhecido: ${cmd.type}`);
      }
    } catch (e) {
      console.error(`[Neon Zap] Erro ao processar comando ${cmd.type}:`, e);
    }
  }
}

/* =================== Comandos de Controle =================== */
async function pausarMaturacao() {
  isPaused = true;
  await chrome.storage.local.set({ extensionPaused: true });
  registrarAtividadeIntegracao('info', 'Maturação pausada pelo painel');
}

async function retomarMaturacao() {
  isPaused = false;
  await chrome.storage.local.set({ extensionPaused: false });
  registrarAtividadeIntegracao('info', 'Maturação retomada pelo painel');
  enviarFila(); // reinicia a fila
}

async function pararMaturacao() {
  isPaused = true;
  const s = await getState();
  s.fila = [];
  s.espera = [];
  await setState({ fila: [], espera: [], extensionPaused: true });
  registrarAtividadeIntegracao('info', 'Maturação parada completamente pelo painel');
}

async function limparFila() {
  const s = await getState();
  s.fila = [];
  await setState({ fila: [] });
  registrarAtividadeIntegracao('info', 'Fila limpa pelo painel');
}

async function adicionarContatoFila(payload) {
  if (!payload || !payload.numero) return;
  
  const s = await getState();
  const novoItem = {
    campanhaId: payload.campaignId || 'painel',
    contato: {
      numero: payload.numero,
      nome: payload.nome || 'Contato do Painel'
    },
    passoIndex: 0,
    criadoEm: agora()
  };

  s.fila.push(novoItem);
  await setState({ fila: s.fila });
  registrarAtividadeIntegracao('info', `Contato adicionado: ${payload.numero}`);
  enviarFila();
}

async function atualizarConfiguracao(payload) {
  if (!payload) return;
  
  const s = await getState();
  const cfg = s.cfg;

  if (payload.ritmo_min !== undefined) cfg.ritmo.min = payload.ritmo_min;
  if (payload.ritmo_max !== undefined) cfg.ritmo.max = payload.ritmo_max;
  if (payload.limite_diario !== undefined) cfg.limiteDiario = payload.limite_diario;
  if (payload.janela_inicio !== undefined) cfg.janela.inicio = payload.janela_inicio;
  if (payload.janela_fim !== undefined) cfg.janela.fim = payload.janela_fim;

  await setState({ cfg });
  registrarAtividadeIntegracao('info', 'Configuração atualizada pelo painel');
}

/* =================== WebSocket Live =================== */
function conectarWebSocket() {
  if (wsConnection && wsConnection.readyState === WebSocket.OPEN) return;

  try {
    wsConnection = new WebSocket(`${PANEL_CONFIG.wsUrl}?token=${PANEL_CONFIG.bearerToken}`);

    wsConnection.onopen = () => {
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
        console.error('[Neon Zap] Erro ao processar mensagem WebSocket:', e);
      }
    };

    wsConnection.onerror = (error) => {
      console.error('[Neon Zap] Erro WebSocket:', error);
      registrarAtividadeIntegracao('erro', 'Erro na conexão WebSocket');
    };

    wsConnection.onclose = () => {
      registrarAtividadeIntegracao('info', 'WebSocket desconectado');
      setTimeout(() => conectarWebSocket(), 5000); // reconectar após 5s
    };
  } catch (e) {
    console.error('[Neon Zap] Erro ao conectar WebSocket:', e);
  }
}

/* =================== Atividades de Integração =================== */
async function registrarAtividadeIntegracao(tipo, texto) {
  const s = await getState();
  registrarAtividade(s, tipo, `[Painel] ${texto}`, 100);
  await setState({ atividades: s.atividades });
}

/* =================== Inicialização =================== */
async function inicializarIntegracao() {
  // Carregar token existente ou gerar novo
  if (!await carregarBearerToken()) {
    await gerarNovoToken();
  }

  // Conectar WebSocket
  conectarWebSocket();

  // Sincronizar a cada 5 segundos
  setInterval(() => {
    sincronizarComPainel();
  }, PANEL_CONFIG.sincInterval);

  // Sincronizar imediatamente
  sincronizarComPainel();

  registrarAtividadeIntegracao('info', 'Integração com painel iniciada');
}

/* =================== Iniciar na Startup =================== */
chrome.runtime.onInstalled.addListener(() => {
  inicializarIntegracao();
});

chrome.runtime.onStartup.addListener(() => {
  inicializarIntegracao();
});

// Chamar na primeira vez que o background script carrega
(async () => {
  const stored = await chrome.storage.local.get(['integracaoInicializada']);
  if (!stored.integracaoInicializada) {
    await chrome.storage.local.set({ integracaoInicializada: true });
    inicializarIntegracao();
  } else {
    // Reconectar WebSocket se já foi inicializado
    conectarWebSocket();
  }
})();

/* =================== Expor para testes =================== */
window.NeonZapPainel = {
  sincronizar: sincronizarComPainel,
  pausar: pausarMaturacao,
  retomar: retomarMaturacao,
  parar: pararMaturacao,
  adicionarContato: adicionarContatoFila,
  limparFila: limparFila,
  conectarWS: conectarWebSocket
};
