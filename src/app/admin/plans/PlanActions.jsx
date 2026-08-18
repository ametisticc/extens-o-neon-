'use client';

// ============================================================
// Botões/ações do painel de planos (Client Component)
// ============================================================
// Um Server Component não pode ter onSubmit/confirm() (event handlers).
// Este componente cliente isola os formulários/botões que mexem nos
// planos de maturação.
export default function PlanActions({ row }) {
  const phone = row.phone_number_normalized || '';
  const hasPlan = row.status !== 'no_plan';
  const paused = row.status === 'paused';
  const showStart = !hasPlan || paused;

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      {showStart && (
        <form
          action="/admin/plans/action"
          method="post"
          onSubmit={(e) => {
            if (!confirm(`Iniciar a maturação do número ${phone}? A extensão segue o plano no próximo ciclo.`)) {
              e.preventDefault();
            }
          }}
        >
          <input type="hidden" name="action" value="start" />
          <input type="hidden" name="phone" value={phone} />
          <button type="submit" className="btn btn-success btn-sm">▶ Iniciar</button>
        </form>
      )}
      {paused && (
        <form
          action="/admin/plans/action"
          method="post"
          onSubmit={(e) => {
            if (!confirm(`Continuar a maturação do número ${phone}? A extensão vai retomar sozinha no próximo ciclo.`)) {
              e.preventDefault();
            }
          }}
        >
          <input type="hidden" name="action" value="approve" />
          <input type="hidden" name="phone" value={phone} />
          <button type="submit" className="btn btn-success btn-sm">✓ Continuar</button>
        </form>
      )}
      {!paused && (
        <form
          action="/admin/plans/action"
          method="post"
          onSubmit={(e) => {
            if (!confirm(`Pausar a maturação do número ${phone}? O pareamento é suspenso até você continuar.`)) {
              e.preventDefault();
            }
          }}
        >
          <input type="hidden" name="action" value="pause" />
          <input type="hidden" name="phone" value={phone} />
          <button type="submit" className="btn btn-warning btn-sm">Pausar</button>
        </form>
      )}
      {(row.suggested_limit || row.suggested_cycle) && (
        <form action="/admin/plans/action" method="post">
          <input type="hidden" name="action" value="apply_suggest" />
          <input type="hidden" name="phone" value={phone} />
          <button
            type="submit"
            className="btn btn-outline btn-sm"
            title={`Sugestão: limite ${row.suggested_limit ?? '—'} · ciclo ${row.suggested_cycle ? row.suggested_cycle + 's' : '—'}`}
          >
            Aplicar sugestão
          </button>
        </form>
      )}
      <details style={{ display: 'inline-block' }}>
        <summary className="btn btn-sm" style={{ cursor: 'pointer' }}>Editar</summary>
        <form
          action="/admin/plans/action"
          method="post"
          style={{
            position: 'absolute',
            zIndex: 10,
            background: 'var(--bg, #fff)',
            border: '1px solid #ddd',
            borderRadius: 8,
            padding: 10,
            minWidth: 260,
            boxShadow: '0 6px 24px rgba(0,0,0,.12)',
          }}
        >
          <input type="hidden" name="action" value="save" />
          <input type="hidden" name="phone" value={phone} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600 }}>
              Limite diário (enviadas)
              <input
                type="number"
                name="daily_msg_limit"
                min={1}
                defaultValue={row.daily_msg_limit ?? ''}
                placeholder="ilimitado"
                style={{ width: '100%', marginTop: 2 }}
              />
            </label>
            <label style={{ fontSize: 12, fontWeight: 600 }}>
              Intervalo mínimo entre ciclos (s)
              <input
                type="number"
                name="cycle_seconds"
                min={30}
                step={10}
                defaultValue={row.cycle_seconds ?? ''}
                placeholder="padrão da extensão"
                style={{ width: '100%', marginTop: 2 }}
              />
            </label>
            <label style={{ fontSize: 12, fontWeight: 600 }}>
              Limite de ciclos (pares)
              <input
                type="number"
                name="cycle_limit"
                min={1}
                step={1}
                defaultValue={row.cycle_limit ?? ''}
                placeholder="ilimitado"
                style={{ width: '100%', marginTop: 2 }}
              />
              <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>
                Deixa vazio para ilimitado. Ao atingir, pausa até você continuar.
              </span>
            </label>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" name="auto_resume_daily" value="true" defaultChecked={row.auto_resume_daily !== false} />
              Desbloquear sozinho no dia seguinte
            </label>
            <button type="submit" className="btn btn-sm btn-primary">Salvar</button>
          </div>
        </form>
      </details>
    </div>
  );
}
