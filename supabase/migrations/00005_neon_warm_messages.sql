-- ============================================================
-- 00005_neon_warm_messages.sql
-- ============================================================
-- Banco de mensagens do Neon Dev: a extensão passa a buscar
-- frases no servidor (endpoint /api/neon-warm/messages) com cache
-- local e fallback para as frases embutidas. O operador gerencia
-- as mensagens pelo painel admin ("Mensagens").
--
-- Segurança:
--  - RLS habilitado sem políticas (acesso apenas via service role,
--    mesma regra das demais tabelas neon_warm_*).
--  - `category` controla como a frase é usada no gerador:
--      reacao     → vira reação curta (ex.: "kkkk 😂")
--      saudacao   → abertura (ex.: "oi, tudo bem?")
--      pergunta   → pergunta curta (ex.: "como tá por aí?")
--      cotidiano  → frase do dia a dia (combina com saudação/pergunta)
--      longa      → frase longa com contexto (usada sozinha)
--      solta      → frase avulsa (generatePhrase pode usar pura)
--  - `priority` maior sai primeiro quando a extensão sincroniza
--    (a extensão respeita os limites de tamanho de cada categoria).
-- ------------------------------------------------------------

begin;

create table if not exists public.neon_warm_messages (
  id uuid primary key default gen_random_uuid(),
  category text not null default 'solta'
    constraint neon_warm_messages_category_check
    check (category in ('reacao', 'saudacao', 'pergunta', 'cotidiano', 'longa', 'solta')),
  text text not null
    constraint neon_warm_messages_text_not_blank check (btrim(text) <> ''),
  active boolean not null default true,
  priority integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_neon_warm_messages_active_category
  on public.neon_warm_messages (active, category, priority desc, created_at desc);

alter table public.neon_warm_messages enable row level security;

-- Limita o tamanho do texto (o WhatsApp exibe mensagens longas em
-- várias linhas; o gerador da extensão também tem um teto interno).
alter table public.neon_warm_messages
  add constraint neon_warm_messages_text_len check (char_length(text) <= 500);

drop trigger if exists trg_neon_warm_messages_updated on public.neon_warm_messages;
create trigger trg_neon_warm_messages_updated
  before update on public.neon_warm_messages
  for each row execute function public.neon_warm_set_updated_at();

-- Seed inicial: um punhado de frases para a extensão já ter
-- conteúdo novo assim que a migration rodar (sem mexer no que já
-- está embutido no wa-js.js).
insert into public.neon_warm_messages (category, text, priority) values
  ('saudacao', 'oi! tudo bem por aí? 😊', 10),
  ('saudacao', 'e aí, como vai a semana?', 20),
  ('saudacao', 'opa, beleza? que bom te ver por aqui!', 30),
  ('pergunta', 'você tem alguma novidade boa essa semana?', 10),
  ('pergunta', 'curtiu o fim de semana?', 20),
  ('cotidiano', 'tô tomando um café aqui ☕', 10),
  ('cotidiano', 'que dia corrido, mas no final valeu!', 20),
  ('cotidiano', 'finalmente em casa depois de um dia longo 🏠', 30),
  ('reacao', 'hahaha verdade! 😂', 10),
  ('reacao', 'que demais! 🙌', 20),
  ('longa', 'acabei de chegar em casa depois de um dia bem corrido e o que mais quero agora é relaxar 😌 como foi o seu dia?', 10),
  ('longa', 'tava pensando que a gente devia colocar a conversa em dia em breve — o que você tem feito de bom ultimamente?', 20),
  ('solta', 'e aí, bora colocar o papo em dia?', 10),
  ('solta', 'só passando pra desejar um ótimo dia! ✨', 20)
on conflict do nothing;

commit;
