// Admin session: a cookie holding "<expiry>.<HMAC of expiry>", signed with ADMIN_PASSWORD.
// Changing the password logs everyone out. No user accounts: one shared admin password.
import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "admin_session";
export const SESSION_SECONDS = 8 * 60 * 60;

const sign = (expiry: string, secret: string) => createHmac("sha256", secret).update(`admin:${expiry}`).digest("hex");

const sameText = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y); // constant time, so timing can't reveal the secret
};

export const passwordMatches = (given: string, secret: string | undefined) => !!secret && sameText(given, secret);

export function createSession(secret: string, nowMs = Date.now()) {
  const expiry = String(Math.floor(nowMs / 1000) + SESSION_SECONDS);
  return `${expiry}.${sign(expiry, secret)}`;
}

export function sessionValid(token: string | undefined, secret: string | undefined, nowMs = Date.now()) {
  if (!token || !secret) return false;
  const [expiry, mac] = token.split(".");
  if (!expiry || !mac || !/^\d+$/.test(expiry) || Number(expiry) * 1000 <= nowMs) return false;
  return sameText(mac, sign(expiry, secret));
}
