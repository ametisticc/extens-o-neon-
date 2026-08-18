// ============================================================
// MaturationStatus — identidade visual dos estados de maturação
// ============================================================
// Componente CENTRALIZADO e reutilizável. Mesmo status sempre
// mostra o MESMO ícone, cor e significado em qualquer tela.
//
// Puramente apresentacional (sem hooks / sem estado) → pode ser
// usado em Server Component e Client Component.
//
// Estados disponíveis:
//   maturing    🌡️ Maturando   (roxo)  em maturação/aquecimento
//   active      🟢 Ativo       (verde) funcionando normalmente
//   waiting     ⏳ Aguardando  (azul)  aguardando janela/ciclo/parceiro
//   evolving    🌱 Evoluindo   (cyan)  próximo de avançar de fase
//   paused      💤 Pausado     (cinza) pausado por limite/janela/ação
//   restricted  ⚠️ Restrito    (âmbar) marcado como restrito
//   banned      🚫 Banido      (vermelho) bloqueado, exige liberação
//   heated      🔥 Aquecido    (rosa)  fase avançada de maturação
//
// Nota: "waiting", "evolving" e "heated" dependem do Plano Global
// (fases/janelas) que ainda será construído. Por isso eles ficam
// DEFINIDOS aqui (padrão único), mas só aparecem quando a lógica
// de fases passar o estado via prop `state`. Nenhuma lógica
// existente foi alterada — derivação usa SÓ os campos reais.
import { fmtDate } from '@/lib/fmt.js';

export const MATURATION_STATES = {
  maturing: { emoji: '🌡️', label: 'Maturando', tone: 'purple', desc: 'Passando pela maturação' },
  active: { emoji: '🟢', label: 'Ativo', tone: 'green', desc: 'Funcionando normalmente' },
  waiting: { emoji: '⏳', label: 'Aguardando', tone: 'blue', desc: 'Aguardando janela, ciclo ou parceiro' },
  evolving: { emoji: '🌱', label: 'Evoluindo', tone: 'cyan', desc: 'Próximo de avançar de fase' },
  paused: { emoji: '💤', label: 'Pausado', tone: 'slate', desc: 'Maturação pausada' },
  restricted: { emoji: '⚠️', label: 'Restrito', tone: 'amber', desc: 'Requer atenção' },
  banned: { emoji: '🚫', label: 'Banido', tone: 'red', desc: 'Requer liberação manual' },
  heated: { emoji: '🔥', label: 'Aquecido', tone: 'pink', desc: 'Fase avançada de maturação' },
};

/**
 * Deriva o estado visual a partir da linha do board (dados REAIS).
 * @param {object} row Linha de buildMaturationBoardWithClient
 * @returns {string} chave de MATURATION_STATES
 */
export function deriveMaturationState(row) {
  if (!row) return 'active';
  if (row.penalty_status === 'banned' || row.status === 'banned') return 'banned';
  if (row.penalty_status === 'restricted' || row.status === 'restricted') return 'restricted';
  if (row.status === 'paused') return 'paused';
  if (row.status === 'active') {
    const hasPlan = Boolean(row.daily_msg_limit || row.cycle_seconds || row.cycle_limit);
    return hasPlan ? 'maturing' : 'active';
  }
  return 'active';
}

export default function MaturationStatus({ row, state, detail, showDesc = false }) {
  const key = state || deriveMaturationState(row);
  const meta = MATURATION_STATES[key] || MATURATION_STATES.active;

  // Tooltip: usa o `detail` se vier da tela (motivo/data), senão a
  // descrição padrão do estado.
  let title = meta.desc;
  if (detail) title = detail;
  else if (key === 'banned' && row?.flagged_at) title += ` · desde ${fmtDate(row.flagged_at)}`;
  else if (key === 'restricted' && row?.flagged_at) title += ` · desde ${fmtDate(row.flagged_at)}`;
  else if (key === 'active' && row?.status === 'no_plan') title = 'Sem plano configurado · funcionando normalmente';

  return (
    <span className={`maturation-status ${meta.tone}`} title={title}>
      <span className="ms-emoji" aria-hidden="true">{meta.emoji}</span>
      <span className="ms-label">{meta.label}</span>
      {showDesc && <span className="ms-desc">{meta.desc}</span>}
    </span>
  );
}
