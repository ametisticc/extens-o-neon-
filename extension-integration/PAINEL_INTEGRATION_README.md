## 🚀 Integração Neon Zap com Painel Admin

Esta extensão Chrome agora está conectada ao painel de controle na Vercel!

### ✅ O que foi implementado

1. **Bearer Token Security** 🔐
   - Geração automática de tokens seguros
   - Tokens expiram em 7 dias e são renovados automaticamente
   - Sem exposição de chaves hardcoded

2. **Sincronização em Tempo Real** ⚡
   - Sincroniza status a cada 5 segundos
   - WebSocket para comunicação bidirecional
   - Reconexão automática

3. **Controle via Painel** 🎮
   - Iniciar/Parar maturação
   - Pausar/Retomar
   - Adicionar contatos à fila
   - Limpar fila
   - Atualizar configurações (ritmo, limite, janela)

4. **Logging e Atividades** 📋
   - Todas as ações registradas
   - Visíveis no painel admin
   - Histórico de até 100 eventos

---

### 📋 Como Usar

#### 1. **Instalar a Extensão**
```bash
1. Abra chrome://extensions/
2. Ative "Modo de desenvolvedor"
3. Clique "Carregar extensão sem compactação"
4. Selecione a pasta neon-zap-extension/
```

#### 2. **Acessar o Painel Admin**
```
https://extens-o-neons.vercel.app/admin/maturation
```

#### 3. **Primeiro Acesso**
- A extensão gerará automaticamente um Bearer Token
- Token será armazenado no storage local da extensão
- Não precisa de configuração manual

#### 4. **Controlar via Painel**
- Dashboard mostra status em tempo real
- Clique "Iniciar" para começar maturação
- Clique "Parar" para pausar
- Use agendamentos para disparos automáticos

---

### 🔧 Configuração

As seguintes variáveis podem ser customizadas no `painel-integration.js`:

```javascript
const PANEL_CONFIG = {
  baseUrl: 'https://extens-o-neons.vercel.app',
  apiUrl: 'https://extens-o-neons.vercel.app/api/admin/maturation',
  wsUrl: 'wss://extens-o-neons.vercel.app/api/admin/maturation/live',
  sincInterval: 5000 // 5 segundos
};
```

---

### 📊 Status Sincronizado

A extensão envia para o painel:

```json
{
  "extension_id": "abc123...",
  "device_id": "device-1234567890",
  "status": "active|paused",
  "fila_tamanho": 0,
  "espera_tamanho": 0,
  "enviadas_hoje": 0,
  "limit_diario": 30,
  "em_janela": true,
  "wa_conectado": true,
  "campanhas_ativas": 0,
  "atividades_recentes": [],
  "timestamp": "2026-09-03T13:52:45.025Z"
}
```

---

### 🎯 Comandos Suportados

O painel pode enviar os seguintes comandos:

| Comando | Descrição |
|---------|-----------|
| `pause` | Pausa a maturação |
| `resume` | Retoma a maturação |
| `stop` | Para completamente |
| `add_contact` | Adiciona contato à fila |
| `clear_queue` | Limpa a fila |
| `update_config` | Atualiza configurações |

---

### 🔐 Segurança

- ✅ Bearer Tokens com Hash
- ✅ HTTPS obrigatório
- ✅ WebSocket seguro (WSS)
- ✅ Sem exposição de tokens no código
- ✅ Validação de comandos

---

### 🐛 Troubleshooting

#### Token não foi gerado
- Verifique se a extensão tem permissão de storage
- Verifique conexão com internet
- Confira se a URL do painel está correta

#### WebSocket não conecta
- Verifique se você tem acesso ao painel
- Confira o token Bearer
- Verifique o console do DevTools

#### Comandos não funcionam
- Verifique o status no painel
- Confira os logs de atividade
- Verifique se a extensão está em modo "active"

---

### 📝 Logs de Debug

Abra o console do DevTools da extensão:
1. `chrome://extensions/`
2. Encontre "Neon Zap"
3. Clique em "service worker" → abre DevTools
4. Veja os logs em tempo real

Ou acesse os logs via:
```javascript
// No console da extensão
window.NeonZapPainel.sincronizar() // força sincronização
```

---

### 📦 Arquivos

- `background.js` - Motor principal da extensão
- `content.js` - Script injetado no WhatsApp Web
- `painel-integration.js` - **NOVO** - Integração com painel
- `manifest.json` - Configuração da extensão
- `popup/` - Interface do popup

---

### 🚀 Próximos Passos

1. **Testar integração**
   - Instale a extensão
   - Acesse o painel
   - Tente iniciar/parar

2. **Monitorar em produção**
   - Verifique logs do painel
   - Acompanhe sincronizações
   - Teste agendamentos

3. **Otimizações futuras**
   - Cache de tokens
   - Offline mode
   - Multi-dispositivo

---

### 💡 Dicas

- A extensão sincroniza automaticamente a cada 5 segundos
- Não precisa recarregar o painel para ver atualizações
- WebSocket fornece atualizações em tempo real
- Todos os comandos são logados para auditoria

---

**Versão:** 2.0 com Painel Integration  
**Última atualização:** 03/09/2026
