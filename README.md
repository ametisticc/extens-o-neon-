# Neon Warm Backend

Backend de validação de licença/autorização para a extensão Chrome **Neon Warm** (maturação de chips WhatsApp).

Arquitetura:

```
EXTENSÃO CHROME (cliente não confiável)
        │  POST /api/neon-warm/*  (com X-NeonWarm-Key + X-NeonWarm-Extension)
        ▼
API NEON WARM (Next.js + App Router, hospedada na Vercel)
        │  SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (variáveis de ambiente, só no servidor)
        ▼
SUPABASE (PostgreSQL)
        ▼
BANCO DE DADOS
```

> **Importante:** esta etapa implementa **somente o backend/API**. A extensão Chrome não foi alterada. A integração acontecerá em uma etapa posterior.

---

## Stack

- **Next.js 15** (App Router, Route Handlers) — deploy nativo na Vercel
- **Supabase** (`@supabase/supabase-js`) — banco PostgreSQL + RLS
- **Node 22+** (runtime)

---

## Estrutura

```
neon-warm-backend/
├── middleware.js                  # CORS por origem (nada de *)
├── next.config.mjs
├── vercel.json                    # região gru1 (São Paulo)
├── .env.example                   # modelo de variáveis de ambiente
├── supabase/
│   ├── migrations/00001_neon_warm_init.sql
│   └── seed.sql                   # dados de desenvolvimento
├── scripts/
│   ├── create-extension-key.mjs   # gera API key da extensão + hash
│   ├── seed.mjs                   # seed simplificado via REST
│   └── test-integration.mjs       # teste contra o Supabase real
├── src/
│   ├── app/
│   │   ├── page.jsx               # página inicial (link p/ painel)
│   │   ├── api/neon-warm/
│   │   │   ├── validate/route.js      # POST — validar número
│   │   │   ├── session/start/route.js # POST — iniciar sessão
│   │   │   ├── session/end/route.js   # POST — encerrar sessão
│   │   │   ├── heartbeat/route.js     # POST — batimento
│   │   │   └── health/route.js        # GET — health check
│   │   └── admin/                # painel administrativo
│   │       ├── page.jsx              # login + dashboard
│   │       ├── numbers/page.jsx      # números
│   │       ├── licenses/page.jsx     # licenças + ações
│   │       ├── logs/page.jsx         # logs
│   │       └── ...                   # login/logout/action
│   └── lib/
│       ├── supabase.js           # client service role (server-only)
│       ├── validation-core.js    # lógica de validação (pura, testável)
│       ├── validation.js         # wrapper com client real
│       ├── auth.js               # API key da extensão
│       ├── admin.js              # cookie assinado do painel
│       ├── sessions.js           # sessões (token hash)
│       ├── phone.js              # normalização E.164
│       ├── crypto.js             # sha256, hmac, tokens
│       ├── rate-limit.js         # rate limiting em memória
│       ├── http.js               # helpers de Response
│       └── logger.js             # log de eventos
└── src/tests/                    # testes unitários (node --test)
```

---

## Tabelas (Supabase)

Todas criadas pela migration `supabase/migrations/00001_neon_warm_init.sql`.

| Tabela | Finalidade |
|---|---|
| `neon_warm_users` | Donos de contas (clientes) |
| `neon_warm_plans` | Planos (com flag `neon_warm_enabled`) |
| `neon_warm_subscriptions` | Assinaturas dos usuários |
| `neon_warm_numbers` | Números de WhatsApp autorizados (normalizados) |
| `neon_warm_licenses` | Licenças por número/plano |
| `neon_warm_devices` | Dispositivos (controle por plano) |
| `neon_warm_sessions` | Sessões ativas (token guardado como hash) |
| `neon_warm_logs` | Logs de eventos |
| `neon_warm_extension_keys` | API keys da extensão (apenas hash) |

Segurança: **RLS habilitado** em todas as tabelas, sem políticas — o acesso ocorre exclusivamente via `service_role` (server-side). Defesa em profundidade caso uma chave anônima vaze.

---

## Endpoints

### `POST /api/neon-warm/validate`
Valida se um número está autorizado a usar o Neon Warm.

