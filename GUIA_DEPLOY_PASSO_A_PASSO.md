## 🚀 GUIA DE DEPLOY - PASSO A PASSO

### ✅ PRÉ-REQUISITOS
- [ ] Acesso ao Supabase
- [ ] Acesso ao Vercel
- [ ] GitHub conectado

---

## 📋 PASSO 1: Executar Migrations SQL (Supabase)

### 1.1 - Acessar Supabase
1. Vá em https://app.supabase.com
2. Selecione seu projeto (extens-o-neon-)
3. Clique em **SQL Editor**
4. Clique em **New Query**

### 1.2 - Migration 1: Bearer Tokens
**Cole este SQL:**
```sql
-- Migration 00011: Bearer Tokens para autenticação renovável
CREATE TABLE IF NOT EXISTS neon_warm_bearer_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  api_key_prefix VARCHAR(8),
  extension_id VARCHAR(128) NOT NULL,
  license_id UUID REFERENCES neon_warm_licenses(id) ON DELETE CASCADE,
  device_id VARCHAR(128),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  last_used_at TIMESTAMP WITH TIME ZONE,
  status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bearer_tokens_hash ON neon_warm_bearer_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_bearer_tokens_expires_at ON neon_warm_bearer_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_bearer_tokens_extension_id ON neon_warm_bearer_tokens(extension_id);
CREATE INDEX IF NOT EXISTS idx_bearer_tokens_status ON neon_warm_bearer_tokens(status);

ALTER TABLE neon_warm_bearer_tokens ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE neon_warm_bearer_tokens IS 'Bearer tokens para autenticação HTTP renovável da extensão.';
```

**Clique RUN** ✅

### 1.3 - Migration 2: Maturation Schedules
**Cole este SQL:**
```sql
-- Migration 00012: Maturation Schedules
CREATE TABLE IF NOT EXISTS neon_warm_maturation_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES neon_warm_users(id) ON DELETE CASCADE,
  phone_number_id UUID REFERENCES neon_warm_numbers(id) ON DELETE CASCADE,
  scheduled_start_at TIMESTAMP WITH TIME ZONE NOT NULL,
  scheduled_end_at TIMESTAMP WITH TIME ZONE,
  mode VARCHAR(32) NOT NULL DEFAULT 'normal' CHECK (mode IN ('normal', 'time', 'cycles')),
  duration_minutes INTEGER,
  duration_cycles INTEGER,
  status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed', 'cancelled')),
  started_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_maturation_schedules_user_id ON neon_warm_maturation_schedules(user_id);
CREATE INDEX IF NOT EXISTS idx_maturation_schedules_phone_number_id ON neon_warm_maturation_schedules(phone_number_id);
CREATE INDEX IF NOT EXISTS idx_maturation_schedules_status ON neon_warm_maturation_schedules(status);
CREATE INDEX IF NOT EXISTS idx_maturation_schedules_scheduled_start ON neon_warm_maturation_schedules(scheduled_start_at);

ALTER TABLE neon_warm_maturation_schedules ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE neon_warm_maturation_schedules IS 'Agendamentos de maturação.';
```

**Clique RUN** ✅

### 1.4 - Migration 3: Auto-Pause Events
**Cole este SQL:**
```sql
-- Migration 00013: Auto-Pause Events
CREATE TABLE IF NOT EXISTS neon_warm_auto_pause_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES neon_warm_users(id) ON DELETE CASCADE,
  phone_number_id UUID REFERENCES neon_warm_numbers(id) ON DELETE CASCADE,
  reason VARCHAR(255) NOT NULL,
  paused_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  resume_at TIMESTAMP WITH TIME ZONE NOT NULL,
  last_success_rate INTEGER,
  last_validations_count INTEGER,
  status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resumed', 'cancelled')),
  resumed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auto_pause_phone_number_id ON neon_warm_auto_pause_events(phone_number_id);
CREATE INDEX IF NOT EXISTS idx_auto_pause_status ON neon_warm_auto_pause_events(status);
CREATE INDEX IF NOT EXISTS idx_auto_pause_resume_at ON neon_warm_auto_pause_events(resume_at);

ALTER TABLE neon_warm_auto_pause_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE neon_warm_auto_pause_events IS 'Eventos de pausa automática.';
```

**Clique RUN** ✅

---

## 🔄 PASSO 2: Vercel Fará Deploy Automático

Vercel detecta push no GitHub e faz:

1. ✅ Clone do código
2. ✅ npm install
3. ✅ npm run build
4. ✅ Deploy automático em 2-3 minutos

**Você não precisa fazer nada - é automático!**

---

## 🧪 PASSO 3: Testar o Sistema

### 3.1 - Acessar Painel Admin
1. Vá em seu domínio Vercel + `/admin`
2. Faça login com credenciais admin
3. Clique em **"Controle em Tempo Real"** no menu

### 3.2 - Testar Dashboard
```
✅ Ver números ativos
✅ Ver pares conectados
✅ Ver métricas
```

### 3.3 - Testar Controle
```
✅ Digite um número: 5511999999999
✅ Clique "Iniciar"
✅ Deve aparecer na lista de ativos
```

### 3.4 - Testar Monitor de Saúde
```
✅ Clique no número (link 📊)
✅ Veja score de saúde
✅ Veja alertas e recomendações
```

### 3.5 - Testar Analytics
```
✅ Clique em "Analytics" no menu
✅ Veja gráficos
✅ Mude range (24h/7d/30d)
```

---

## 📝 PASSO 4: Verificações Finais

### Checklist de Deploy
- [ ] 3 migrations rodaram sem erros
- [ ] Vercel fez deploy (check em vercel.com)
- [ ] Painel carrega sem erros
- [ ] Dashboard mostra métricas
- [ ] Botões funcionam
- [ ] Gráficos aparecem

---

## ⚡ TROUBLESHOOTING

### Se Vercel não fez deploy:
1. Acesse https://vercel.com/projects
2. Selecione seu projeto
3. Veja status do build
4. Se erro: clique "Redeploy"

### Se painel não carrega:
1. Limpe cache (Ctrl+Shift+Del)
2. Tente em aba privada
3. Verifique console (F12)

### Se migrations falharem:
1. Copie SQL linha por linha
2. Verifique se tabelas já existem (IF NOT EXISTS)
3. Rode novamente

### Se endpoints retornam 500:
1. Verifique SUPABASE_URL no Vercel
2. Verifique SUPABASE_SERVICE_ROLE_KEY
3. Logs: Vercel → Project → Deployments → Logs

---

## 🎯 DEPOIS DO DEPLOY

### Próximas Ações:
1. **Usar o painel** para controlar maturação
2. **Agendar disparos** via interface
3. **Monitorar saúde** de números
4. **Analisar gráficos** para otimizar

### Automação Contínua:
- Auto-pause funciona 24/7
- Rotação de pares automática
- Health scoring automático
- Logs registram tudo

---

## 📞 SUPORTE

**Documentação:**
- `FINAL_COMPLETE_DELIVERY.md` - Overview completo
- `IMPLEMENTACAO_COMPLETA.md` - Features por TIER
- Código comentado nos endpoints

**Se algo não funcionar:**
1. Verifique migrations
2. Limpe cache
3. Redeploy no Vercel
4. Confira logs

---

## ✅ PRONTO!

Seu sistema está 100% pronto. Após as 3 migrations, tudo funciona automaticamente no Vercel.

**Tempo estimado:** 10-15 minutos total

Começar agora? 🚀
