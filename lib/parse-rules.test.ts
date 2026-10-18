import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRules } from "./parse-rules.ts";

const vocab = {
  neighborhoods: new Map([
    ["נאות רחל", ["חולון"]],
    ["קריית שרת", ["חולון"]],
    ["פלורנטין", ["תל אביב-יפו"]],
    ["מרכז", ["רמת גן", "בת ים"]],
  ]),
};

// [question, expected subset of the parsed Query]
const CASES: [string, object | null][] = [
  // search
  ["דירות 4 חדרים ברעננה עם חניה עד 3 מיליון", { type: "search", filters: { cities: ["רעננה"], rooms: { min: 4, max: 4 }, hasParking: true, price: { max: 3_000_000 } } }],
  ["פנטהאוז בתל אביב", { type: "search", filters: { cities: ["תל אביב-יפו"], propertyTypes: ["פנטהאוז"] } }],
  ['דירות בת"א בלי מעלית', { type: "search", filters: { cities: ["תל אביב-יפו"], hasElevator: false } }],
  ["דירת גן בנאות רחל", { type: "search", filters: { cities: ["חולון"], neighborhoods: ["נאות רחל"], propertyTypes: ["דירת גן"] } }],
  ["3-4 חדרים בחיפה עם ממ\"ד", { type: "search", filters: { cities: ["חיפה"], rooms: { min: 3, max: 4 }, hasSafeRoom: true } }],
  ["דירות בין 2 ל-3 מיליון בחולון", { type: "search", filters: { cities: ["חולון"], price: { min: 2_000_000, max: 3_000_000 } } }],
  ["דירה חדשה מקבלן בבאר שבע", { type: "search", filters: { cities: ["באר שבע"], conditions: ["חדש מקבלן"] } }],
  ["דירות במודיעין שנמכרו ב-2024", { type: "search", filters: { cities: ["מודיעין-מכבים-רעות"], dateFrom: "2024", dateTo: "2024" } }],
  ["לפחות 5 חדרים ברמת גן", { type: "search", filters: { cities: ["רמת גן"], rooms: { min: 5 } } }],
  ["דירות ארבעה חדרים בב\"ש", { type: "search", filters: { cities: ["באר שבע"], rooms: { min: 4, max: 4 } } }],
  // stat
  ["כמה עולה דירת 4 חדרים בכפר סבא?", { type: "stat", metric: "price", filters: { cities: ["כפר סבא"], rooms: { min: 4, max: 4 } } }],
  ['כמה עולה מ"ר בגבעתיים?', { type: "stat", metric: "pricePerSqm", filters: { cities: ["גבעתיים"] } }],
  ["מה המחיר הממוצע לפנטהאוז בהרצליה", { type: "stat", metric: "price", filters: { cities: ["הרצליה"], propertyTypes: ["פנטהאוז"] } }],
  ["כמה עלו דירות בפלורנטין", { type: "stat", filters: { cities: ["תל אביב-יפו"], neighborhoods: ["פלורנטין"] } }],
  // price check
  ["3.2 מיליון ל-4 חדרים בכפר סבא, זה סביר?", { type: "priceCheck", price: 3_200_000, filters: { cities: ["כפר סבא"], rooms: { min: 4, max: 4 } } }],
  ['מבקשים 2,900,000 על 90 מ"ר בחולון, זה יקר מדי?', { type: "priceCheck", price: 2_900_000, sizeSqm: 90, filters: { cities: ["חולון"] } }],
  // budget
  ["יש לי 2 מיליון, מה אפשר לקנות?", { type: "budget", budget: 2_000_000 }],
  ["מה אפשר לקבל ב-3.5 מיליון ברחובות?", { type: "budget", budget: 3_500_000, filters: { cities: ["רחובות"] } }],
  // ranking
  ["איפה הכי זול לקנות 3 חדרים?", { type: "ranking", groupBy: "city", order: "cheapest", filters: { rooms: { min: 3, max: 3 } } }],
  ["מה השכונה הכי יקרה בחולון?", { type: "ranking", groupBy: "neighborhood", order: "mostExpensive", filters: { cities: ["חולון"] } }],
  ["הערים הזולות ביותר לדירת גן", { type: "ranking", groupBy: "city", order: "cheapest", filters: { propertyTypes: ["דירת גן"] } }],
  // compare
  ["רמת גן מול גבעתיים", { type: "compare", groups: [{ cities: ["רמת גן"] }, { cities: ["גבעתיים"] }] }],
  ["פנטהאוז לעומת דופלקס בנתניה", { type: "compare", filters: { cities: ["נתניה"] }, groups: [{ propertyTypes: ["פנטהאוז"] }, { propertyTypes: ["דופלקס"] }] }],
  // trend
  ["איך השתנו המחירים בחולון מאז 2022?", { type: "trend", filters: { cities: ["חולון"], dateFrom: "2022" } }],
  ["מגמת המחירים בירושלים", { type: "trend", filters: { cities: ["ירושלים"] } }],
  // unsupported
  ["האם המחירים יעלו בשנה הבאה?", { type: "unsupported", reason: "forecast" }],
  ["כדאי להשקיע בבת ים?", { type: "unsupported", reason: "advice" }],
  ["כמה עולה שכירות בהרצליה?", { type: "unsupported", reason: "notInData" }],
  ["דירות באילת", { type: "unsupported", reason: "notInData", detail: "אילת" }],
  // nothing recognized → filter form
  ["שלום, מה שלומך?", null],
];

for (const [question, expected] of CASES)
  test(question, () => {
    const q = parseRules(question, vocab);
    if (expected === null) assert.equal(q, null);
    else assert.partialDeepStrictEqual(q, expected);
  });
