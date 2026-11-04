// Sarvam fires call_transfer before the hold line in the same reply is voiced.
// So the agent says the hold line with a call to this tool, which just waits,
// and transfers in the reply after it returns. ?seconds= is the tuning knob
// (default 6, capped at 10). No patient data, so no login.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const asked = Number(new URL(req.url).searchParams.get("seconds") ?? 6);
  const seconds = Math.min(Math.max(Number.isFinite(asked) ? asked : 6, 0), 10);
  await new Promise((r) => setTimeout(r, seconds * 1000));
  return Response.json({ status: "ready" });
}
