# GUIA — Rotação Automática de Parceiros (100% backend)

**Data:** 2026-08-18 · **Impacto na extensão:** nenhum (clientes continuam do mesmo jeito)
**Objetivo:** com 3+ números ativos, os pares passam a ROTACIONAR entre si no servidor — nunca mais par fixo (ex.: A sempre pareia com B), mesmo se a extensão do cliente não mandar `rotate:true`.

---

## 1. Rodar a migration no Supabase (obrigatório)

Abra o SQL Editor do projeto Supabase **`kbleuokrrmhchpknuyfi.supabase.co`** e execute:

`supabase/migrations/00010_neon_warm_rotation_config.sql`

Isso cria a tabela de configuração `neon_warm_rotation_config` (linha única `id=1`, desligada por padrão — comportamento atual intacto).

> ⚠️ Se ainda **não** rodou as migrations pendentes (00007, 00008, 00009), rode primeiro o arquivo
> `supabase/migrations/TODAS_MIGRATIONS_PENDENTES.sql` — ele já inclui a 00010 ao final.

---

## 2. Subir o código para o Vercel

Pelo terminal, na pasta do projeto:

```bash
git add -A
git commit -m "feat: rotação automática de parceiros no servidor (painel admin)"
git push origin main
```

O Vercel faz o deploy sozinho (a rota `POST /api/maturador/pair` passa a consultar a config e forçar `rotate=true` quando a rotação estiver ligada e houver contas online suficientes).

---

## 3. Ligar no painel

1. Acesse `/admin/pairing` (Pareamento ao vivo).
2. No card **"Rotação automática de parceiros"** (novo, acima das estatísticas):
   - marque o checkbox **"Rotação automática de parceiros"**;
   - deixe o **mínimo de contas online** em `3` (ou ajuste);
   - clique **Salvar**.
3. Pronto. A partir daí, a cada ciclo em que houver `mínimo+` contas online, o servidor encerra os pares e escolhe novos parceiros que **não** interagiram recentemente (round-robin).

---

## Arquivos desta atualização

| Arquivo | O que faz |
|---|---|
| `supabase/migrations/00010_neon_warm_rotation_config.sql` | Cria a tabela de config (id=1) |
| `src/lib/rotation-config.js` | get/set/shouldAutoRotate + contagem de online |
| `src/app/api/maturador/pair/route.js` | Força rotação no servidor quando ligada |
| `src/app/admin/pairing/RotationConfig.jsx` | Formulário do painel (ligar/desligar/min) |
| `src/app/admin/pairing/page.jsx` | Card novo no painel de pareamento |
| `src/app/admin/pairing/action/route.js` | Rota POST `save_rotation` |
| `src/tests/rotation-config.test.mjs` | Testes (9 casos) |

**Testes:** suíte completa com **86 testes passando** (77 anteriores + 9 de rotação).
