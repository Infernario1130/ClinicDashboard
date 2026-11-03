import { isLoggedIn } from "@/lib/auth";
import { getCalls } from "@/lib/calls";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isLoggedIn())) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json(await getCalls());
}
