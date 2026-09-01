-- The Drift — allow timers and manual entries to span multiple days.
-- Run this file once in the Supabase SQL Editor on an existing database.
begin;

alter table public.entries
  drop constraint if exists entry_sane_length;

alter table public.entries
  add constraint entry_sane_length
  check (ended_at - started_at <= interval '365 days')
  not valid;

alter table public.entries
  validate constraint entry_sane_length;

commit;
