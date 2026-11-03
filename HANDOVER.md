# Call log + real login (branch `feat/call-log`)

For Alok's review before deploy. Built 2026-11-03 for the doctor's ask: every call the AI receptionist handles, including missed calls, on the dashboard.

## What changed
- **Real login.** The old PIN screen let in any 4 digits, and the page shipped every booking to the browser before the PIN. Now:
  - `app/page.tsx` sends no data until a signed session cookie checks out.
  - `/api/login` checks one shared `DASHBOARD_PASSWORD` and sets a 12-hour httpOnly cookie. Each wrong try waits 2 s.
  - Changing the password logs everyone out.
- **No Supabase in the browser.** `lib/supabase.ts` is now server-only and uses the service-role key. The component polls `/api/appointments` and marks rows done through `PATCH /api/appointments/[id]`, and both check the session. The anon key is no longer used anywhere.
- **Calls tab** (`components/calls-view.tsx`):
  - Each row shows the time, number (tap to copy), outcome and summary, plus the transfer reason when there is one.
  - Filters: Today / Yesterday / 7 days, by outcome, and a number search.
  - Polls every 15 s.
  - Call length is shown only on Missed rows, and the API sends it only for those.
- **Outcomes** (`lib/call-mapping.ts`), first match wins:
  1. **Booked:** `appointment_booked` = yes.
  2. **Transferred:** `end_reason` CALL_TRANSFER or a `transfer_reason`.
  3. **Missed:** the caller never spoke, or the call lasted under 10 s.
  4. **Not booked:** everything else.
  - Self-check: `node scripts/check-call-mapping.ts`.
- **Webhook** `POST /api/sarvam-call?token=…`: Sarvam's post-call webhook. It upserts on `interaction_id`. The transcript is read only to see whether the caller spoke, and it is never stored.
- **History:** `scripts/backfill-calls.ts` pulls Sarvam analytics from 2026-10-10 onward (never older than 90 days) and skips debug calls. It's safe to re-run.
- **Database:** `supabase/calls.sql` creates the `calls` table, turns on RLS, and adds the 90-day cleanup.

## Environment variables (Vercel → Settings → Environment Variables)
| Name | Value |
|---|---|
| `SUPABASE_URL` | the project URL (same as the old `NEXT_PUBLIC_SUPABASE_URL`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role |
| `DASHBOARD_PASSWORD` | Aryan picks it and hands it out by hand |
| `SESSION_SECRET` | a long random string |
| `SARVAM_WEBHOOK_TOKEN` | a long random string, also put in the webhook URL |

Remove `NEXT_PUBLIC_SUPABASE_ANON_KEY` once this is live.

## Go-live order (after 20:00 IST, when the line is closed)
1. **Check n8n first.** n8n's Supabase credential must use the **service_role** key. The booking flow reads `appointments` for slot and duplicate checks. If n8n uses the anon key, step 4 breaks every booking.
2. Set the env vars, then deploy this branch. The old version keeps working until this deploy lands.
3. In the Supabase SQL editor, run section A of `supabase/calls.sql`. Enable pg_cron (Database → Extensions), then run section C.
4. Run section B (RLS) last. Then reload the dashboard and do a test booking through n8n's test path to confirm bookings still save.
5. In Sarvam, pause the deployment "Sangam receptionist new line". Set its webhook to `https://sangamdashboard.vercel.app/api/sarvam-call?token=<SARVAM_WEBHOOK_TOKEN>`, switch it to agent **v28**, and resume.
6. Aryan runs the backfill from his terminal, with keys typed into the shell only.
7. Next morning, after 07:15 and outside 09:00–11:00: make one real call and check that it appears on the Calls tab.

**Rollback:** in Sarvam, remove the webhook (and switch back to v27 if needed). On Vercel, redeploy the previous build. If RLS blocks something unexpected, run `alter table public.appointments disable row level security;`.

## Tested locally (against a fake Supabase, invented data)
- `tsc`, `eslint` (two warnings that were already there) and `next build` pass.
- The browser bundle contains no Supabase client or key.
- Without a login, the page holds no patient data, every API returns 401, and a forged cookie gets a 401.
- The wrong password gets a 401 after the 2 s wait. The right one sets an httpOnly cookie.
- The webhook with a bad token gets a 401. With the right token it saves the row, which shows on the Calls tab.
- Marking a booking done still works.

**Not tested:** real Supabase, real RLS with n8n, and the real Sarvam webhook and analytics responses. The backfill accepts the list at the top level or under `data` / `interactions`, and fails loudly on anything else.
