-- ============================================================
-- MIGRATIONS 00011 + 00012 + 00013 - Completo
-- ============================================================
-- Rode este arquivo INTEIRO no SQL Editor do Supabase
-- Contém as 3 migrations em sequência
--
-- ✅ 00011 - Bearer Tokens (autenticação renovável)
-- ✅ 00012 - Maturation Schedules (agendamentos)
-- ✅ 00013 - Auto-Pause Events (pausa automática)
--
-- É seguro rodar (usa IF NOT EXISTS), mas ideal rodar UMA vez
-- ============================================================

-- ============================================================
-- PARTE 1 — 00011_neon_warm_bearer_tokens.sql
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS neon_warm_bearer_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Hash do token (nunca guardamos o token em texto plano)
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  
  -- Rastreamento: qual API key ou licença gerou este token
  api_key_prefix VARCHAR(8),
  extension_id VARCHAR(128) NOT NULL,
  license_id UUID REFERENCES neon_warm_licenses(id) ON DELETE CASCADE,
  device_id VARCHAR(128),
  
  -- Ciclo de vida
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  last_used_at TIMESTAMP WITH TIME ZONE,
  
  -- Status
  status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  
  -- Timestamps
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Índices para busca rápida
CREATE INDEX IF NOT EXISTS idx_bearer_tokens_hash ON neon_warm_bearer_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_bearer_tokens_expires_at ON neon_warm_bearer_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_bearer_tokens_extension_id ON neon_warm_bearer_tokens(extension_id);
CREATE INDEX IF NOT EXISTS idx_bearer_tokens_status ON neon_warm_bearer_tokens(status);

-- RLS: sem políticas (acesso apenas via service_role)
ALTER TABLE neon_warm_bearer_tokens ENABLE ROW LEVEL SECURITY;

-- Comentário da tabela
COMMENT ON TABLE neon_warm_bearer_tokens IS 'Bearer tokens para autenticação HTTP renovável da extensão. Substitui headers customizados. Tokens expiram e precisam ser renovados.';

COMMIT;

-- ============================================================
-- PARTE 2 — 00012_neon_warm_maturation_schedules.sql
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS neon_warm_maturation_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Referências
  user_id UUID REFERENCES neon_warm_users(id) ON DELETE CASCADE,
  phone_number_id UUID REFERENCES neon_warm_numbers(id) ON DELETE CASCADE,
  
  -- Agendamento
  scheduled_start_at TIMESTAMP WITH TIME ZONE NOT NULL,
  scheduled_end_at TIMESTAMP WITH TIME ZONE,
  
  -- Configuração de maturação
  mode VARCHAR(32) NOT NULL DEFAULT 'normal' CHECK (mode IN ('normal', 'time', 'cycles')),
  duration_minutes INTEGER,
  duration_cycles INTEGER,
  
  -- Status
  status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed', 'cancelled')),
  started_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Índices para busca rápida
CREATE INDEX IF NOT EXISTS idx_maturation_schedules_user_id ON neon_warm_maturation_schedules(user_id);
CREATE INDEX IF NOT EXISTS idx_maturation_schedules_phone_number_id ON neon_warm_maturation_schedules(phone_number_id);
CREATE INDEX IF NOT EXISTS idx_maturation_schedules_status ON neon_warm_maturation_schedules(status);
CREATE INDEX IF NOT EXISTS idx_maturation_schedules_scheduled_start ON neon_warm_maturation_schedules(scheduled_start_at);

-- RLS
ALTER TABLE neon_warm_maturation_schedules ENABLE ROW LEVEL SECURITY;

-- Comentário
COMMENT ON TABLE neon_warm_maturation_schedules IS 'Agendamentos de maturação. Permite agendar início/fim com data e hora específicas.';

COMMIT;

-- ============================================================
-- PARTE 3 — 00013_neon_warm_auto_pause_events.sql
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS neon_warm_auto_pause_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Referências
  user_id UUID REFERENCES neon_warm_users(id) ON DELETE CASCADE,
  phone_number_id UUID REFERENCES neon_warm_numbers(id) ON DELETE CASCADE,
  
  -- O que causou a pausa
  reason VARCHAR(255) NOT NULL,
  -- Exemplos: 'low_success_rate', 'blocked', 'manual_pause'
  
  -- Quando aconteceu
  paused_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  resume_at TIMESTAMP WITH TIME ZONE NOT NULL,
  -- Quando deve tentar de novo (paused_at + 2h)
  
  -- Contexto
  last_success_rate INTEGER,
  last_validations_count INTEGER,
  
  -- Status
  status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resumed', 'cancelled')),
  resumed_at TIMESTAMP WITH TIME ZONE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_auto_pause_phone_number_id ON neon_warm_auto_pause_events(phone_number_id);
CREATE INDEX IF NOT EXISTS idx_auto_pause_status ON neon_warm_auto_pause_events(status);
CREATE INDEX IF NOT EXISTS idx_auto_pause_resume_at ON neon_warm_auto_pause_events(resume_at);

-- RLS
ALTER TABLE neon_warm_auto_pause_events ENABLE ROW LEVEL SECURITY;

-- Comentário
COMMENT ON TABLE neon_warm_auto_pause_events IS 'Eventos de pausa automática. Sistema pausa números com baixa taxa de sucesso.';

COMMIT;

-- ============================================================
-- VERIFICAÇÃO (rode depois para confirmar)
-- ============================================================
-- Deve retornar as 3 linhas com contagem > 0:

SELECT 'neon_warm_bearer_tokens' as tabela,
       to_regclass('public.neon_warm_bearer_tokens') as existe
UNION ALL
SELECT 'neon_warm_maturation_schedules',
       to_regclass('public.neon_warm_maturation_schedules')
UNION ALL
SELECT 'neon_warm_auto_pause_events',
       to_regclass('public.neon_warm_auto_pause_events');

-- Força o PostgREST a recarregar o schema:
NOTIFY pgrst, 'reload schema';
