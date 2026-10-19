"use client";

import { useState } from "react";
import type { Deal } from "@/lib/clean.ts";
import type { Answer } from "@/lib/engine.ts";
import type { Query } from "@/lib/schema.ts";
import {
  FLAG_LABEL, TYPE_LABEL, WIDENED, describeFilters, formatDate, num, shekel, unsupportedMessage, verdict,
} from "@/lib/render.ts";

export type AskResponse = {
  question: string;
  parsedBy: "preset" | "llm" | "rules" | null;
  query?: Query;
  alternative?: Query;
  answer?: Answer;
};

const DEALS_PAGE = 10;
const perSqm = (metric: string) => (metric === "pricePerSqm" ? ' למ"ר' : "");
const basis = (n: number, span: [string, string] | null) =>
  span ? `על סמך ${num(n)} עסקאות, ${formatDate(span[0])}–${formatDate(span[1])}` : "";

export function AnswerView({ res }: { res: AskResponse }) {
  const { answer: a, query } = res;
  if (!a || !query) return <p>{unsupportedMessage("other")}</p>;
  if (a.type === "unsupported") return <p>{unsupportedMessage(a.reason, a.detail)}</p>;

  return (
    <div className="answer">
      <Interpretation query={query} />
      <Body a={a} />
      {"widened" in a && a.widened?.map((w) => <p key={w} className="note">{WIDENED[w]}</p>)}
      {"excluded" in a && a.excluded > 0 && (
        <p className="note">לא כולל {num(a.excluded)} עסקאות חריגות שממתינות לבדיקה.</p>
      )}
      {res.parsedBy === "rules" && (
        <p className="note">שירות ה-AI לא זמין כרגע, לכן השאלה פוענחה לפי מילות מפתח. בדקו שההבנה למעלה נכונה.</p>
      )}
      {res.alternative && res.alternative.type !== "unsupported" && (
        <p className="note">
          שימו לב: פענוח לפי מילות מפתח הבין את השאלה אחרת ({describeFilters(res.alternative.filters).join(", ")}). אם לזה
          התכוונתם, נסחו את השאלה מחדש.
        </p>
      )}
    </div>
  );
}

function Interpretation({ query }: { query: Query }) {
  if (query.type === "unsupported") return null;
  const chips = describeFilters(query.filters);
  return (
    <div className="chips" aria-label="איך הבנתי את השאלה">
      <span className="chip type">{TYPE_LABEL[query.type]}</span>
      {chips.map((c) => <span key={c} className="chip">{c}</span>)}
      {query.type === "compare" &&
        query.groups.map((g, i) => <span key={i} className="chip">{describeFilters(g).join(", ")}</span>)}
    </div>
  );
}

