-- RLS adjustments for usability

-- Allow authenticated students/admins to read scoring settings.
create policy "settings_user_read" on public.app_scoring_settings
for select
using (auth.uid() is not null);

-- Allow admins to read profiles (used by admin users/results pages).
create policy "profiles_admin_select" on public.profiles
for select
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

