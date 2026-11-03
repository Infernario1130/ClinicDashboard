import { isLoggedIn } from "@/lib/auth";
import { updateAppointmentStatus } from "@/lib/mock-appointments";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isLoggedIn())) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const status = body?.status;
  if (status !== "Done" && status !== "Needs entry") {
    return Response.json({ error: "status must be Done or Needs entry" }, { status: 400 });
  }
  await updateAppointmentStatus(id, status);
  return Response.json({ ok: true });
}
