drop table if exists public.timo_tasks;
drop table if exists public.timo_users;

create table public.timo_users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null unique,
  email_verified boolean not null default false,
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

create table public.timo_tasks (
  user_id uuid not null references public.timo_users(id) on delete cascade,
  id text not null,
  task_date date not null,
  name text not null,
  tag text,
  estimate_minutes integer not null default 0,
  note text,
  status text not null default 'pending',
  priority text,
  actual_seconds integer not null default 0,
  extensions integer not null default 0,
  task_order numeric,
  timebox_order numeric,
  timebox_start_minute integer,
  timebox_duration_minutes integer,
  raw_task jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index timo_tasks_user_date_idx
on public.timo_tasks (user_id, task_date);

create index timo_tasks_user_status_idx
on public.timo_tasks (user_id, status);

alter table public.timo_tasks enable row level security;

create policy "Service role can manage timo tasks"
on public.timo_tasks
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');
