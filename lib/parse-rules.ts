// Keyword parser: Hebrew question → Query, with no LLM. The fallback when the model is slow, down or wrong,
// and the cross-check when it isn't. Returns null when it recognizes nothing (the UI then shows a filter form).
import { CITY_ALIASES, OTHER_PLACES, cityKey } from "./aliases.ts";
import type { Filters, Query } from "./schema.ts";

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// A whole word, allowing up to two Hebrew prefix letters (ב, ל, מ, ו, ה, ש) and a hyphen: "ברעננה", "ב-ת"א".
const wordRe = (w: string) => new RegExp(`(?:^|[\\s,.?!(])(?:[ובלמהש]{1,2}-?)?${escape(w)}(?=$|[\\s,.?!)])`);
const hasWord = (text: string, words: string[]) => words.some((w) => wordRe(w).test(text));
const hasPhrase = (text: string, phrases: string[]) => phrases.some((p) => text.includes(p));

const FORECAST = ["יעלו", "יעלה", "תחזית", "צפי", "בעתיד", "בשנה הבאה", "בשנים הבאות", "יהיו", "יהיה", "צפויים", "צפוי"];
const ADVICE = ["כדאי לקנות", "כדאי להשקיע", "השקעה", "להשקיע", "מומלץ", "כדאי לי"];
const NOT_IN_DATA = ["שכירות", "שכר דירה", "תשואה", "בתי ספר", "בית ספר", "תחבורה", "רכבת", "קרוב לים", "מחיר מבוקש", "מודעה", "מודעות"];
// Not bare "עלו": "כמה עלו" asks for a price, not a trend.
const TREND = ["מגמה", "מגמת", "השתנו", "השתנה", "התפתחו", "לאורך השנים", "לאורך זמן", "משנה לשנה", "המחירים עלו", "עלו המחירים", "המחירים ירדו", "ירדו המחירים", "עליית מחירים", "ירידת מחירים"];
const COMPARE = ["מול", "לעומת", "השוואה", "השווה", "להשוות", "בהשוואה", "ההבדל בין", "יקר יותר", "זול יותר", "יקרה יותר", "זולה יותר"];
const RANKING = ["הכי זול", "הכי יקר", "הכי זולה", "הכי יקרה", "ביותר", "דירוג", "לדרג"];
const BUDGET = ["מה אפשר לקנות", "מה אפשר לקבל", "מה ניתן לקנות", "מה ניתן לקבל", "מה אקבל", "מה אפשר להשיג", "תקציב", "יש לי"];
const PRICE_CHECK = ["סביר", "שווה", "הוגן", "יקר מדי", "זול מדי", "מחיר טוב", "מציאה", "מוגזם", "שילמתי", "ביקשו", "מבקשים", "מבקש"];
const STAT = ["כמה עולה", "כמה עולות", "כמה עלתה", "כמה עלו", "כמה עולים", "ממוצע", "חציון", "מה המחיר", "מה מחיר", "מחירי", "מחיר למ\"ר", "מחיר למטר"];

const TYPES: [string[], string][] = [
  [["פנטהאוז", "פנטהאוזים", "פנטהאוס"], "פנטהאוז"],
  [["דופלקס", "דופלקסים"], "דופלקס"],
  [["דירת גן", "דירות גן"], "דירת גן"],
  [["דירת גג", "דירות גג"], "דירת גג"],
  [["בית פרטי", "בתים פרטיים", "קוטג'", "קוטג'ים", "וילה", "וילות"], "בית פרטי"],
];
const CONDITION_WORDS: [string[], string][] = [
  [["חדש מקבלן", "חדשה מקבלן", "חדשות מקבלן", "חדשים מקבלן", "מקבלן"], "חדש מקבלן"],
  [["משופץ", "משופצת", "משופצות", "משופצים"], "משופץ"],
  [["דורש שיפוץ", "דורשת שיפוץ", "לשיפוץ"], "דורש שיפוץ"],
  [["במצב טוב"], "במצב טוב"],
  [["שמור", "שמורה", "שמורות"], "שמור"],
];
const FEATURES: [keyof Filters, string[]][] = [
  ["hasParking", ["חניה", "חנייה"]],
  ["hasElevator", ["מעלית"]],
  ["hasBalcony", ["מרפסת"]],
  ["hasSafeRoom", ['ממ"ד', "ממד", "מרחב מוגן"]],
];
const NUMBER_WORDS: Record<string, number> = {
  אחד: 1, שניים: 2, שני: 2, שתיים: 2, שלושה: 3, שלוש: 3, ארבעה: 4, ארבע: 4, חמישה: 5, חמש: 5, שישה: 6, שש: 6,
};

