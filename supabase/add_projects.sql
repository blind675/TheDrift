-- The Drift — add reusable projects to an existing database.
-- Run this file once in the Supabase SQL Editor before deploying the matching app update.
begin;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_id_user_unique unique (id, user_id)
);

create index projects_user_id_idx on public.projects (user_id);
create unique index projects_user_active_name_unique
  on public.projects (user_id, lower(btrim(name)))
  where not archived;

alter table public.entries add column project_id uuid;
alter table public.entries
  add constraint entries_project_owner_fkey
  foreign key (project_id, user_id)
  references public.projects (id, user_id)
  on delete restrict;
create index entries_user_project_started_idx
  on public.entries (user_id, project_id, started_at desc)
  where project_id is not null;

alter table public.projects enable row level security;
create policy projects_select_own on public.projects
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy projects_insert_own on public.projects
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy projects_update_own on public.projects
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update on public.projects to authenticated;

commit;
