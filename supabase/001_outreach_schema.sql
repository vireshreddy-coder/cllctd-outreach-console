-- cllctd outreach console schema
-- Stage 1: shared pipeline, draft generation, hard lint, manual send log

create extension if not exists pgcrypto;

create table if not exists public.outreach_allowed_users (
  email text primary key,
  created_at timestamptz not null default now()
);

insert into public.outreach_allowed_users (email)
values ('viresh@cllctd.ai'), ('tarun@cllctd.ai')
on conflict (email) do nothing;

create or replace function public.outreach_is_allowed_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.outreach_allowed_users au
    where lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create table if not exists public.targets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  website_url text,
  contact_url text,
  category text not null,
  segment text,
  priority text not null default 'MEDIUM' check (priority in ('HIGH','MEDIUM','LOW')),
  status text not null default 'new' check (status in ('new','queued','drafted','sent','replied','bounced','dead')),
  context text,
  notes text,
  buyer_angle text,
  asset_to_pitch text,
  sender text not null default 'viresh' check (sender in ('viresh','tarun')),
  source text not null default 'seed',
  source_url text,
  fit_score integer check (fit_score between 1 and 5),
  email_verification_status text not null default 'unknown' check (email_verification_status in ('unknown','pending','valid','risky','invalid')),
  last_contacted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.drafts (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null references public.targets(id) on delete cascade,
  subject text not null,
  body text not null,
  sender text not null check (sender in ('viresh','tarun')),
  status text not null default 'draft' check (status in ('draft','queued','sent','blocked')),
  lint_passed boolean not null default false,
  lint_errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sent_log (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null references public.targets(id) on delete cascade,
  draft_id uuid references public.drafts(id) on delete set null,
  subject text not null,
  body text not null,
  sender text not null check (sender in ('viresh','tarun')),
  send_mode text not null default 'manual' check (send_mode = 'manual'),
  external_message_id text,
  sent_at timestamptz not null default now(),
  replied_at timestamptz,
  status text not null default 'sent' check (status in ('sent','replied','bounced'))
);

create table if not exists public.activity (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  type text not null default 'info',
  actor_email text default (auth.jwt() ->> 'email'),
  created_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_targets_updated_at on public.targets;
create trigger trg_targets_updated_at
before update on public.targets
for each row execute function public.touch_updated_at();

drop trigger if exists trg_drafts_updated_at on public.drafts;
create trigger trg_drafts_updated_at
before update on public.drafts
for each row execute function public.touch_updated_at();

create index if not exists idx_targets_status on public.targets(status);
create index if not exists idx_targets_priority on public.targets(priority);
create index if not exists idx_targets_sender on public.targets(sender);
create index if not exists idx_targets_category on public.targets(category);
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'targets_name_website_key'
  ) then
    alter table public.targets add constraint targets_name_website_key unique (name, website_url);
  end if;
end $$;

create index if not exists idx_targets_created_at on public.targets(created_at desc);
create index if not exists idx_sent_log_sent_at on public.sent_log(sent_at desc);

alter table public.outreach_allowed_users enable row level security;
alter table public.targets enable row level security;
alter table public.drafts enable row level security;
alter table public.sent_log enable row level security;
alter table public.activity enable row level security;

create policy outreach_allowed_users_read on public.outreach_allowed_users
for select using (public.outreach_is_allowed_user());

create policy targets_all_allowed on public.targets
for all using (public.outreach_is_allowed_user())
with check (public.outreach_is_allowed_user());

create policy drafts_all_allowed on public.drafts
for all using (public.outreach_is_allowed_user())
with check (public.outreach_is_allowed_user());

create policy sent_log_all_allowed on public.sent_log
for all using (public.outreach_is_allowed_user())
with check (public.outreach_is_allowed_user());

create policy activity_all_allowed on public.activity
for all using (public.outreach_is_allowed_user())
with check (public.outreach_is_allowed_user());
