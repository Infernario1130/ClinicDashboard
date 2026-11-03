// Self-check for the call outcome rules. Run: node scripts/check-call-mapping.ts
import assert from "node:assert/strict";
import { fromAnalytics, fromWebhook, outcomeFor } from "../lib/call-mapping.ts";

const base = { booked: false, endReason: null, transferReason: null, callerSpoke: true, durationS: 60 };
assert.equal(outcomeFor({ ...base, booked: true }), "Booked");
assert.equal(outcomeFor({ ...base, endReason: "CALL_TRANSFER" }), "Transferred");
assert.equal(outcomeFor({ ...base, transferReason: "retina appointment", durationS: 6 }), "Transferred");
assert.equal(outcomeFor({ ...base, callerSpoke: false }), "Missed");
assert.equal(outcomeFor({ ...base, durationS: 9.9 }), "Missed");
assert.equal(outcomeFor({ ...base, durationS: 10 }), "Not booked");

const hook = fromWebhook({
  interaction_id: "20261103/x-12:00:00-a",
  app_version: 28,
  user_phone_number: "+919999900000",
  duration: 42.37,
  start_datetime: "2026-11-03T06:30:00Z",
  final_agent_variables: { appointment_booked: "no", call_summary: "Asked timings.", transfer_reason: "none", unanswered_question: "None" },
  interaction_transcript: [{ role: "agent" }, { role: "user" }],
});
assert.equal(hook.outcome, "Not booked");
assert.equal(hook.transfer_reason, null);
assert.equal(hook.unanswered_question, null);
assert.equal(hook.duration_s, 42.4);
assert.equal("interaction_transcript" in hook, false, "transcript must never be stored");

const silent = fromAnalytics({ interaction_id: "a", duration_in_seconds: 31, num_messages: 1, end_reason: "USER_ENDS", agent_variables: { appointment_booked: "no" } });
assert.equal(silent.outcome, "Missed");
const transferred = fromAnalytics({ interaction_id: "b", duration_in_seconds: 40, num_messages: 4, ended_by: "CALL_TRANSFER", agent_variables: {} });
assert.equal(transferred.outcome, "Transferred");
const booked = fromAnalytics({ interaction_id: "c", duration_in_seconds: 150, num_messages: 14, end_reason: "AGENT_ENDS", agent_variables: { appointment_booked: "yes" } });
assert.equal(booked.outcome, "Booked");

console.log("call mapping: all checks pass");