**Headers:**
```
X-NeonWarm-Key: nw_...            (API key da extensão)
X-NeonWarm-Extension: neon-warm-extension
Content-Type: application/json
```

**Body:**
```json
{
  "phone_number": "5511999999999",
  "extension_id": "neon-warm-extension",
  "device_id": "device-id"
}
```

**Sucesso (200):**
```json
{
  "authorized": true,
  "status": "active",
  "plan": "Neon Warm Pro",
  "expires_at": "2026-09-15T12:00:00.000Z",
  "message": "Número autorizado para utilizar o Neon Warm"
}
```

**Negado (200, `authorized:false`):**
```json
{
  "authorized": false,
  "status": "unauthorized",
  "reason": "subscription_expired",
  "message": "Assinatura vencida."
}
```

**Razões padronizadas:** `number_not_found`, `user_not_found`, `subscription_not_found`, `subscription_expired`, `subscription_cancelled`, `subscription_suspended`, `plan_inactive`, `neon_warm_disabled`, `license_not_found`, `license_expired`, `license_revoked`, `number_blocked`, `device_blocked`, `device_limit_reached`, `number_limit_reached`, `missing_credentials`, `invalid_api_key`, `api_key_revoked`, `extension_id_invalid`, `extension_mismatch`, `rate_limited`, `origin_not_allowed`.

### `POST /api/neon-warm/session/start`
Valida a autorização e, se OK, cria uma sessão.

**Body:** mesmo schema do `validate`.

**Sucesso:** retorna `session_id` e `session_token` (retornado **uma única vez**; apenas o hash é gravado no banco).

### `POST /api/neon-warm/heartbeat`
Atualiza `last_heartbeat_at` da sessão e `last_seen_at` do número.

**Body:**
```json
{ "session_id": "...", "phone_number": "...", "device_id": "..." }
```

### `POST /api/neon-warm/session/end`
Encerra a sessão (`status = ended`, `ended_at`).

**Body:**
```json
{ "session_id": "..." }
```

### `GET /api/neon-warm/health`
Health check público (sem dados sensíveis).

---

## Ordem das verificações no `/validate`

1. Número existe?
2. Número está bloqueado?
3. Usuário existe?
4. Usuário está ativo?
5. Existe assinatura?
6. Assinatura está ativa?
7. Assinatura expirou?
8. Plano está ativo?
9. Plano permite Neon Warm (`neon_warm_enabled`)?
10. Existe licença?
11. Licença está ativa?
12. Licença expirou?
13. Dispositivo autorizado?
14. Limite do plano (dispositivos/números) excedido?

Se qualquer uma falhar → `authorized: false` com a razão. Se todas passarem → `authorized: true`.

---

## Variáveis de ambiente

Definidas no Vercel (Production/Preview/Development) e no `.env.local` para dev.

| Variável | Obrigatória | Descrição |
|---|---|---|
| `SUPABASE_URL` | ✅ | URL do projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Service role key (nunca no frontend/extensão) |
| `NEON_WARM_EXTENSION_ID` | ✅ | ID da extensão (ex.: `neon-warm-extension`) |
| `NEON_WARM_ALLOWED_ORIGIN` | ✅ | Origens permitidas p/ CORS (separadas por vírgula) |
| `NEON_WARM_RATE_LIMIT` | | Requisições por janela (default 60) |
| `NEON_WARM_RATE_WINDOW_SECONDS` | | Janela do rate limit (default 60) |
| `NEON_WARM_ADMIN_EMAIL` | ✅ (painel) | E-mail do operador do painel |
| `NEON_WARM_ADMIN_PASSWORD` | ✅ (painel) | Senha do operador |
| `NEON_WARM_ADMIN_SECRET` | ✅ (painel) | Segredo p/ assinar cookie (longo/aleatório) |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | | Opcionais, só se o frontend usar Supabase no cliente |

**Nunca** commite valores reais. Use o Vercel Env Variables ou `.env.local`.

---

## Como rodar localmente

Pré-requisitos: Node 22+, uma instância Supabase com a migration aplicada.

