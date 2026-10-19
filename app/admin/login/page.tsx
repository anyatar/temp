import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SESSION_COOKIE, sessionValid } from "@/lib/admin-auth.ts";
import { login } from "../actions.ts";

export const metadata: Metadata = { title: "כניסת מנהל", robots: { index: false } };

export default function LoginPage({ searchParams }: PageProps<"/admin/login">) {
  return (
    <Suspense fallback={<main className="admin login"><h1>כניסת מנהל</h1></main>}>
      <Login searchParams={searchParams} />
    </Suspense>
  );
}

async function Login({ searchParams }: Pick<PageProps<"/admin/login">, "searchParams">) {
  const secret = process.env.ADMIN_PASSWORD;
  if (sessionValid((await cookies()).get(SESSION_COOKIE)?.value, secret)) redirect("/admin");
  const failed = (await searchParams).error !== undefined;

  return (
    <main className="admin login">
      <h1>כניסת מנהל</h1>
      {!secret ? (
        <p className="error">הגישה למנהל לא הוגדרה בשרת (חסר ADMIN_PASSWORD).</p>
      ) : (
        <form action={login}>
          <label htmlFor="password">סיסמה</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required autoFocus />
          {failed && <p className="error" role="alert">הסיסמה שגויה.</p>}
          <button type="submit">כניסה</button>
        </form>
      )}
    </main>
  );
}
