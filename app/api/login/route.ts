import { cookies } from "next/headers";
import { SESSION_COOKIE, SESSION_HOURS, newSessionToken, passwordMatches } from "@/lib/auth";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";

  if (!passwordMatches(password)) {
    // Slows guessing to one try every 2 s per request.
    await new Promise((r) => setTimeout(r, 2000));
    return Response.json({ ok: false }, { status: 401 });
  }

  (await cookies()).set(SESSION_COOKIE, newSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
  return Response.json({ ok: true });
}

export async function DELETE() {
  (await cookies()).delete(SESSION_COOKIE);
  return Response.json({ ok: true });
}
