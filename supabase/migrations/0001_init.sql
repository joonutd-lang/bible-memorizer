-- Supabase schema for Bible Memorizer
-- Run: supabase db reset|push (depending on your workflow)

create extension if not exists pgcrypto;

-- ===============
-- profiles
-- ===============
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  display_name text,
  role text not null check (role in ('admin', 'student')) default 'student',
  preferred_language text not null check (preferred_language in ('ko', 'en')) default 'ko',
  created_at timestamptz not null default now()
);

-- Ensure profiles row exists whenever a user is created in auth.users.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, email, display_name, role, preferred_language)
  values (new.id, new.email, null, 'student', 'ko')
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ===============
-- memorization_items
-- ===============
create table if not exists public.memorization_items (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('bible', 'vocab', 'custom')),
  title text not null,
  reference text,
  version text,
  raw_text text not null,
  fixed_text text not null,
  meaning text,
  notes text,
  difficulty integer not null default 1,
  created_by uuid references public.profiles(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ===============
-- memorization_assignments
-- ===============
create table if not exists public.memorization_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_id uuid not null references public.memorization_items(id) on delete cascade,
  assigned_fixed_text_override text,
  assigned_version_override text,
  due_date date,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists memorization_assignments_user_id_idx
  on public.memorization_assignments(user_id);

-- ===============
-- test_submissions
-- ===============
create table if not exists public.test_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_id uuid not null references public.memorization_items(id) on delete cascade,
  assignment_id uuid not null references public.memorization_assignments(id) on delete cascade,
  mode text not null check (mode in ('typing', 'random', 'focus')),
  typed_text text not null,
  official_text_used text not null,
  accuracy_score numeric(6,2) not null,
  passed boolean not null default false,
  submitted_at timestamptz not null default now(),
  duration_seconds integer
);

create index if not exists test_submissions_user_assignment_idx
  on public.test_submissions(user_id, assignment_id, submitted_at desc);

-- ===============
-- mistake_logs
-- ===============
create table if not exists public.mistake_logs (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.test_submissions(id) on delete cascade,
  word_or_phrase text not null,
  expected_text text,
  actual_text text,
  position integer not null,
  created_at timestamptz not null default now()
);

create index if not exists mistake_logs_submission_idx
  on public.mistake_logs(submission_id);

-- ===============
-- app_scoring_settings (singleton)
-- ===============
create table if not exists public.app_scoring_settings (
  id integer primary key default 1,
  pass_threshold numeric(5,2) not null default 80,
  case_sensitive boolean not null default false,
  ignore_punctuation boolean not null default true,
  collapse_whitespace boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.app_scoring_settings (id)
values (1)
on conflict (id) do nothing;

-- ===============
-- RLS Policies
-- ===============
-- Helper logic: detect admin by looking up profiles.role for the current user.

alter table public.profiles enable row level security;
alter table public.memorization_items enable row level security;
alter table public.memorization_assignments enable row level security;
alter table public.test_submissions enable row level security;
alter table public.mistake_logs enable row level security;
alter table public.app_scoring_settings enable row level security;

-- profiles
create policy "profiles_select_own" on public.profiles
for select
using (id = auth.uid());

create policy "profiles_update_own" on public.profiles
for update
using (id = auth.uid())
with check (id = auth.uid());

create policy "profiles_admin_manage" on public.profiles
for all
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

-- memorization_items
create policy "items_read_active" on public.memorization_items
for select
using (is_active = true);

create policy "items_admin_insert" on public.memorization_items
for insert
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

create policy "items_admin_update" on public.memorization_items
for update
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

create policy "items_admin_delete" on public.memorization_items
for delete
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

-- memorization_assignments
create policy "assignments_select_own_or_admin" on public.memorization_assignments
for select
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

create policy "assignments_admin_insert" on public.memorization_assignments
for insert
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

create policy "assignments_admin_update" on public.memorization_assignments
for update
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

create policy "assignments_admin_delete" on public.memorization_assignments
for delete
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

-- test_submissions
create policy "submissions_insert_own" on public.test_submissions
for insert
with check (user_id = auth.uid());

create policy "submissions_select_own_or_admin" on public.test_submissions
for select
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

-- mistake_logs
create policy "mistakes_insert_via_submission_own" on public.mistake_logs
for insert
with check (
  exists (
    select 1
    from public.test_submissions s
    where s.id = submission_id and s.user_id = auth.uid()
  )
);

create policy "mistakes_select_own_or_admin" on public.mistake_logs
for select
using (
  exists (
    select 1
    from public.test_submissions s
    where s.id = submission_id and (s.user_id = auth.uid()
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role = 'admin'
      )
    )
  )
);

-- app_scoring_settings
create policy "settings_admin_read" on public.app_scoring_settings
for select
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

create policy "settings_admin_update" on public.app_scoring_settings
for update
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

