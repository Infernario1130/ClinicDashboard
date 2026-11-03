// Call log storage: saves and reads `calls` rows for the dashboard. Server only.
import { db } from "./supabase";
import type { CallOutcome, CallRow } from "./call-mapping";

export * from "./call-mapping";

// Upsert on interaction_id, so a re-delivered webhook or a re-run backfill
// updates the row instead of adding a second one.
export async function saveCalls(rows: CallRow[]): Promise<void> {
  if (!rows.length) return;
  const { error } = await db().from("calls").upsert(rows, { onConflict: "interaction_id" });
  if (error) throw new Error(`Failed to save calls: ${error.message}`);
}

// What the Calls tab shows. Duration goes to the browser only for missed calls (D-367).
export interface CallView {
  id: string;
  started_at: string;
  caller_number: string;
  outcome: CallOutcome;
  summary: string;
  transfer_reason: string | null;
  duration_s: number | null;
}

export const CALL_DAYS = 7;

export async function getCalls(): Promise<CallView[]> {
  const since = new Date(Date.now() - CALL_DAYS * 24 * 3600 * 1000).toISOString();
  const { data, error } = await db()
    .from("calls")
    .select("interaction_id, started_at, caller_number, outcome, summary, transfer_reason, duration_s")
    .gte("started_at", since)
    .order("started_at", { ascending: false })
    .limit(1000);
  if (error) {
    console.error("Failed to fetch calls:", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: r.interaction_id,
    started_at: r.started_at,
    caller_number: r.caller_number ?? "",
    outcome: r.outcome as CallOutcome,
    summary: r.summary ?? "",
    transfer_reason: r.transfer_reason,
    duration_s: r.outcome === "Missed" ? Number(r.duration_s) : null,
  }));
}
