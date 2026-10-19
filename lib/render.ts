// Hebrew wording for answers. Pure functions: every number shown comes from the engine's result.
import type { Filters, Query } from "./schema.ts";

const nf = new Intl.NumberFormat("he-IL");
export const shekel = (n: number) => `₪${nf.format(Math.round(n))}`;
export const num = (n: number) => nf.format(n);

// "2025-03-04" → "04/03/2025"; "2025-03" (month only) → "03/2025"
export const formatDate = (d: string) => (d.length === 7 ? `${d.slice(5)}/${d.slice(0, 4)}` : `${d.slice(8)}/${d.slice(5, 7)}/${d.slice(0, 4)}`);

type Range = { min?: number; max?: number };
const range = (r: Range, fmt: (n: number) => string) =>
  r.min !== undefined && r.max !== undefined
    ? r.min === r.max ? fmt(r.min) : `${fmt(r.min)}–${fmt(r.max)}`
    : r.min !== undefined ? `לפחות ${fmt(r.min)}` : `עד ${fmt(r.max!)}`;

const FEATURES: [keyof Filters, string][] = [
  ["hasParking", "חניה"], ["hasElevator", "מעלית"], ["hasBalcony", "מרפסת"], ["hasSafeRoom", 'ממ"ד'],
];

// The filters as short Hebrew chips: what the system understood.
export function describeFilters(f: Filters): string[] {
  const out: string[] = [];
  if (f.cities?.length) out.push(f.cities.join(" / "));
  if (f.neighborhoods?.length) out.push(`שכונת ${f.neighborhoods.join(" / ")}`);
  if (f.streets?.length) out.push(`רחוב ${f.streets.join(" / ")}`);
  if (f.propertyTypes?.length) out.push(f.propertyTypes.join(" / "));
  if (f.rooms) out.push(`${range(f.rooms, num)} חדרים`);
  if (f.sizeSqm) out.push(`${range(f.sizeSqm, num)} מ"ר`);
  if (f.price) out.push(range(f.price, shekel));
  if (f.pricePerSqm) out.push(`${range(f.pricePerSqm, shekel)} למ"ר`);
  if (f.conditions?.length) out.push(f.conditions.join(" / "));
  for (const [key, word] of FEATURES) if (f[key] !== undefined) out.push(`${f[key] ? "עם" : "בלי"} ${word}`);
  if (f.dateFrom && f.dateFrom === f.dateTo) out.push(`ב-${f.dateFrom}`);
  else {
    if (f.dateFrom) out.push(`מאז ${f.dateFrom}`);
    if (f.dateTo) out.push(`עד ${f.dateTo}`);
  }
  return out;
}

export const TYPE_LABEL: Record<Query["type"], string> = {
  search: "חיפוש עסקאות",
  stat: "מחיר טיפוסי",
  priceCheck: "בדיקת מחיר",
  budget: "מה אפשר לקנות",
  ranking: "דירוג",
  compare: "השוואה",
  trend: "מגמת מחירים",
  unsupported: "",
};

// percentile = share of comparable deals priced below the asked price
export const verdict = (percentile: number) =>
  percentile < 25 ? "נמוך מרוב העסקאות הדומות" : percentile > 75 ? "גבוה מרוב העסקאות הדומות" : "בטווח המקובל של עסקאות דומות";

export const WIDENED: Record<string, string> = {
  street: "לא היו מספיק עסקאות ברחוב, לכן החיפוש הורחב לכל האזור.",
  neighborhood: "לא היו מספיק עסקאות בשכונה, לכן החיפוש הורחב לכל העיר.",
  rooms: "לא היו מספיק עסקאות במספר החדרים המבוקש, לכן הטווח הורחב בחצי חדר לכל כיוון.",
};

export function unsupportedMessage(reason: string, detail?: string) {
  switch (reason) {
    case "forecast":
      return "אני לא חוזה מחירים עתידיים. אני מתאר רק עסקאות שכבר נסגרו, למשל איך השתנו המחירים בעיר מסוימת לאורך השנים.";
    case "advice":
      return "אני לא נותן ייעוץ השקעות או המלצות קנייה. אפשר לבדוק מחיר מול עסקאות דומות, או לראות מה נמכר בתקציב מסוים.";
    case "notInData":
      return detail
        ? `אין במאגר עסקאות ב${detail}.`
        : "המידע הזה לא קיים במאגר. יש בו רק עסקאות מכירה שנסגרו: מחיר, גודל, חדרים, מיקום ומאפייני הנכס.";
    default:
      return "לא הצלחתי להבין את השאלה. נסו לציין עיר, מספר חדרים, מחיר או סוג נכס.";
  }
}

export const FLAG_LABEL: Record<string, string> = {
  "price-per-sqm-off-median": "מחיר חריג ביחס לעיר: ממתין לבדיקה ולא נכלל בחישובים",
  "same-source-price-conflict": "דווחו מחירים סותרים מאותו מקור: לא נכלל בחישובים",
  "new-but-old-building": "המצב \"חדש מקבלן\" סותר את שנת הבנייה, ולכן המצב לא ידוע",
  "duplicate-id-mismatch": "דווח פעמיים עם פרטים שונים: לא נכלל בחישובים",
};
