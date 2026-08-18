'use client';

// ============================================================
// Controle da ROTAÇÃO AUTOMÁTICA de parceiros (Client Component)
// ============================================================
// Um Server Component não pode ter onSubmit/onChange (event handlers).
// Este componente isola o formulário que liga/desliga a rotação
// automática no servidor e define o mínimo de contas online.
//
// Quando ligada e o nº de contas online >= min_online, o /pair passa a
// rotacionar no SERVIDOR a cada ciclo — mesmo que a extensão do cliente
// não mande rotate:true. Isso evita pares FIXOS com 3+ números ativos.
export default function RotationConfig({ config }) {
  const enabled = config?.enabled === true;
  const minOnline = config?.min_online ?? 3;

  return (
    <form
      action="/admin/pairing/action"
      method="post"
      style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}
    >
      <input type="hidden" name="action" value="save_rotation" />
      <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
        <input type="checkbox" name="rotation_enabled" value="true" defaultChecked={enabled} />
        <strong>Rotação automática de parceiros</strong>
      </label>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
        Mínimo de contas online
        <input
          type="number"
          name="min_online"
          min={2}
          step={1}
          defaultValue={minOnline}
          style={{ width: 64 }}
        />
      </label>
      <button type="submit" className="btn btn-sm btn-primary">Salvar</button>
      <span className="muted" style={{ fontSize: 12 }}>
        {enabled
          ? `Ativa — rotaciona a cada ciclo quando houver ${minOnline}+ contas online.`
          : 'Desligada — os pares só rotacionam quando a extensão pedir.'}
      </span>
    </form>
  );
}
