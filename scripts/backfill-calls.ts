// One-off: load past calls from Sarvam's analytics API into the `calls` table (D-363).
// Safe to re-run: rows upsert on interaction_id.
//
//   SARVAM_API_KEY=... SARVAM_ORG_ID=... SARVAM_WORKSPACE_ID=... SARVAM_APP_ID=... \
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   node scripts/backfill-calls.ts 2026-10-10
//
// Keys come from the shell only; never write them into a file.
// Transcripts are not requested and nothing older than 90 days is loaded (D-366).
import { createClient } from "@supabase/supabase-js";
import { fromAnalytics, type SarvamInteraction } from "../lib/call-mapping.ts";

const env = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is not set`);
  return v;
};

const PAGE = 1000;
const DAY_MS = 24 * 3600 * 1000;

async function fetchPage(start: string, end: string, offset: number): Promise<SarvamInteraction[]> {
  const base = `https://apps.sarvam.ai/api/analytics/v1/${env("SARVAM_ORG_ID")}/${env("SARVAM_WORKSPACE_ID")}/${env("SARVAM_APP_ID")}/interactions`;
  const qs = new URLSearchParams({ start_datetime: start, end_datetime: end, limit: String(PAGE), offset: String(offset) });
  const res = await fetch(`${base}?${qs}`, { headers: { "X-API-Key": env("SARVAM_API_KEY") } });
  if (!res.ok) throw new Error(`Sarvam ${res.status}: ${await res.text()}`);
  const body = await res.json();
  // ponytail: tolerate the list sitting at the top level or under data/interactions.
  const rows = Array.isArray(body) ? body : (body.data ?? body.interactions ?? []);
  if (!Array.isArray(rows)) throw new Error(`Unexpected Sarvam response keys: ${Object.keys(body).join(", ")}`);
  return rows;
}

async function main() {
  const from = process.argv[2] ?? "2026-10-10";
  const floor = new Date(Date.now() - 90 * DAY_MS);
  const startDate = new Date(`${from}T00:00:00+05:30`);
  const start = (startDate > floor ? startDate : floor).toISOString();
  const end = new Date().toISOString();

  const supa = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

  let offset = 0;
  let saved = 0;
  for (;;) {
    const page = await fetchPage(start, end, offset);
    const rows = page.filter((r) => r.interaction_id && !Number(r.is_debug_call)).map(fromAnalytics);
    if (rows.length) {
      const { error } = await supa.from("calls").upsert(rows, { onConflict: "interaction_id" });
      if (error) throw new Error(`Supabase: ${error.message}`);
      saved += rows.length;
    }
    console.log(`offset ${offset}: ${page.length} fetched, ${rows.length} saved`);
    if (page.length < PAGE) break;
    offset += PAGE;
  }
  console.log(`Done: ${saved} calls saved from ${start} to ${end}.`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
