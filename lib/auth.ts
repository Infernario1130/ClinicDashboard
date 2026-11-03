import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

// One shared front-desk password (D-365). The session cookie is
// "<expiry ms>.<hmac>", signed with SESSION_SECRET + DASHBOARD_PASSWORD, so
// changing the password logs everyone out.
// ponytail: shared password, per-person logins (D-321) when staff need their own.
export const SESSION_COOKIE = "desk_session";
export const SESSION_HOURS = 12;

function key(): string {
  const secret = process.env.SESSION_SECRET;
  const password = process.env.DASHBOARD_PASSWORD;
  if (!secret || !password) throw new Error("SESSION_SECRET and DASHBOARD_PASSWORD must be set");
  return secret + password;
}

function sign(value: string): string {
  return createHmac("sha256", key()).update(value).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function passwordMatches(password: string): boolean {
  const want = process.env.DASHBOARD_PASSWORD;
  return !!want && safeEqual(password, want);
}

export function newSessionToken(now = Date.now()): string {
  const exp = String(now + SESSION_HOURS * 3600 * 1000);
  return `${exp}.${sign(exp)}`;
}

export function isValidToken(token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig) return false;
  return safeEqual(sig, sign(exp)) && Number(exp) > now;
}

export async function isLoggedIn(): Promise<boolean> {
  return isValidToken((await cookies()).get(SESSION_COOKIE)?.value);
}
