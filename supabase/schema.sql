create table if not exists public.timo_users (
  id text primary key,
  name text not null,
  email text not null unique,
  password_hash text not null,
  email_verified boolean not null default true,
  app_state jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.timo_users enable row level security;

create policy "Service role can manage timo users"
on public.timo_users
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');
