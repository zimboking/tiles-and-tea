-- Tiles & Tea notifications: run once after setup.sql (SQL Editor > New query > Run).

alter table public.games add column if not exists last_nudged_at timestamptz;

create table if not exists public.push_subscriptions (
  endpoint text not null,
  game_id text not null references public.games (id) on delete cascade,
  seat smallint not null check (seat in (1, 2)),
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  primary key (endpoint, game_id)
);

alter table public.push_subscriptions enable row level security;

-- The app may only add devices. Reading and sending happen in the notify function.
drop policy if exists "add device" on public.push_subscriptions;
create policy "add device" on public.push_subscriptions for insert to anon, authenticated with check (true);
grant insert on public.push_subscriptions to anon, authenticated;
