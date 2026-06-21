import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

export type SessionPayload = {
  userId: string;
  gymId: string;
  role: "OWNER" | "STAFF";
  expiresAt: string;
};

const SESSION_COOKIE = "gympass_session";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

// Short-lived cookie bridging the password step and the 2FA code step. It only
// asserts "this browser passed the password check for userId" — it is NOT a
// session and grants no access on its own.
const PENDING_2FA_COOKIE = "gympass_2fa_pending";
const PENDING_2FA_DURATION_MS = 10 * 60 * 1000; // matches the OTP TTL

// Short-lived cookie linking the signup form step to the email-verify step. It
// only references the PendingSignup row by email — no account exists yet.
const PENDING_SIGNUP_COOKIE = "gympass_signup_pending";
const PENDING_SIGNUP_DURATION_MS = 30 * 60 * 1000;

function getKey() {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function encrypt(payload: SessionPayload) {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getKey());
}

export async function decrypt(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getKey(), { algorithms: ["HS256"] });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function createSession(payload: Omit<SessionPayload, "expiresAt">) {
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  const token = await encrypt({ ...payload, expiresAt: expiresAt.toISOString() });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

export async function readSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  return decrypt(token);
}

export async function destroySession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

// ── Pending 2FA challenge ────────────────────────────────────────────────

type Pending2FAPayload = { userId: string; kind: "2fa-pending" };

export async function createPending2FA(userId: string) {
  const expiresAt = new Date(Date.now() + PENDING_2FA_DURATION_MS);
  const token = await new SignJWT({ userId, kind: "2fa-pending" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(getKey());
  const store = await cookies();
  store.set(PENDING_2FA_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

export async function readPending2FA(): Promise<{ userId: string } | null> {
  const store = await cookies();
  const token = store.get(PENDING_2FA_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getKey(), { algorithms: ["HS256"] });
    const p = payload as unknown as Pending2FAPayload;
    if (p.kind !== "2fa-pending" || !p.userId) return null;
    return { userId: p.userId };
  } catch {
    return null;
  }
}

export async function destroyPending2FA() {
  const store = await cookies();
  store.delete(PENDING_2FA_COOKIE);
}

// ── Pending signup (email verification) ──────────────────────────────────

type PendingSignupPayload = { email: string; kind: "signup-pending" };

export async function createPendingSignup(email: string) {
  const expiresAt = new Date(Date.now() + PENDING_SIGNUP_DURATION_MS);
  const token = await new SignJWT({ email, kind: "signup-pending" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30m")
    .sign(getKey());
  const store = await cookies();
  store.set(PENDING_SIGNUP_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

export async function readPendingSignup(): Promise<{ email: string } | null> {
  const store = await cookies();
  const token = store.get(PENDING_SIGNUP_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getKey(), { algorithms: ["HS256"] });
    const p = payload as unknown as PendingSignupPayload;
    if (p.kind !== "signup-pending" || !p.email) return null;
    return { email: p.email };
  } catch {
    return null;
  }
}

export async function destroyPendingSignup() {
  const store = await cookies();
  store.delete(PENDING_SIGNUP_COOKIE);
}
