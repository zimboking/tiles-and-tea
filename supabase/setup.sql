-- Tiles & Tea: run this once in your Supabase project (SQL Editor > New query > Run).

create table if not exists public.games (
  id text primary key,
  state jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.games enable row level security;

-- Anyone with a game link can read and play that game. Nobody can delete games from the app.
drop policy if exists "read games" on public.games;
drop policy if exists "create games" on public.games;
drop policy if exists "update games" on public.games;
create policy "read games" on public.games for select to anon, authenticated using (true);
create policy "create games" on public.games for insert to anon, authenticated with check (true);
create policy "update games" on public.games for update to anon, authenticated using (true) with check (true);

grant select, insert, update on public.games to anon, authenticated;

-- Live updates, so a move appears on the other player's screen straight away.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'games'
  ) then
    alter publication supabase_realtime add table public.games;
  end if;
end $$;
