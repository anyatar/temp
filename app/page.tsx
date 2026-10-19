"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnswerView, type AskResponse } from "./answer.tsx";

// One example per question type the app answers well.
const EXAMPLES = [
  "כמה עולה דירת 4 חדרים בכפר סבא?",
  "3.2 מיליון ל-4 חדרים בכפר סבא, זה סביר?",
  "יש לי 2 מיליון, מה אפשר לקנות?",
  "איפה הכי זול לקנות 3 חדרים?",
  "רמת גן מול גבעתיים",
  "איך השתנו המחירים בחולון מאז 2022?",
];
const MAX_QUESTION = 300; // same limit as the API

type Turn = { question: string; res?: AskResponse; error?: string };

export default function Home() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  // Braces matter: newer browsers return a Promise from scrollIntoView, and React would call it as a cleanup.
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  async function ask(raw: string) {
    const question = raw.trim();
    if (!question || busy) return;
    setText("");
    setBusy(true);
    const at = turns.length;
    const settle = (t: Turn) => setTurns((all) => all.map((x, i) => (i === at ? t : x)));
    setTurns((all) => [...all, { question }]);
    try {
      const r = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question }),
      });
      settle(r.ok ? { question, res: await r.json() } : { question, error: "השאלה לא התקבלה. נסו לנסח אותה מחדש." });
    } catch {
      settle({ question, error: "אין חיבור לשרת. נסו שוב בעוד רגע." });
    } finally {
      setBusy(false);
    }
  }

  // On the start page they wrap in the middle; during a conversation they stay one scrollable row above the input.
  const examples = (
    <div className={turns.length ? "examples compact" : "examples"} aria-label="שאלות לדוגמה">
      {EXAMPLES.map((q) => (
        <button key={q} type="button" disabled={busy} onClick={() => ask(q)}>{q}</button>
      ))}
    </div>
  );

  return (
    <main className="chat">
      <nav className="topbar">
        <Link href="/admin">ניהול</Link>
      </nav>
      {turns.length === 0 ? (
        <section className="welcome">
          <h1>שאלו על עסקאות נדל״ן</h1>
          <p>כל תשובה מחושבת מעסקאות שנסגרו בפועל, ומראה על כמה עסקאות היא מבוססת</p>
          {examples}
        </section>
      ) : (
        <div className="thread" aria-live="polite">
          {turns.map((t, i) => (
            <article key={i}>
              <p className="question">{t.question}</p>
              {t.res ? <AnswerView res={t.res} /> : t.error ? <p className="error">{t.error}</p> : <p className="loading">מחפש…</p>}
            </article>
          ))}
          <div ref={end} />
        </div>
      )}

      {turns.length > 0 && examples}
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          ask(text);
        }}
      >
        <input
          aria-label="שאלה על עסקאות נדל״ן"
          placeholder="שאלו על מחירים, ערים, שכונות ועסקאות…"
          maxLength={MAX_QUESTION}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" aria-label="שליחה" disabled={busy || !text.trim()}>↑</button>
      </form>
    </main>
  );
}
