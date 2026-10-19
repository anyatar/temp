import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SESSION_COOKIE, sessionValid } from "@/lib/admin-auth.ts";
import type { Deal, Flag } from "@/lib/clean.ts";
import { formatDate, num, shekel } from "@/lib/render.ts";
import rawDeals from "@/data/deals.json";
import rawQuality from "@/data/quality.json";
import { logout } from "./actions.ts";

export const metadata: Metadata = { title: "איכות נתונים", robots: { index: false } };

type Quality = {
  thresholds: Record<string, number>;
  counts: {
    rowsIn: number;
    dealsOut: number;
    quarantined: number;
    excludedFromStats: number;
    changesByRule: Record<string, number>;
    flagsByReason: Record<string, number>;
  };
  quarantine: { id: string; reason: string; row: unknown }[];
  flagged: { id: string; excludeFromStats: boolean; flags: Flag[] }[];
  possibleDuplicates: string[][];
  changes: { id: string; field: string; from: string; to: unknown; rule: string }[];
};

const quality = rawQuality as Quality;
const dealById = new Map((rawDeals as Deal[]).map((d) => [d.id, d]));

const REASON: Record<string, string> = {
  "price-below-floor": "מחיר נמוך מהרף המינימלי",
  "price-per-sqm-far-from-median": "מחיר למ\"ר רחוק פי 10 ויותר מהחציון בעיר",
  "price-per-sqm-off-median": "מחיר למ\"ר חריג ביחס לחציון בעיר",
  "unknown-city": "עיר לא מוכרת",
  "unknown-property-type": "סוג נכס לא מוכר",
  "unknown-source": "מקור לא מוכר",
  "invalid-rooms": "מספר חדרים לא תקין",
  "missing-price": "חסר מחיר",
  "invalid-size": "גודל לא תקין",
  "size-out-of-range": "גודל מחוץ לטווח הסביר",
  "invalid-date": "תאריך לא תקין",
  "future-date": "תאריך עתידי",
  "wrong-field-count": "מספר עמודות שגוי בשורה",
  "same-source-price-conflict": "מחירים סותרים מאותו מקור",
  "duplicate-id-mismatch": "מזהה כפול עם פרטים שונים",
  "new-but-old-building": "\"חדש מקבלן\" בבניין ישן",
  "garden-apartment-above-ground": "דירת גן מעל קומה 1",
  "latin-script-name": "שם שכונה באותיות לועזיות",
  "above-total-floors": "קומה מעל מספר הקומות בבניין",
  "invalid-value": "ערך לא תקין",
};

const RULE: Record<string, string> = {
  whitespace: "הסרת רווחים מיותרים",
  "city-alias": "איחוד שם עיר",
  "neighborhood-alias": "איחוד שם שכונה",
  "rooms-suffix": "הסרת \"חדרים\" ממספר החדרים",
  "number-format": "ניקוי פורמט מחיר (₪, פסיקים)",
  "date-format": "המרת פורמט תאריך",
  "date-month-only": "תאריך עם חודש בלבד",
  recomputed: "חישוב מחדש של מחיר למ\"ר",
  "duplicate-merged": "איחוד עותק כפול זהה",
  "source-precedence": "בחירת מחיר לפי עדיפות מקור",
  "same-source-price-conflict": "מחירים סותרים מאותו מקור",
  "duplicate-id-mismatch": "מזהה כפול עם פרטים שונים",
};

const THRESHOLD: Record<string, string> = {
  minPrice: "מחיר מינימלי (₪)",
  minSizeSqm: "גודל מינימלי (מ\"ר)",
  maxSizeSqm: "גודל מקסימלי (מ\"ר)",
  flagRatio: "סטייה מהחציון שמסמנת חריגה (פי)",
  quarantineRatio: "סטייה מהחציון שמעבירה להסגר (פי)",
  minCityDeals: "מינימום עסקאות בעיר להשוואה לחציון העיר",
  newBuildMaxAge: "גיל מקסימלי ל\"חדש מקבלן\" (שנים)",
};

const label = (map: Record<string, string>, key: string) => map[key] ?? key;
const show = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));

// A quarantined row is either the raw CSV row, a cleaned deal (outlier), or bare cells (malformed line).
function rowSummary(row: unknown) {
  if (Array.isArray(row)) return row.join(", ");
  const r = row as Record<string, unknown>;
  const price = r.price ?? r.price_nis;
  return [r.city, r.neighborhood, r.property_type ?? r.propertyType, r.rooms && `${r.rooms} חד׳`, r.size_sqm ?? r.sizeSqm,
    typeof price === "number" ? shekel(price) : price, r.deal_date ?? r.date, r.source]
    .filter((x) => x !== undefined && x !== null && x !== "")
    .join(" · ");
}

function dealSummary(id: string) {
  const d = dealById.get(id);
  if (!d) return "—";
  return `${d.city}${d.neighborhood ? `, ${d.neighborhood}` : ""} · ${d.propertyType} · ${d.rooms} חד׳${d.sizeSqm ? ` · ${d.sizeSqm} מ"ר` : ""} · ${shekel(d.price)} · ${formatDate(d.date)} · ${d.source}`;
}

// Cookies are read per request, so the report renders inside Suspense; only the fallback is prerendered.
export default function AdminPage() {
  return (
    <Suspense fallback={<main className="admin"><p className="loading">טוען…</p></main>}>
      <Report />
    </Suspense>
  );
}

