// Pure mapping from a Sarvam call (post-call webhook or analytics row) to one
// `calls` row. No imports, so scripts/backfill-calls.ts can run it with plain Node.

export type CallOutcome = "Booked" | "Transferred" | "Missed" | "Not booked";

// D-361: a call is "missed" if the caller never spoke or it lasted under this.
export const MISSED_MAX_S = 10;

export interface CallRow {
  interaction_id: string;
  started_at: string;
  duration_s: number;
  caller_number: string | null;
  end_reason: string | null;
  outcome: CallOutcome;
  summary: string | null;
  appointment_booked: boolean;
  transfer_reason: string | null;
  unanswered_question: string | null;
  app_version: number | null;
}

type Vars = Record<string, unknown> | null | undefined;

// The post-call fields answer "none" when there's nothing to report.
function field(vars: Vars, name: string): string | null {
  const v = vars?.[name];
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t && t.toLowerCase() !== "none" ? t : null;
}

export function outcomeFor(c: {
  booked: boolean;
  endReason: string | null;
  transferReason: string | null;
  callerSpoke: boolean;
  durationS: number;
}): CallOutcome {
  if (c.booked) return "Booked";
  if (c.endReason === "CALL_TRANSFER" || c.transferReason) return "Transferred";
  if (!c.callerSpoke || c.durationS < MISSED_MAX_S) return "Missed";
  return "Not booked";
}

function build(p: {
  interaction_id: string;
  started_at: string;
  duration_s: number;
  caller_number: string | null;
  end_reason: string | null;
  callerSpoke: boolean;
  vars: Vars;
  app_version: number | null;
}): CallRow {
  const booked = field(p.vars, "appointment_booked")?.toLowerCase() === "yes";
  const transfer_reason = field(p.vars, "transfer_reason");
  return {
    interaction_id: p.interaction_id,
    started_at: p.started_at,
    duration_s: Math.round(p.duration_s * 10) / 10,
    caller_number: p.caller_number,
    end_reason: p.end_reason,
    outcome: outcomeFor({
      booked,
      endReason: p.end_reason,
      transferReason: transfer_reason,
      callerSpoke: p.callerSpoke,
      durationS: p.duration_s,
    }),
    summary: field(p.vars, "call_summary"),
    appointment_booked: booked,
    transfer_reason,
    unanswered_question: field(p.vars, "unanswered_question"),
    app_version: p.app_version,
  };
}

// Sarvam's post-call webhook body (docs: deployments/webhooks/webhook-payload).
// The transcript is read only to see whether the caller spoke; it is never stored.
export interface SarvamWebhook {
  interaction_id: string;
  app_version?: number;
  user_phone_number?: string;
  duration?: number;
  final_agent_variables?: Vars;
  start_datetime?: string | null;
  end_datetime?: string | null;
  interaction_transcript?: { role: string }[] | null;
}

export function fromWebhook(w: SarvamWebhook): CallRow {
  return build({
    interaction_id: w.interaction_id,
    started_at: w.start_datetime ?? w.end_datetime ?? new Date().toISOString(),
    duration_s: Number(w.duration ?? 0),
    caller_number: w.user_phone_number ?? null,
    end_reason: null,
    callerSpoke: (w.interaction_transcript ?? []).some((t) => t.role === "user"),
    vars: w.final_agent_variables,
    app_version: w.app_version ?? null,
  });
}

// One row from Sarvam's analytics List Interactions endpoint.
// num_messages counts the greeting too, so 1 or less means the caller never spoke.
export interface SarvamInteraction {
  interaction_id: string;
  start_datetime?: string | null;
  attempted_at?: string | null;
  duration_in_seconds?: number | null;
  user_contact?: string | null;
  ended_by?: string | null;
  end_reason?: string | null;
  num_messages?: number | null;
  agent_variables?: Vars;
  app_version?: number | null;
  is_debug_call?: number | boolean | null;
}

export function fromAnalytics(r: SarvamInteraction): CallRow {
  return build({
    interaction_id: r.interaction_id,
    started_at: r.start_datetime ?? r.attempted_at ?? new Date().toISOString(),
    duration_s: Number(r.duration_in_seconds ?? 0),
    caller_number: r.user_contact ?? null,
    end_reason: r.ended_by ?? r.end_reason ?? null,
    callerSpoke: Number(r.num_messages ?? 0) > 1,
    vars: r.agent_variables,
    app_version: r.app_version ?? null,
  });
}
