## 🔗 Guia de Integração: Extensão Chrome ↔ Painel Admin

**Status:** ✅ Pronto para Implementação  
**Data:** 03/09/2026  
**Versão:** 2.0

---

## 📋 O que foi feito

### ✅ Arquivos Criados

1. **painel-integration.js** - Motor de integração
   - Geração e gerenciamento de Bearer Tokens
   - Sincronização com painel a cada 5 segundos
   - WebSocket para comunicação em tempo real
   - Processamento de comandos do painel

2. **PAINEL_INTEGRATION_README.md** - Documentação completa
   - Como instalar
   - Como usar
   - Configuração
   - Troubleshooting

3. **TESTES_INTEGRACAO.js** - Suite de testes
   - Testes de token
   - Testes de sincronização
   - Testes de WebSocket
   - Testes de comandos

### ✅ Arquivos Atualizados

1. **manifest.json** (neon-zap-extension)
   - Adicionadas permissões para comunicação HTTPS
   - Host permissions para o painel Vercel

2. **background.js** (neon-zap-extension)
   - Importação do painel-integration.js
   - Inicialização automática da integração

---

## 🚀 Próximos Passos

### Passo 1: Copiar Arquivos para a Extensão

```bash
# Copiar para a pasta da extensão
cp extension-integration/painel-integration.js ../neon-zap-extension/
```

### Passo 2: Verificar Permissões no Manifest

```json
{
  "permissions": ["storage", "alarms", "tabs", "scripting", "webRequest"],
  "host_permissions": [
    "https://web.whatsapp.com/*",
    "https://extens-o-neons.vercel.app/*"
  ]
}
```

### Passo 3: Instalar a Extensão

1. Abra `chrome://extensions/`
2. Ative "Modo de desenvolvedor"
3. Clique "Carregar extensão sem compactação"
4. Selecione a pasta `neon-zap-extension/`

### Passo 4: Testar a Integração

```javascript
// No console do Service Worker (DevTools)
> rodarTudoTestes()
```

---

## 📊 Fluxo de Comunicação

```
┌─────────────────────────────────────────────────────────┐
│         Chrome Extension (Neon Zap)                     │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │  background.js                                   │  │
│  │  - Motor de disparo                             │  │
│  │  - Gerenciamento de fila                        │  │
│  │  - Controle de campanhas                        │  │
│  └──────────────────────────────────────────────────┘  │
│                        ↓                                │
│  ┌──────────────────────────────────────────────────┐  │
│  │  painel-integration.js (NOVO)                   │  │
│  │  - Bearer Token geração/renovação               │  │
│  │  - Sincronização HTTP (5s)                      │  │
│  │  - WebSocket live (bidirecional)                │  │
│  │  - Processamento de comandos                    │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
              ↕ Bearer Token ↕ HTTP/WebSocket
┌─────────────────────────────────────────────────────────┐
│          Painel Admin (Vercel)                          │
│     https://extens-o-neons.vercel.app                   │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │  /api/admin/maturation/status                   │  │
│  │  - Recebe sincronização da extensão             │  │
│  │  - Envia comandos (pausa, para, etc)            │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │  /api/admin/maturation/live (WebSocket)         │  │
│  │  - Stream de eventos em tempo real              │  │
│  │  - Atualizações bidirecional                    │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │  /admin/maturation (UI)                         │  │
│  │  - Dashboard com métricas                       │  │
│  │  - Controles de início/parada                   │  │
│  │  - Agendamentos                                 │  │
│  │  - Analytics                                    │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## 🔐 Autenticação

### Bearer Token Flow

```
1. Extensão inicia
   ↓
2. Verifica se tem token no storage
   ↓
3. Se não, faz POST /api/admin/maturation/auth/token
   ├─ extension_id (UUID da extensão)
   └─ device_id (ID único do dispositivo)
   ↓
4. Painel retorna token JWT (7 dias de validade)
   ↓
5. Extensão armazena no chrome.storage.local
   ↓
6. Usa token em todas as requisições:
   Authorization: Bearer <token>
   ↓
7. Se receber 401, regenera novo token
```

---

## 📡 Sincronização

### Dados Enviados a Cada 5 Segundos

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

### Resposta do Painel

```json
{
  "ok": true,
  "commands": [
    {
      "type": "pause|resume|stop|add_contact|clear_queue|update_config",
      "payload": { ... }
    }
  ]
}
```

---

## 🎮 Comandos Suportados

| Comando | Payload | Descrição |
|---------|---------|-----------|
| `pause` | - | Pausa maturação |
| `resume` | - | Retoma maturação |
| `stop` | - | Para completamente |
| `add_contact` | `{numero, nome, campaignId}` | Adiciona contato |
| `clear_queue` | - | Limpa fila |
| `update_config` | `{ritmo_min, ritmo_max, limite_diario, janela_inicio, janela_fim}` | Atualiza config |

---

## ✅ Checklist de Implementação

- [ ] Copiar `painel-integration.js` para extensão
- [ ] Atualizar `manifest.json` com permissões
- [ ] Atualizar `background.js` para importar integração
- [ ] Testar geração de token
- [ ] Testar sincronização
- [ ] Testar WebSocket
- [ ] Testar comandos (pausa, retomada, etc)
- [ ] Testar adição de contato via painel
- [ ] Testar agendamentos
- [ ] Deploy em produção

---

## 🧪 Como Testar

### 1. Teste Rápido (2 minutos)

```javascript
// Console do Service Worker
> testarTokenGerado()
> testarSincronizacao()
```

### 2. Teste Completo (5 minutos)

```javascript
// Console do Service Worker
> rodarTudoTestes()
```

### 3. Teste Manual (10 minutos)

1. Instale a extensão
2. Abra o painel: https://extens-o-neons.vercel.app/admin/maturation
3. Clique "Iniciar"
4. Verifique se a extensão recebeu o comando
5. Clique "Parar"
6. Verifique se a extensão pausou

---

## 🔍 Monitoramento

### Logs da Extensão

```javascript
// Console do Service Worker
> monitorarSincronizacoes(60000) // 1 minuto
```

### Logs do Painel

Acesse: https://extens-o-neons.vercel.app/admin/maturation/logs

---

## ⚠️ Possíveis Erros

| Erro | Causa | Solução |
|------|-------|---------|
| Token não gerado | URL incorreta | Verifique PANEL_CONFIG.apiUrl |
| WebSocket não conecta | Permissões faltando | Adicione host_permissions no manifest |
| Comandos não funcionam | Extensão pausada | Clique "Retomar" no painel |
| 401 Unauthorized | Token expirado | Extensão regenera automaticamente |

---

## 📚 Documentos Relacionados

- `PAINEL_INTEGRATION_README.md` - Documentação técnica completa
- `TESTES_INTEGRACAO.js` - Suite de testes
- `/src/app/api/admin/maturation/` - Endpoints da API
- `/src/app/admin/maturation/` - UI do painel

---

## 🎯 Resultado Final

Após implementar:

✅ Extensão controlada pelo painel admin  
✅ Status em tempo real (5s)  
✅ Comandos bidirecional (WebSocket)  
✅ Bearer tokens seguros  
✅ Sem exposição de chaves  
✅ Logging completo  
✅ Pronto para produção  

---

**Próximo passo:** Copiar arquivos para extensão e testar! 🚀