async function Report() {
  if (!sessionValid((await cookies()).get(SESSION_COOKIE)?.value, process.env.ADMIN_PASSWORD)) redirect("/admin/login");

  const { counts } = quality;
  const pending = quality.flagged.filter((f) => f.excludeFromStats);
  const flagRows = quality.flagged.flatMap((f) => f.flags.map((flag) => ({ id: f.id, excluded: f.excludeFromStats, ...flag })));
  const flagsByReason = Map.groupBy(flagRows, (f) => f.reason);
  const changesByRule = Map.groupBy(quality.changes, (c) => c.rule);
  const totalChanges = quality.changes.length;

  return (
    <main className="admin">
      <header>
        <div>
          <h1>דוח איכות נתונים</h1>
          <p className="note">תצוגה בלבד. הנתונים הגולמיים לא משתנים; כל תיקון נעשה בשלב הניקוי ומתועד כאן.</p>
        </div>
        <div className="actions">
          <Link href="/">חזרה לאפליקציה</Link>
          <form action={logout}><button type="submit">יציאה</button></form>
        </div>
      </header>

      <section className="cards">
        <div><strong>{num(counts.rowsIn)}</strong>שורות בקובץ</div>
        <div><strong>{num(counts.dealsOut)}</strong>עסקאות בשימוש</div>
        <div><strong>{num(counts.quarantined)}</strong>בהסגר</div>
        <div><strong>{num(counts.excludedFromStats)}</strong>ממתינות לבדיקה</div>
        <div><strong>{num(flagRows.length)}</strong>סימונים</div>
        <div><strong>{num(totalChanges)}</strong>תיקונים אוטומטיים</div>
      </section>

      <section>
        <h2>בהסגר ({num(quality.quarantine.length)})</h2>
        <p className="note">לא מוצגות למשתמשים ולא נכללות בחישובים.</p>
        {quality.quarantine.length ? (
          <table>
            <thead><tr><th>מזהה</th><th>סיבה</th><th>השורה</th></tr></thead>
            <tbody>
              {quality.quarantine.map((q, i) => (
                <tr key={`${q.id}-${i}`}><td>{q.id}</td><td>{label(REASON, q.reason)}</td><td>{rowSummary(q.row)}</td></tr>
              ))}
            </tbody>
          </table>
        ) : <p>אין.</p>}
      </section>

      <section>
        <h2>ממתינות לבדיקה ({num(pending.length)})</h2>
        <p className="note">מוצגות בחיפוש עם סימון, אבל לא נכללות בחישובים עד שאדם יבדוק אותן.</p>
        {pending.length ? (
          <table>
            <thead><tr><th>מזהה</th><th>סיבה</th><th>העסקה</th></tr></thead>
            <tbody>
              {pending.map((p) => (
                <tr key={p.id}>
                  <td>{p.id}</td>
                  <td>{p.flags.map((f) => `${label(REASON, f.reason)}${typeof f.value === "number" ? ` (פי ${f.value})` : ""}`).join("; ")}</td>
                  <td>{dealSummary(p.id)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p>אין.</p>}
      </section>

      <section>
        <h2>כל הסימונים ({num(flagRows.length)})</h2>
        <p className="note">שדה מסומן נחשב לא אמין; העסקה עצמה נשארת, אלא אם מצוין שהיא מוחרגת.</p>
        {[...flagsByReason].map(([reason, rows]) => (
          <details key={reason}>
            <summary>{label(REASON, reason)} ({num(rows.length)})</summary>
            <table>
              <thead><tr><th>מזהה</th><th>שדה</th><th>ערך</th><th>מוחרגת</th><th>העסקה</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.id}-${i}`}><td>{r.id}</td><td>{r.field}</td><td>{show(r.value)}</td><td>{r.excluded ? "כן" : "לא"}</td><td>{dealSummary(r.id)}</td></tr>
                ))}
              </tbody>
            </table>
          </details>
        ))}
      </section>

      <section>
        <h2>כפילויות אפשריות במזהים שונים ({num(quality.possibleDuplicates.length)})</h2>
        {quality.possibleDuplicates.length ? (
          <ul>{quality.possibleDuplicates.map((ids) => <li key={ids.join()}>{ids.join(", ")}</li>)}</ul>
        ) : <p>אין.</p>}
      </section>

      <section>
        <h2>תיקונים אוטומטיים ({num(totalChanges)})</h2>
        {[...changesByRule].map(([rule, rows]) => (
          <details key={rule}>
            <summary>{label(RULE, rule)} ({num(rows.length)})</summary>
            <table>
              <thead><tr><th>מזהה</th><th>שדה</th><th>לפני</th><th>אחרי</th></tr></thead>
              <tbody>
                {rows.map((c, i) => (
                  <tr key={`${c.id}-${c.field}-${i}`}><td>{c.id}</td><td>{c.field}</td><td dir="auto">{show(c.from)}</td><td dir="auto">{show(c.to)}</td></tr>
                ))}
              </tbody>
            </table>
          </details>
        ))}
      </section>

      <section>
        <h2>ספים בשימוש</h2>
        <table>
          <tbody>
            {Object.entries(quality.thresholds).map(([k, v]) => <tr key={k}><td>{label(THRESHOLD, k)}</td><td>{num(v)}</td></tr>)}
          </tbody>
        </table>
      </section>
    </main>
  );
}
