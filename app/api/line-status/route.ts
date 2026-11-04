import { lineStatus } from "@/lib/line-status";

// Sarvam's on-start hook calls this before the greeting plays. It returns no
// patient data, only the greeting for the current hour, so it needs no login.
export const dynamic = "force-dynamic";

export function POST() {
  return Response.json(lineStatus());
}