const MAX_WORDS = /(?:עד|מתחת ל|פחות מ|מקסימום|לא יותר מ)\s*-?\s*$/;
const MIN_WORDS = /(?:מעל|יותר מ|לפחות|מינימום|החל מ)\s*-?\s*$/;
const bound = (before: string): "min" | "max" | null => (MAX_WORDS.test(before) ? "max" : MIN_WORDS.test(before) ? "min" : null);

type Mention = { value: number; bound: "min" | "max" | null };

function money(text: string): Mention[] {
  const out: Mention[] = [];
  for (const m of text.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(מיליון|מליון|מיל'|מ'(?!")|אלף|k\b)?/gi)) {
    const n = Number(m[1].replace(/,/g, ""));
    const unit = m[2]?.toLowerCase();
    const v = unit === "אלף" || unit === "k" ? n * 1e3 : unit ? n * 1e6 : n >= 100_000 ? n : null;
    if (v) out.push({ value: v, bound: bound(text.slice(0, m.index)) });
  }
  return out;
}

const toRange = (text: string, ms: Mention[], between: boolean) => {
  // "בין 2 ל-3 מיליון": the unit is written once, after the second number.
  const b = text.match(/בין\s*(\d+(?:\.\d+)?)\s*(?:ל-?|עד)\s*(\d+(?:\.\d+)?)\s*(מיליון|מליון|מיל'|מ'(?!")|אלף)/);
  if (b) {
    const k = b[3] === "אלף" ? 1e3 : 1e6;
    return { min: Number(b[1]) * k, max: Number(b[2]) * k };
  }
  if (between && ms.length >= 2) return { min: Math.min(ms[0].value, ms[1].value), max: Math.max(ms[0].value, ms[1].value) };
  const r: { min?: number; max?: number } = {};
  for (const m of ms) if (m.bound) r[m.bound] = m.value;
  return Object.keys(r).length ? r : undefined;
};

function rooms(text: string) {
  const unit = `(?:חדרים|חד'|חד(?=\\s|$))`;
  const num = `(\\d+(?:\\.5)?|${Object.keys(NUMBER_WORDS).join("|")})`;
  const val = (s: string) => NUMBER_WORDS[s] ?? Number(s);
  const range = text.match(new RegExp(`${num}\\s*(?:-|עד)\\s*${num}\\s*${unit}`));
  if (range) return { min: val(range[1]), max: val(range[2]) };
  const m = text.match(new RegExp(`${num}\\s*${unit}`));
  if (!m) return undefined;
  const b = bound(text.slice(0, m.index));
  return b ? { [b]: val(m[1]) } : { min: val(m[1]), max: val(m[1]) };
}

function size(text: string) {
  const m = text.match(/(\d+)\s*(?:מ"ר|מטר(?:ים)?)/);
  if (!m) return {};
  const b = bound(text.slice(0, m.index));
  const v = Number(m[1]);
  return b ? { range: { [b]: v } } : { point: v };
}

function dates(text: string): Pick<Filters, "dateFrom" | "dateTo"> {
  const from = text.match(/(?:מאז|החל מ|משנת|מ-?)\s*(20\d\d)(?!\d)/);
  const to = text.match(/(?:עד|לפני)\s*(20\d\d)(?!\d)/);
  const inYear = !from && !to && text.match(/(?:ב-?|בשנת)\s*(20\d\d)(?!\d)/);
  if (inYear) return { dateFrom: inYear[1], dateTo: inYear[1] };
  return { ...(from && { dateFrom: from[1] }), ...(to && { dateTo: to[1] }) };
}

export type Vocabulary = { neighborhoods: Map<string, string[]> }; // neighborhood → cities it appears in

export function parseRules(question: string, vocab: Vocabulary): Query | null {
  const text = question.replace(/[״“”]/g, '"').replace(/[׳‘’`]/g, "'").replace(/\s+/g, " ").trim();
  const cityText = cityKey(text);

  if (hasPhrase(text, FORECAST)) return { type: "unsupported", reason: "forecast" };
  if (hasPhrase(text, ADVICE)) return { type: "unsupported", reason: "advice" };
  if (hasPhrase(text, NOT_IN_DATA)) return { type: "unsupported", reason: "notInData" };

  const cities = [...new Set([...CITY_ALIASES].filter(([alias]) => wordRe(alias).test(cityText)).map(([, c]) => c))];
  const other = OTHER_PLACES.find((p) => wordRe(p).test(text));
  if (other && !cities.length) return { type: "unsupported", reason: "notInData", detail: other };

  const neighborhoods: string[] = [];
  for (const [name, inCities] of vocab.neighborhoods) {
    if (name.length < 3 || !wordRe(name).test(text)) continue;
    if (cities.length ? inCities.some((c) => cities.includes(c)) : inCities.length === 1) {
      neighborhoods.push(name);
      if (!cities.length) cities.push(inCities[0]);
    }
  }

  const between = /בין\s/.test(text);
  const prices = money(text);
  const sz = size(text);
  const filters: Filters = {
    ...(cities.length && { cities }),
    ...(neighborhoods.length && { neighborhoods }),
    ...dates(text),
  };
  const types = TYPES.filter(([ws]) => hasWord(text, ws)).map(([, t]) => t);
  if (types.length) filters.propertyTypes = types;
  const conditions = CONDITION_WORDS.filter(([ws]) => hasWord(text, ws)).map(([, c]) => c);
  if (conditions.length) filters.conditions = conditions;
  const r = rooms(text);
  if (r) filters.rooms = r;
  if (sz.range) filters.sizeSqm = sz.range;
  const priceRange = toRange(text, prices, between);
  if (priceRange) filters.price = priceRange;
  for (const [key, ws] of FEATURES) {
    if (ws.some((w) => new RegExp(`(?:בלי|ללא|אין)\\s+${escape(w)}`).test(text))) (filters as Record<string, unknown>)[key] = false;
    else if (hasWord(text, ws)) (filters as Record<string, unknown>)[key] = true;
  }

  const point = prices.find((p) => !p.bound && !between)?.value;
  const perSqm = /מ"ר|מטר/.test(text) && !sz.point && !sz.range;

  if (hasPhrase(text, TREND) && !point) return { type: "trend", filters };

  if (hasPhrase(text, COMPARE)) {
    const split = (key: "cities" | "neighborhoods" | "propertyTypes") => {
      // Sides in the order the user wrote them; a value not written verbatim (an alias) goes last.
      const at = (v: string) => (cityText.indexOf(cityKey(v)) + 1 || Infinity);
      const vals = filters[key] && [...filters[key]].sort((a, b) => at(a) - at(b));
      if (!vals || vals.length < 2) return null;
      const { [key]: _, ...rest } = filters;
      return { type: "compare" as const, filters: rest, groups: [{ [key]: [vals[0]] }, { [key]: [vals[1]] }] };
    };
    const q = split("cities") ?? split("neighborhoods") ?? split("propertyTypes");
    if (q) return q;
  }

  if (hasPhrase(text, RANKING) && /זול|יקר/.test(text))
    return {
      type: "ranking",
      filters,
      groupBy: /שכונ/.test(text) || cities.length === 1 ? "neighborhood" : "city",
      order: /יקר/.test(text) ? "mostExpensive" : "cheapest",
    };

  if (point && hasPhrase(text, BUDGET)) return { type: "budget", filters, budget: point };
  if (point && hasPhrase(text, PRICE_CHECK)) return { type: "priceCheck", filters, price: point, ...(sz.point && { sizeSqm: sz.point }) };
  if (hasPhrase(text, STAT)) return { type: "stat", filters, metric: perSqm ? "pricePerSqm" : "price" };
  if (sz.point) filters.sizeSqm = { min: Math.round(sz.point * 0.9), max: Math.round(sz.point * 1.1) };

  return Object.keys(filters).length ? { type: "search", filters } : null;
}
