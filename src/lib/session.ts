// Сессия пользователя: подписанная cookie (JWT), живёт 30 дней.
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE = "sc_session";

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET должен быть не короче 32 символов");
  return new TextEncoder().encode(s);
}

// issuedAt — когда выдан вход (секунды). Нужен, чтобы после смены пароля старые входы перестали работать.
export type Session = { userId: string; issuedAt: number };

export async function createSession(userId: string) {
  const token = await new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function readSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return typeof payload.userId === "string" ? { userId: payload.userId, issuedAt: payload.iat ?? 0 } : null;
  } catch {
    return null;
  }
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}