function Body({ a }: { a: Exclude<Answer, { type: "unsupported" }> }) {
  switch (a.type) {
    case "search":
      if (!a.n) return <p>לא נמצאו עסקאות שמתאימות לחיפוש. נסו להרחיב את התנאים.</p>;
      return (
        <>
          <p>
            נמצאו {num(a.n)} עסקאות{a.dateSpan && `, בין ${formatDate(a.dateSpan[0])} ל-${formatDate(a.dateSpan[1])}`}.
            {a.n > a.deals.length && ` מוצגות ${a.deals.length} האחרונות.`}
          </p>
          <Deals deals={a.deals} />
        </>
      );

    case "stat":
      if (!a.n) return <p>לא נמצאו עסקאות שמתאימות לשאלה.</p>;
      if (!a.summary) return <TooFew n={a.n} deals={a.deals} />;
      return (
        <>
          <p className="headline">
            מחיר חציוני{perSqm(a.metric)}: <strong>{shekel(a.summary.median)}</strong>
          </p>
          <p>
            מחצית העסקאות נעו בין {shekel(a.summary.p25)} ל-{shekel(a.summary.p75)}. {basis(a.n, a.dateSpan)}.
          </p>
          <Deals deals={a.deals} />
        </>
      );

    case "priceCheck":
      if (!a.n) return <p>לא נמצאו עסקאות דומות להשוואה.</p>;
      if (!a.summary || a.percentile === null) return <TooFew n={a.n} deals={a.deals} />;
      return (
        <>
          <p className="headline">
            {shekel(a.asked)}{perSqm(a.metric)} הוא <strong>{verdict(a.percentile)}</strong>
          </p>
          <p>
            {a.percentile}% מהעסקאות הדומות נסגרו במחיר נמוך יותר. המחיר החציוני{perSqm(a.metric)}: {shekel(a.summary.median)},
            ומחצית העסקאות נעו בין {shekel(a.summary.p25)} ל-{shekel(a.summary.p75)}. {basis(a.n, a.dateSpan)}.
          </p>
          <Deals deals={a.deals} />
        </>
      );

    case "budget":
      if (!a.n) return <p>לא נמצאו עסקאות בטווח המחירים הזה.</p>;
      return (
        <>
          <p>
            בטווח {shekel(a.filters.price!.min!)}–{shekel(a.filters.price!.max!)} נסגרו {num(a.n)} עסקאות.{" "}
            {basis(a.n, a.dateSpan)}.
          </p>
          <table>
            <thead><tr><th>עיר</th><th>עסקאות</th><th>חדרים</th><th>גודל חציוני</th></tr></thead>
            <tbody>
              {a.groups.map((g) => (
                <tr key={g.key}>
                  <td>{g.key}</td>
                  <td>{num(g.n)}</td>
                  <td>{g.rooms.min === g.rooms.max ? g.rooms.min : `${g.rooms.min}–${g.rooms.max}`}</td>
                  <td>{g.sizeSqm ? `${num(g.sizeSqm.median)} מ"ר` : "מעט מדי עסקאות"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Deals deals={a.deals} />
        </>
      );

    case "ranking":
      if (!a.groups.length) return <p>אין מספיק עסקאות כדי לדרג (צריך לפחות 5 עסקאות בכל אזור).</p>;
      return (
        <>
          <p>מחיר חציוני למ"ר, {a.order === "cheapest" ? "מהזול ליקר" : "מהיקר לזול"}. {basis(a.n, a.dateSpan)}.</p>
          <ol className="ranking">
            {a.groups.map((g) => (
              <li key={g.key}>
                <span>{g.key}</span>
                <span>{shekel(g.summary!.median)} <small>({num(g.n)} עסקאות)</small></span>
              </li>
            ))}
          </ol>
          {a.tooFewDeals > 0 && <p className="note">{num(a.tooFewDeals)} אזורים לא דורגו כי יש בהם פחות מ-5 עסקאות.</p>}
        </>
      );

    case "compare": {
      const [x, y] = a.sides;
      const label = (i: number) => describeFilters(a.groups[i]).join(", ");
      const diff = x.summary && y.summary ? Math.round((y.summary.median / x.summary.median - 1) * 100) : null;
      return (
        <>
          <div className="sides">
            {a.sides.map((s, i) => (
              <div key={i} className="side">
                <h3>{label(i)}</h3>
                {s.summary ? (
                  <>
                    <p className="headline"><strong>{shekel(s.summary.median)}</strong> למ"ר (חציון)</p>
                    <p className="note">{basis(s.n, s.dateSpan)}</p>
                  </>
                ) : (
                  <p>יש רק {num(s.n)} עסקאות: מעט מדי להשוואה.</p>
                )}
              </div>
            ))}
          </div>
          {diff !== null && (
            <p>
              המחיר החציוני למ"ר ב{label(1)} {diff === 0 ? "זהה לזה" : `${diff > 0 ? "גבוה" : "נמוך"} ב-${Math.abs(diff)}% מזה`} ב{label(0)}.
            </p>
          )}
        </>
      );
    }

    case "trend":
      if (!a.years.length) return <p>לא נמצאו עסקאות שמתאימות לשאלה.</p>;
      return (
        <>
          <p>מחיר חציוני למ"ר לפי שנה. {basis(a.n, a.dateSpan)}.</p>
          <table>
            <thead><tr><th>שנה</th><th>מחיר חציוני למ"ר</th><th>עסקאות</th></tr></thead>
            <tbody>
              {a.years.map((y) => (
                <tr key={y.key}>
                  <td>{y.key}{y.partial && <small> (שנה חלקית)</small>}</td>
                  <td>{y.summary ? shekel(y.summary.median) : "מעט מדי עסקאות"}</td>
                  <td>{num(y.n)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      );
  }
}

function TooFew({ n, deals }: { n: number; deals: Deal[] }) {
  return (
    <>
      <p>נמצאו רק {num(n)} עסקאות מתאימות: מעט מדי לחישוב מחיר טיפוסי. אלה העסקאות עצמן:</p>
      <Deals deals={deals} />
    </>
  );
}

const yesNo = (v: boolean | null) => (v === null ? "לא ידוע" : v ? "כן" : "לא");

function Deals({ deals }: { deals: Deal[] }) {
  const [shown, setShown] = useState(DEALS_PAGE);
  if (!deals.length) return null;
  return (
    <div className="deals">
      {deals.slice(0, shown).map((d) => (
        <details key={d.id} className="deal">
          <summary>
            <span>
              {d.city}{d.neighborhood && `, ${d.neighborhood}`} · {d.propertyType} · {d.rooms} חד׳
              {d.sizeSqm && ` · ${d.sizeSqm} מ"ר`}
            </span>
            <span className="price">
              {d.conflictingPrices ? d.conflictingPrices.map(shekel).join(" / ") : shekel(d.price)}
              <small>{formatDate(d.date)}</small>
            </span>
          </summary>
          <dl>
            <dt>מחיר למ"ר</dt><dd>{d.pricePerSqm ? shekel(d.pricePerSqm) : "לא ידוע"}</dd>
            <dt>קומה</dt><dd>{d.floor ?? "?"}{d.totalFloors && ` מתוך ${d.totalFloors}`}</dd>
            <dt>שנת בנייה</dt><dd>{d.yearBuilt ?? "לא ידוע"}</dd>
            <dt>מצב</dt><dd>{d.condition ?? "לא ידוע"}</dd>
            <dt>מעלית</dt><dd>{yesNo(d.hasElevator)}</dd>
            <dt>חניה</dt><dd>{yesNo(d.hasParking)}</dd>
            <dt>מרפסת</dt><dd>{yesNo(d.hasBalcony)}</dd>
            <dt>ממ"ד</dt><dd>{yesNo(d.hasSafeRoom)}</dd>
            <dt>מקור</dt><dd>{d.source}</dd>
            <dt>תאריך</dt><dd>{formatDate(d.date)}{d.dateApprox && " (חודש בלבד)"}</dd>
          </dl>
          {d.flags.filter((f) => FLAG_LABEL[f.reason]).map((f) => (
            <p key={f.reason} className="flag">{FLAG_LABEL[f.reason]}</p>
          ))}
        </details>
      ))}
      {deals.length > shown && (
        <button type="button" className="more" onClick={() => setShown(shown + DEALS_PAGE)}>
          הצג עוד עסקאות
        </button>
      )}
    </div>
  );
}
