create table if not exists public.timo_user_activity_days (
  user_id uuid not null references public.timo_users(id) on delete cascade,
  activity_date date not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  event_count integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, activity_date)
);

create index if not exists timo_user_activity_days_date_idx
on public.timo_user_activity_days (activity_date);

alter table public.timo_user_activity_days enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'timo_user_activity_days'
      and policyname = 'Service role can manage timo user activity days'
  ) then
    create policy "Service role can manage timo user activity days"
    on public.timo_user_activity_days
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');
  end if;
end $$;
