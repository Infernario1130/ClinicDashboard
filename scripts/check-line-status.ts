// Self-check for the night closed line. Run: node scripts/check-line-status.ts
import assert from "node:assert/strict";
import { lineStatus } from "../lib/line-status.ts";

const at = (ist: string) => lineStatus(new Date(`2026-11-04T${ist}:00+05:30`)).line_closed;
assert.equal(at("21:59"), "no");
assert.equal(at("22:00"), "yes");
assert.equal(at("00:30"), "yes");
assert.equal(at("03:59"), "yes");
assert.equal(at("04:00"), "no");
assert.equal(at("09:00"), "no");

console.log("line status: all checks pass");
