"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, SESSION_SECONDS, createSession, passwordMatches } from "@/lib/admin-auth.ts";

// shortcut: no limit on login attempts yet, add per-IP rate limiting with the API's rate limiter at deploy.
export async function login(formData: FormData) {
  const secret = process.env.ADMIN_PASSWORD;
  const given = formData.get("password");
  if (typeof given !== "string" || !secret || !passwordMatches(given, secret)) redirect("/admin/login?error=1");
  (await cookies()).set(SESSION_COOKIE, createSession(secret), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/admin",
    maxAge: SESSION_SECONDS,
  });
  redirect("/admin");
}

export async function logout() {
  (await cookies()).delete({ name: SESSION_COOKIE, path: "/admin" });
  redirect("/admin/login");
}
