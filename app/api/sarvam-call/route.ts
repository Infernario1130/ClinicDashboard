import { safeEqual } from "@/lib/auth";
import { fromWebhook, saveCalls, type SarvamWebhook } from "@/lib/calls";

// Sarvam's post-call webhook (D-362). Set on the deployment as
//   https://<dashboard>/api/sarvam-call?token=<SARVAM_WEBHOOK_TOKEN>
// The transcript in the body is used only to see whether the caller spoke and
// is never stored (D-366).
export async function POST(req: Request) {
  const want = process.env.SARVAM_WEBHOOK_TOKEN;
  const got = new URL(req.url).searchParams.get("token") ?? "";
  if (!want || !safeEqual(got, want)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as SarvamWebhook | null;
  if (!body?.interaction_id) return Response.json({ error: "interaction_id missing" }, { status: 400 });

  try {
    await saveCalls([fromWebhook(body)]);
  } catch (err) {
    console.error(err);
    // A non-2xx marks the delivery failed in Sarvam, so it can be re-sent.
    return Response.json({ error: "save failed" }, { status: 500 });
  }
  return Response.json({ ok: true });
}
