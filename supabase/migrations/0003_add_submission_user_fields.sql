alter table public.test_submissions
  add column if not exists user_name text;

alter table public.test_submissions
  add column if not exists user_email text;