```bash
# 1. Instalar dependências
npm install

# 2. Configurar variáveis
cp .env.example .env.local
#   edite .env.local com SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
#   NEON_WARM_ALLOWED_ORIGIN=http://localhost:3000, credenciais do painel

# 3. Aplicar a migration no Supabase
#    Abra o SQL Editor e execute supabase/migrations/00001_neon_warm_init.sql
#    (ou use: supabase db push, se tiver a CLI)

# 4. Criar uma API key para a extensão
npm run key:create -- "Extensão principal" "neon-warm-extension"
#    Copie a API KEY (header X-NeonWarm-Key) e o HASH.
#    Insira o HASH na tabela neon_warm_extension_keys.

# 5. Seed de desenvolvimento (opcional)
npm run db:seed          # seed simplificado via REST
#    OU execute supabase/seed.sql no SQL Editor (recomendado para o seed completo)

# 6. Rodar
npm run dev
#    http://localhost:3000

# 7. Testar
curl -X POST http://localhost:3000/api/neon-warm/validate \
  -H "Content-Type: application/json" \
  -H "X-NeonWarm-Key: nw_SUA_CHAVE" \
  -H "X-NeonWarm-Extension: neon-warm-extension" \
  -d '{"phone_number":"5511999999999","extension_id":"neon-warm-extension","device_id":"dev-teste"}'
```

---

## Testes

### Testes unitários (sem banco, sem npm)
Cobrem os 9 cenários do spec + normalização de telefone.

```bash
npm test
```

### Teste de integração (Supabase real)
Requer `.env.local` configurado, migration + seed aplicados.

```bash
npm run test:integration
```

---

## Deploy na Vercel

1. Suba o repositório para o GitHub (a pasta do projeto, com o `.gitignore`).
2. No Vercel: **Add New Project → Import Git Repository**.
3. Framework preset: **Next.js** (detectado automaticamente).
4. Configure as variáveis de ambiente (todas as listadas acima).
5. Deploy.

O `vercel.json` já define a região `gru1` (São Paulo) para reduzir latência.

Após o deploy, teste:
```bash
curl https://SEU-PROJETO.vercel.app/api/neon-warm/health
# → {"ok":true,"service":"neon-warm-backend","time":"..."}
```

---

## Segurança

- **Extensão = cliente não confiável.** Toda decisão é tomada no servidor.
- **API key por extensão**: a chave viaja no header `X-NeonWarm-Key`; o banco guarda apenas o **hash** (sha256). A chave completa é conhecida apenas pelo operador.
- **Service role key** somente em variáveis de ambiente do servidor. Nunca no frontend/extensão/GitHub.
- **CORS** por origem explícita (`NEON_WARM_ALLOWED_ORIGIN`), sem `*`.
- **Rate limiting** por chave + IP + rota (em memória; para produção distribuída, use Upstash Redis).
- **Consulta parametrizada** (supabase-js) — sem SQL injection.
- **Tokens de sessão** guardados como hash; o token é retornado uma única vez.
- **Logs** não armazenam conteúdo de mensagens do WhatsApp.
- **RLS** habilitado nas tabelas (defesa em profundidade).
- **Painel admin** protegido por senha estática (env) + cookie assinado HMAC (httpOnly, sameSite).

---

## Painel administrativo

Acesso em `/admin` (páginas protegidas).

- **Dashboard:** números autorizados/bloqueados, licenças ativas/expiradas, sessões ativas, últimas validações.
- **Números:** cliente, número, status, última atividade, dispositivos.
- **Licenças:** ativar, revogar, bloquear, desbloquear.
- **Logs:** data, número, usuário, evento, detalhes (com filtro por evento).

Login com as credenciais `NEON_WARM_ADMIN_EMAIL` / `NEON_WARM_ADMIN_PASSWORD`.

---

## Preparação para a extensão (próxima etapa)

A extensão Chrome **Neon Warm** já existe e preserva sua lógica de maturação. Na etapa de integração, ela fará:

```
WhatsApp Web → Neon Warm → identificar número
→ POST /api/neon-warm/validate
→ authorized? SIM → permitir maturação | NÃO → bloquear início
```

O endpoint está pronto para receber as chamadas da extensão com os headers de autenticação. Nenhuma lógica de maturação foi alterada nesta etapa.
