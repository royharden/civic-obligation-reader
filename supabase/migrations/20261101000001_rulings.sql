create table public.rulings (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id),
  event_id text not null check (length(event_id) between 1 and 100),
  key_hash char(64) not null check (key_hash ~ '^[0-9a-f]{64}$'),
  pair_key char(64) not null check (pair_key ~ '^[0-9a-f]{64}$'),
  verdict text not null check (verdict in ('confirmed', 'wrong', 'unclear')),
  note text not null default '' check (char_length(note) <= 500),
  supersedes_event_id text,
  created_at timestamptz not null default now(),
  unique (owner, event_id),
  unique (owner, pair_key, event_id),
  foreign key (owner, pair_key, supersedes_event_id) references public.rulings(owner, pair_key, event_id)
);
alter table public.rulings enable row level security;
revoke all on public.rulings from anon, authenticated;
grant select, insert on public.rulings to authenticated;
create policy own_rulings_read on public.rulings for select to authenticated using (owner = auth.uid());
create policy own_rulings_append on public.rulings for insert to authenticated with check (owner = auth.uid());
create index rulings_owner_pair on public.rulings(owner, pair_key);
