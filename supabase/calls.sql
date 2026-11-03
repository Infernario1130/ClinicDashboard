-- Call log for the AI receptionist. Run once in the Supabase SQL editor.
--
-- ORDER MATTERS (see HANDOVER.md):
--   1. Deploy the new app first (it reads with the service-role key).
--   2. Check n8n's Supabase credential uses the service-role key. The booking
--      flow reads `appointments` for slot and duplicate checks; with the anon
--      key, step 4 below would break every booking.
--   3. Run sections A and C.
--   4. Run section B (row-level security) last.

-- A. The calls table. One row per Sarvam interaction.
create table if not exists public.calls (
  interaction_id      text primary key,
  started_at          timestamptz not null,
  duration_s          numeric not null default 0,
  caller_number       text,
  end_reason          text,          -- from Sarvam analytics; null for webhook rows
  outcome             text not null, -- Booked | Transferred | Missed | Not booked
  summary             text,
  appointment_booked  boolean not null default false,
  transfer_reason     text,
  unanswered_question text,
  app_version         integer,
  created_at          timestamptz not null default now()
);
create index if not exists calls_started_at_idx on public.calls (started_at desc);

-- B. Row-level security: no policies means the public (anon) key can read or
-- write nothing. The dashboard server and n8n use the service-role key, which
-- bypasses RLS.
alter table public.appointments enable row level security;
alter table public.calls enable row level security;

-- C. 90-day rule (D-366): blank the caller's number and words, keep the counts.
-- Needs the pg_cron extension (Database > Extensions > pg_cron). Runs 03:00 IST.
select cron.schedule(
  'calls-90-day-cleanup',
  '30 21 * * *',
  $$update public.calls
       set caller_number = null, summary = null, unanswered_question = null
     where started_at < now() - interval '90 days'
       and caller_number is not null$$
);
