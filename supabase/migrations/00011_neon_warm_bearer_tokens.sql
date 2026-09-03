-- ============================================================
-- Migration 00011: Bearer Tokens para autenticação renovável
-- ============================================================
-- Adiciona suporte a Bearer tokens como alternativa aos
-- headers customizados (X-NeonWarm-Key). Tokens expiram
-- e precisam ser renovados via POST /api/neon-warm/auth/token.

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

-- RLS: sem políticas (acesso apenas via service_role, igual outras tabelas)
ALTER TABLE neon_warm_bearer_tokens ENABLE ROW LEVEL SECURITY;

-- Comentário da tabela
COMMENT ON TABLE neon_warm_bearer_tokens IS 'Bearer tokens para autenticação HTTP renovável da extensão. Substitui headers customizados. Tokens expiram e precisam ser renovados.';
