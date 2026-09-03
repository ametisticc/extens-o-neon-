/* ============================================================
 *  TESTES — Integração Neon Zap com Painel
 *  Execute no console da extensão (DevTools do Service Worker)
 * ============================================================ */

// 1. Testar Geração de Token
async function testarTokenGerado() {
  console.log('🔐 Testando geração de Bearer Token...');
  
  const stored = await chrome.storage.local.get(['bearerToken']);
  if (stored.bearerToken) {
    console.log('✅ Token encontrado:', stored.bearerToken.substring(0, 20) + '...');
    return true;
  }
  
  console.log('❌ Nenhum token encontrado no storage');
  return false;
}

// 2. Testar Sincronização
async function testarSincronizacao() {
  console.log('⚡ Testando sincronização com painel...');
  
  try {
    const s = await getState();
    console.log('📊 Estado da Extensão:');
    console.log('  - Fila:', s.fila.length);
    console.log('  - Espera:', s.espera.length);
    console.log('  - Enviadas hoje:', s.stats.enviadasHoje);
    console.log('  - Campanhas ativas:', Object.keys(s.campanhas).length);
    
    // Tentar sincronizar
    if (window.NeonZapPainel) {
      await window.NeonZapPainel.sincronizar();
      console.log('✅ Sincronização enviada ao painel');
      return true;
    } else {
      console.log('❌ Integração com painel não iniciada');
      return false;
    }
  } catch (e) {
    console.error('❌ Erro ao sincronizar:', e);
    return false;
  }
}

// 3. Testar WebSocket
function testarWebSocket() {
  console.log('🔌 Testando WebSocket...');
  
  if (window.NeonZapPainel) {
    window.NeonZapPainel.conectarWS();
    console.log('✅ Comando de conexão WebSocket enviado');
    console.log('Aguarde alguns segundos e verifique os logs de conexão...');
    return true;
  } else {
    console.log('❌ Integração com painel não disponível');
    return false;
  }
}

// 4. Testar Pausa/Retomada
async function testarPausa() {
  console.log('⏸️  Testando pausa da maturação...');
  
  if (window.NeonZapPainel) {
    await window.NeonZapPainel.pausar();
    console.log('✅ Maturação pausada');
    
    // Aguardar 2 segundos
    await new Promise(r => setTimeout(r, 2000));
    
    await window.NeonZapPainel.retomar();
    console.log('✅ Maturação retomada');
    return true;
  } else {
    console.log('❌ Integração com painel não disponível');
    return false;
  }
}

// 5. Testar Adição de Contato
async function testarAdicionarContato() {
  console.log('📞 Testando adição de contato à fila...');
  
  if (window.NeonZapPainel) {
    await window.NeonZapPainel.adicionarContato({
      numero: '5511999999999',
      nome: 'Teste Painel',
      campaignId: 'test'
    });
    console.log('✅ Contato adicionado');
    
    const s = await getState();
    console.log('Fila agora contém:', s.fila.length, 'itens');
    return true;
  } else {
    console.log('❌ Integração com painel não disponível');
    return false;
  }
}

// 6. Testar Limpeza de Fila
async function testarLimparFila() {
  console.log('🗑️  Testando limpeza de fila...');
  
  if (window.NeonZapPainel) {
    await window.NeonZapPainel.limparFila();
    console.log('✅ Fila limpa');
    
    const s = await getState();
    console.log('Fila agora contém:', s.fila.length, 'itens');
    return true;
  } else {
    console.log('❌ Integração com painel não disponível');
    return false;
  }
}

// 7. Teste Completo
async function rodarTudoTestes() {
  console.clear();
  console.log('🚀 =========== TESTES COMPLETOS ===========');
  console.log('Timestamp:', new Date().toISOString());
  console.log('');
  
  const resultados = {};
  
  // 1. Token
  console.log('📝 [1/7] Testando Token...');
  resultados.token = await testarTokenGerado();
  console.log('');
  
  // 2. Sincronização
  console.log('📝 [2/7] Testando Sincronização...');
  resultados.sync = await testarSincronizacao();
  console.log('');
  
  // 3. WebSocket
  console.log('📝 [3/7] Testando WebSocket...');
  resultados.ws = testarWebSocket();
  console.log('');
  
  // 4. Pausa
  console.log('📝 [4/7] Testando Pausa/Retomada...');
  resultados.pause = await testarPausa();
  console.log('');
  
  // 5. Adicionar Contato
  console.log('📝 [5/7] Testando Adição de Contato...');
  resultados.addContact = await testarAdicionarContato();
  console.log('');
  
  // 6. Limpar Fila
  console.log('📝 [6/7] Testando Limpeza de Fila...');
  resultados.clearQueue = await testarLimparFila();
  console.log('');
  
  // 7. Verificar Atividades
  console.log('📝 [7/7] Verificando Atividades...');
  const s = await getState();
  console.log('✅ Total de atividades registradas:', s.atividades.length);
  console.log('Últimas 5 atividades:');
  s.atividades.slice(0, 5).forEach((a, i) => {
    console.log(`  ${i+1}. [${a.tipo}] ${a.texto}`);
  });
  resultados.activities = true;
  console.log('');
  
  // Resumo
  console.log('=========== RESUMO DOS TESTES ===========');
  const passou = Object.values(resultados).filter(r => r === true).length;
  const total = Object.values(resultados).length;
  console.log(`✅ Passaram: ${passou}/${total}`);
  console.log('');
  
  console.log('Detalhes:');
  Object.entries(resultados).forEach(([nome, resultado]) => {
    const status = resultado ? '✅' : '❌';
    console.log(`  ${status} ${nome}`);
  });
  
  console.log('');
  console.log('=========== FIM DOS TESTES ===========');
}

// 8. Monitorar Sincronizações em Tempo Real
function monitorarSincronizacoes(duracao = 30000) {
  console.log(`📡 Monitorando sincronizações por ${duracao/1000}s...`);
  
  let count = 0;
  const monitor = setInterval(async () => {
    count++;
    const s = await getState();
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] Sync #${count} - Fila: ${s.fila.length}, Espera: ${s.espera.length}, Hoje: ${s.stats.enviadasHoje}`);
  }, 5000);
  
  setTimeout(() => {
    clearInterval(monitor);
    console.log(`✅ Monitoramento finalizado (${count} sincronizações)`);
  }, duracao);
}

// ========== INSTRUÇÕES ==========
console.log(`
╔════════════════════════════════════════════════╗
║  TESTES — Integração Neon Zap com Painel      ║
╚════════════════════════════════════════════════╝

Execute no console do Service Worker:

1. Teste Simples de Token:
   > testarTokenGerado()

2. Teste de Sincronização:
   > testarSincronizacao()

3. Teste de WebSocket:
   > testarWebSocket()

4. Teste de Pausa:
   > testarPausa()

5. Teste de Contato:
   > testarAdicionarContato()

6. Teste de Limpeza:
   > testarLimparFila()

7. TODOS OS TESTES:
   > rodarTudoTestes()

8. Monitorar Sincronizações (30s):
   > monitorarSincronizacoes()

Dica: Use Ctrl+Shift+J para abrir o console do DevTools
`);
