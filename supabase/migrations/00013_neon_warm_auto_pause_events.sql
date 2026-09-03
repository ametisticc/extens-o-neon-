-- ============================================================
-- Migration 00013: Auto-Pause Events
-- ============================================================
-- Rastreia quando números foram pausados automaticamente
-- e quando devem tentar de novo

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
