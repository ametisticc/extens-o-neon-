import { readAdminSession } from '@/lib/admin.js';
import { tryGetSupabaseAdmin, DB } from '@/lib/supabase.js';
import { fmtDateTime } from '@/lib/fmt.js';
import { AdminSetupWarning } from '@/components/AdminSetupWarning.jsx';
import MessageDeleteButton from './MessageDeleteButton.jsx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CATEGORY_LABELS = {
  reacao: 'Reação',
  saudacao: 'Saudação',
  pergunta: 'Pergunta',
  cotidiano: 'Cotidiano',
  longa: 'Longa',
  solta: 'Solta',
};

export default async function AdminMessagesPage({ searchParams }) {
  const session = await readAdminSession();
  if (!session) return null;

  const params = await searchParams;
  const msgCode = params?.msg;

  const MSG_MAP = {
    created: { text: 'Mensagem criada com sucesso.', type: 'success' },
    updated: { text: 'Mensagem atualizada com sucesso.', type: 'success' },
    deleted: { text: 'Mensagem removida.', type: 'success' },
    invalid: { text: 'Dados inválidos. Confira os campos.', type: 'error' },
    notfound: { text: 'Mensagem não encontrada.', type: 'error' },
    error: { text: 'Erro ao salvar a mensagem.', type: 'error' },
  };
  const message = MSG_MAP[msgCode] || null;

  const supabase = tryGetSupabaseAdmin();
  let messages = null;
  let fetchError = null;
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from(DB.MESSAGES)
        .select('*')
        .order('priority', { ascending: true })
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) {
        fetchError = `Falha ao carregar mensagens: ${error.message} (${error.code ?? 'sem código'})`;
      } else {
        messages = data;
      }
    } catch (err) {
      console.error('[admin] exceção ao carregar mensagens:', err);
      fetchError = `Erro inesperado ao carregar dados: ${err.message}`;
    }
  }

  const counts = {};
  if (messages) {
    for (const m of messages) {
      counts[m.category] = (counts[m.category] || 0) + 1;
    }
  }

  return (
    <>
      <h1 className="page-title">Mensagens</h1>
      <p className="page-subtitle">
        Banco de frases usado pela extensão ao enviar mensagens. As mensagens ativas são sincronizadas
        pela extensão (com cache de 1h); as embutidas continuam como fallback.
      </p>

      <AdminSetupWarning />

      {fetchError && (
        <div className="alert alert-error" style={{ fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          <strong>Erro ao carregar o painel:</strong> {fetchError}
        </div>
      )}

      {message && <div className={`alert ${message.type === 'success' ? 'alert-success' : 'alert-error'}`}>{message.text}</div>}

      <div className="card">
        <h2>Nova mensagem</h2>
        <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>
          A categoria define como a frase é usada: saudação (abertura), pergunta, cotidiano (frase do dia a dia),
          reação (resposta curta), longa (frase completa com contexto) ou solta (pode ser usada pura).
        </p>
        <form action="/admin/messages/action" method="post" className="license-create-form">
          <input type="hidden" name="action" value="create" />
          <div className="form-row">
            <label htmlFor="category">Categoria *</label>
            <select id="category" name="category" required>
              {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label htmlFor="text">Texto *</label>
            <textarea id="text" name="text" rows={2} maxLength={500} placeholder="Ex.: oi! tudo bem por aí? 😊" required />
          </div>
          <div className="form-row" style={{ alignItems: 'center', gap: 16 }}>
            <div>
              <label htmlFor="priority">Prioridade</label>
              <input type="number" id="priority" name="priority" min={1} max={9999} defaultValue={100} style={{ width: 100 }} />
            </div>
            <div>
              <label htmlFor="active">Status</label>
              <select id="active" name="active" defaultValue="true" style={{ width: 130 }}>
                <option value="true">Ativa</option>
                <option value="false">Inativa</option>
              </select>
            </div>
            <div style={{ marginTop: 18 }}>
              <button type="submit" className="btn">Adicionar</button>
            </div>
          </div>
        </form>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Mensagem</th>
                <th>Categoria</th>
                <th>Prioridade</th>
                <th>Status</th>
                <th>Criada</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {messages && messages.length > 0 ? (
                messages.map((m) => (
                  <tr key={m.id}>
                    <td style={{ maxWidth: 420, wordBreak: 'break-word' }}>{m.text}</td>
                    <td>
                      <span className="badge">{CATEGORY_LABELS[m.category] || m.category}</span>{' '}
                      {counts[m.category] > 1 ? '' : ''}
                    </td>
                    <td>{m.priority}</td>
                    <td>{m.active ? <span className="badge success">ativa</span> : <span className="badge inactive">inativa</span>}</td>
                    <td>{fmtDateTime(m.created_at)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <form action="/admin/messages/action" method="post">
                          <input type="hidden" name="id" value={m.id} />
                          <input type="hidden" name="action" value={m.active ? 'deactivate' : 'activate'} />
                          <button type="submit" className="btn btn-sm">
                            {m.active ? 'Desativar' : 'Ativar'}
                          </button>
                        </form>
                        <MessageDeleteButton messageId={m.id} />
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="empty">Nenhuma mensagem cadastrada.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
