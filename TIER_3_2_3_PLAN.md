## 🤖 TIER 3.2 & 3.3: Automação Inteligente

### TIER 3.2: Detecção Inteligente de Bloqueio (1-2h)

**Objetivo:** Sistema detecta quando taxa cai e pausa automaticamente

**Lógica:**
1. Monitorar taxa de sucesso em tempo real
2. Se cair abaixo de 50%: **PAUSA AUTOMÁTICA**
3. Aguardar 2 horas
4. Tentar de novo
5. Notificar admin

**Implementação:**
- Background job a cada 5 minutos
- Calcula sucesso das últimas 20 validações
- Se crítico: pausa + cria alerta
- Log de cada ação

**Endpoints:**
- GET `/api/admin/maturation/auto-pause-status` - Ver status

**UI:**
- Badge "🤖 AUTO-PAUSED" no dashboard
- Mostrar quando vai tentar de novo

---

### TIER 3.3: Rotação Automática de Pares (1-2h)

**Objetivo:** Evitar parear 2x com mesmo número em 48h

**Lógica:**
1. Ao procurar par: verificar último pareamento
2. Se foi há <48h: SKIP
3. Priorizar números "novos"
4. Balancear carga entre números
5. Evitar padrões repetitivos

**Implementação:**
- Adicionar campo `last_paired_at` aos pares
- Query inteligente de matching
- Algoritmo de rotação round-robin
- Log de cada pareamento

**Database:**
- Campo: `last_paired_with` em pairs
- Index: `phone_1, phone_2, created_at`

**UI:**
- Mostrar "Próximo melhor par" no monitor

---

### Arquitetura

**Background Jobs:**
- Usar Supabase Cron (ou Vercel Cron)
- Executar a cada 5 min: Verificar pausas
- Executar a cada 1 min: Check rotação

**Banco de Dados:**
- Tabela: `neon_warm_auto_pause_events`
- Campos: `number_id, paused_at, resume_at, reason`

---

### Ordem de Implementação

1. **Auto-Pause Lógica** (simpler)
2. **Rotação de Pares** (mais complex)
3. **UI Updates**
4. **Tests**

Começar?
