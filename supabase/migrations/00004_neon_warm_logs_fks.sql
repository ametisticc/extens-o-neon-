-- ============================================================
-- 00004_neon_warm_logs_fks.sql
-- ============================================================
-- Adiciona foreign keys em neon_warm_logs para que o PostgREST
-- consiga resolver os relacionamentos usados pelo painel admin:
--   SELECT ... , neon_warm_users(email, name), neon_warm_numbers(phone_number)
-- Sem a FK, a query de logs falha com PGRST200:
--   "Could not find a relationship between 'neon_warm_logs'
--    and 'neon_warm_users' in the schema cache"
-- ------------------------------------------------------------

-- Se os registros apontarem para um usuário/número que não existe
-- (ex.: dados antigos), ON DELETE SET NULL preserva o log. Se o
-- usuário/número for apagado, a coluna vira NULL em vez de impedir.
-- Usamos NOT VALID para que a constraint seja criada mesmo se já
-- existirem logs órfãos no banco (evita falha da migration por
-- violação de FK em dados antigos). A relação fica visível para o
-- PostgREST imediatamente, que é o que o painel precisa.
alter table public.neon_warm_logs
  add constraint fk_neon_warm_logs_user
  foreign key (user_id) references public.neon_warm_users(id)
  on delete set null not valid;

alter table public.neon_warm_logs
  add constraint fk_neon_warm_logs_phone
  foreign key (phone_number_id) references public.neon_warm_numbers(id)
  on delete set null not valid;

alter table public.neon_warm_logs
  add constraint fk_neon_warm_logs_device
  foreign key (device_id) references public.neon_warm_devices(id)
  on delete set null not valid;

-- Indices extras que podem ajudar nas junções
create index if not exists idx_neon_warm_logs_user
  on public.neon_warm_logs (user_id);
create index if not exists idx_neon_warm_logs_device
  on public.neon_warm_logs (device_id);
