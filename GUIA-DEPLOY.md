# Guia de Deploy — Neon Warm Backend (Vercel)

> Você vai fazer o deploy pelo site da Vercel (o ambiente do assistente não alcança a Vercel).
> O projeto está empacotado em `neon-warm-backend.zip` — descompacte e arraste a pasta.

---

## Passo 0 — Crie o projeto no Supabase (novo)

1. Acesse https://supabase.com → **New project**
2. Nome: `neon-warm` (ou outro). Senha forte. Região: **South America (São Paulo)** se disponível, senão `us-east-1`.
3. Anote:
   - **Project URL** (ex.: `https://abcdefgh.supabase.co`) → vira `SUPABASE_URL`
   - **Settings → API → Service Role Key** (segredo!) → vira `SUPABASE_SERVICE_ROLE_KEY`
4. No **SQL Editor**, cole todo o conteúdo de `supabase/migrations/00001_neon_warm_init.sql` e rode (Run).
5. Opcional: rode também `supabase/seed.sql` para criar dados de teste.

---

## Passo 1 — Suba o projeto na Vercel

**Opção A (ZIP — mais rápido):**
1. Descompacte `neon-warm-backend.zip`
2. Acesse https://vercel.com/new
3. Selecione **Upload** → arraste a pasta `neon-warm-backend`
4. O Vercel detecta **Next.js** automaticamente

**Opção B (GitHub):**
1. Crie um repo no GitHub e suba a pasta
2. Em https://vercel.com/new → **Import Git Repository**
3. Escolha o repo → Vercel detecta **Next.js**

---

## Passo 2 — Configure as variáveis de ambiente

Na tela do projeto, em **Environment Variables**, adicione:

| Nome | Valor |
|---|---|
| `SUPABASE_URL` | `https://SEU-PROJETO.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | `sb_secret_...` (Service Role Key) |
| `NEON_WARM_EXTENSION_ID` | `neon-warm-extension` |
| `NEON_WARM_ALLOWED_ORIGIN` | `chrome-extension://SEU_EXTENSION_ID` (troque pelo ID real da extensão) |
| `NEON_WARM_ADMIN_EMAIL` | seu e-mail |
| `NEON_WARM_ADMIN_PASSWORD` | senha forte |
| `NEON_WARM_ADMIN_SECRET` | string longa e aleatória |

⚠️ **Nunca** coloque a Service Role Key no frontend/extensão. Ela fica só no Vercel.

---

## Passo 3 — Deploy

1. Clique em **Deploy**
2. Aguarde o build (deve levar ~1 min)
3. Ao final, você terá uma URL tipo `https://neon-warm-backend.vercel.app`

---

## Passo 4 — Verifique

```bash
# Health check
curl https://SUA-URL.vercel.app/api/neon-warm/health
# → {"ok":true,"service":"neon-warm-backend","time":"..."}

# Validar um número (antes de criar a API key, vai dar 401 — normal)
curl -X POST https://SUA-URL.vercel.app/api/neon-warm/validate \
  -H "Content-Type: application/json" \
  -H "X-NeonWarm-Key: nw_SUA_CHAVE" \
  -H "X-NeonWarm-Extension: neon-warm-extension" \
  -d '{"phone_number":"5511999999999","extension_id":"neon-warm-extension","device_id":"dev-teste"}'
```

---

## Passo 5 — Crie a API key da extensão

Rode na sua máquina (na pasta do projeto):

```bash
npm install
npm run key:create -- "Extensão principal" "neon-warm-extension"
```

Você recebe:
- **API KEY** → guarde para colocar na extensão (header `X-NeonWarm-Key`)
- **HASH** → cole no SQL Editor do Supabase:

```sql
insert into public.neon_warm_extension_keys (name, key_hash, extension_id, status)
values ('Extensão principal', '<HASH>', 'neon-warm-extension', 'active');
```

---

## Passo 6 — Crie um número de teste

No SQL Editor do Supabase:

```sql
-- Usuário
insert into public.neon_warm_users (email, name, status)
values ('teste@neonwarm.com', 'Cliente Teste', 'active');

-- Plano (se não existir)
insert into public.neon_warm_plans (name, price, active, neon_warm_enabled, max_numbers, max_devices)
values ('Neon Warm Pro', 49.90, true, true, 5, 2);

-- Assinatura ativa
insert into public.neon_warm_subscriptions (user_id, plan_id, status, started_at, expires_at)
select u.id, p.id, 'active', now(), now() + interval '30 days'
from public.neon_warm_users u, public.neon_warm_plans p
where u.email = 'teste@neonwarm.com' and p.name = 'Neon Warm Pro';

-- Número
insert into public.neon_warm_numbers (user_id, phone_number, phone_number_normalized, status)
select u.id, '5511999999999', '5511999999999', 'active'
from public.neon_warm_users u
where u.email = 'teste@neonwarm.com';

-- Licença
insert into public.neon_warm_licenses (user_id, phone_number_id, plan_id, status, license_key, activated_at, expires_at)
select u.id, n.id, p.id, 'active', 'NW-TESTE-0001', now(), now() + interval '30 days'
from public.neon_warm_users u, public.neon_warm_numbers n, public.neon_warm_plans p
where u.email = 'teste@neonwarm.com'
  and n.phone_number_normalized = '5511999999999'
  and p.name = 'Neon Warm Pro';
```

Agora rode o `/validate` de novo → deve retornar `authorized: true`.

---

## Painel administrativo

Acesse `https://SUA-URL.vercel.app/admin` e entre com `NEON_WARM_ADMIN_EMAIL` / `NEON_WARM_ADMIN_PASSWORD`.

---

## Solução de problemas

| Problema | Causa provável | Solução |
|---|---|---|
| Build falha no `@supabase/supabase-js` | Rede/registry | Rodar `npm install` na máquina e commitar `package-lock.json` |
| `/validate` retorna 401 | API key ausente/errada | Criar key com `npm run key:create` e inserir o HASH no Supabase |
| `/validate` retorna `number_not_found` | Número não cadastrado | Rodar SQL do Passo 6 |
| `origin_not_allowed` | CORS bloqueando | Conferir `NEON_WARM_ALLOWED_ORIGIN` (deve ter o `chrome-extension://ID`) |
| Painel `/admin` mostra login | Cookie não autenticado | Usar as credenciais do admin |
