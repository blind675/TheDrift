-- The Drift — atomically update an entry and its category allocations.
-- Run once in the Supabase SQL Editor for an existing project.
begin;

create or replace function public.update_entry_with_allocations(
  p_entry_id uuid,
  p_label text,
  p_started_at timestamptz,
  p_ended_at timestamptz,
  p_note text,
  p_project_id uuid,
  p_allocations jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_allocation_count integer;
  v_distinct_category_count integer;
  v_owned_category_count integer;
  v_total_weight numeric;
begin
  if v_user_id is null then
    raise exception 'You must be signed in to update an entry' using errcode = '42501';
  end if;

  if p_label is null or length(btrim(p_label)) not between 1 and 300 then
    raise exception 'The activity title must be between 1 and 300 characters' using errcode = '22023';
  end if;

  if p_started_at is null or p_ended_at is null or p_ended_at <= p_started_at then
    raise exception 'The end time must be later than the start time' using errcode = '22023';
  end if;

  if p_ended_at - p_started_at > interval '365 days' then
    raise exception 'An entry cannot be longer than 365 days' using errcode = '22023';
  end if;

  if jsonb_typeof(p_allocations) is distinct from 'array' then
    raise exception 'Category allocations must be an array' using errcode = '22023';
  end if;

  select
    count(*),
    count(distinct allocation.category_id),
    coalesce(sum(allocation.weight), 0)
  into v_allocation_count, v_distinct_category_count, v_total_weight
  from jsonb_to_recordset(p_allocations) as allocation(category_id uuid, weight numeric);

  if v_allocation_count not between 1 and 2 then
    raise exception 'An entry must have one or two category allocations' using errcode = '22023';
  end if;

  if v_distinct_category_count <> v_allocation_count then
    raise exception 'Each category may only be used once' using errcode = '22023';
  end if;

  if abs(v_total_weight - 1.0) > 0.001 then
    raise exception 'Category allocation weights must add up to 1.0' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_allocations) as allocation(category_id uuid, weight numeric)
    where allocation.weight <= 0 or allocation.weight > 1
  ) then
    raise exception 'Each category allocation must be greater than 0 and at most 1' using errcode = '22023';
  end if;

  select count(*)
  into v_owned_category_count
  from jsonb_to_recordset(p_allocations) as allocation(category_id uuid, weight numeric)
  join public.categories as category
    on category.id = allocation.category_id
   and category.user_id = v_user_id;

  if v_owned_category_count <> v_allocation_count then
    raise exception 'One or more categories do not belong to this account' using errcode = '42501';
  end if;

  if p_project_id is not null and not exists (
    select 1
    from public.projects
    where id = p_project_id
      and user_id = v_user_id
  ) then
    raise exception 'The selected project does not belong to this account' using errcode = '42501';
  end if;

  update public.entries
  set
    label = btrim(p_label),
    started_at = p_started_at,
    ended_at = p_ended_at,
    note = nullif(btrim(p_note), ''),
    project_id = p_project_id,
    updated_at = now()
  where id = p_entry_id
    and user_id = v_user_id;

  if not found then
    raise exception 'The entry was not found or does not belong to this account' using errcode = '42501';
  end if;

  delete from public.entry_allocations
  where entry_id = p_entry_id;

  insert into public.entry_allocations (entry_id, category_id, weight)
  select p_entry_id, allocation.category_id, allocation.weight
  from jsonb_to_recordset(p_allocations) as allocation(category_id uuid, weight numeric);
end;
$$;

revoke execute on function public.update_entry_with_allocations(uuid, text, timestamptz, timestamptz, text, uuid, jsonb) from public, anon;
grant execute on function public.update_entry_with_allocations(uuid, text, timestamptz, timestamptz, text, uuid, jsonb) to authenticated;
grant update on table public.entries to authenticated;
grant select, insert, delete on table public.entry_allocations to authenticated;

commit;
