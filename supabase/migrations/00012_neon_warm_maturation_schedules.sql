-- ============================================================
-- Migration 00012: Maturation Schedules
-- ============================================================
-- Adiciona suporte a agendamento de maturação
-- Permite agendar início/fim de disparos com data/hora

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
