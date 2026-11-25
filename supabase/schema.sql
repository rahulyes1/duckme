-- Hisaab cloud sync schema. Paste this whole file into Supabase → SQL Editor → Run.
-- Safe to run more than once.
--
-- Every row belongs to one signed-in person (user_id = auth.uid()). Row Level Security makes sure a
-- person can only ever read or change their own rows, which is why the "anon" key can ship in the app.
--
-- updated_at = when the row was last edited on a device (ms). Newest edit wins.
-- synced_at  = when the row reached the server (ms, server clock). Devices pull by this, so a phone
--              with a wrong clock can't hide its changes from your other devices.

-- ---------- helpers ----------
create or replace function public.hisaab_now_ms() returns bigint
language sql volatile as $$ select (extract(epoch from clock_timestamp()) * 1000)::bigint $$;

-- Cards: last write wins on the server too (an older edit can never overwrite a newer one),
-- and re-sending an identical row changes nothing.
create or replace function public.hisaab_cards_lww() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if new.updated_at < old.updated_at then return null; end if;
    if new.updated_at = old.updated_at and new.deleted = old.deleted and new.data = old.data then return null; end if;
  end if;
  new.synced_at := public.hisaab_now_ms();
  return new;
end $$;

create or replace function public.hisaab_versions_lww() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if new.updated_at < old.updated_at then return null; end if;
    if new.updated_at = old.updated_at and new.data = old.data then return null; end if;
  end if;
  new.synced_at := public.hisaab_now_ms();
  return new;
end $$;

-- ---------- cards ----------
create table if not exists public.cards (
  user_id    uuid    not null default auth.uid() references auth.users (id) on delete cascade,
  id         text    not null,
  data       jsonb   not null,
  updated_at bigint  not null,
  deleted    boolean not null default false,
  synced_at  bigint  not null default public.hisaab_now_ms(),
  primary key (user_id, id)
);
create index if not exists cards_user_updated_idx on public.cards (user_id, updated_at);
create index if not exists cards_user_synced_idx  on public.cards (user_id, synced_at);
drop trigger if exists cards_lww on public.cards;
create trigger cards_lww before insert or update on public.cards
  for each row execute function public.hisaab_cards_lww();

-- ---------- versions (note history; id = "<cardId>:<at>") ----------
create table if not exists public.versions (
  user_id    uuid   not null default auth.uid() references auth.users (id) on delete cascade,
  id         text   not null,
  data       jsonb  not null,
  updated_at bigint not null,
  synced_at  bigint not null default public.hisaab_now_ms(),
  primary key (user_id, id)
);
create index if not exists versions_user_updated_idx on public.versions (user_id, updated_at);
create index if not exists versions_user_synced_idx  on public.versions (user_id, synced_at);
drop trigger if exists versions_lww on public.versions;
create trigger versions_lww before insert or update on public.versions
  for each row execute function public.hisaab_versions_lww();

-- ---------- settings (one row per person) ----------
create table if not exists public.settings (
  user_id    uuid   primary key default auth.uid() references auth.users (id) on delete cascade,
  data       jsonb  not null default '{}'::jsonb,
  updated_at bigint not null default 0
);
create index if not exists settings_user_updated_idx on public.settings (user_id, updated_at);

-- ---------- Row Level Security: you only ever see your own rows ----------
alter table public.cards    enable row level security;
alter table public.versions enable row level security;
alter table public.settings enable row level security;

do $$
declare t text;
begin
  foreach t in array array['cards', 'versions', 'settings'] loop
    execute format('drop policy if exists "own rows select" on public.%I', t);
    execute format('drop policy if exists "own rows insert" on public.%I', t);
    execute format('drop policy if exists "own rows update" on public.%I', t);
    execute format('drop policy if exists "own rows delete" on public.%I', t);
    execute format('create policy "own rows select" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy "own rows insert" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy "own rows update" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy "own rows delete" on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
