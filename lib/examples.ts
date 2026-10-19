// Example questions on the start page, with their query worked out in advance:
// clicking one skips the model (instant and free). The answer is still computed from the data on each click.
import type { Query } from "./schema.ts";

export const EXAMPLES: [string, Query][] = [
  ["כמה עולה דירת 4 חדרים בכפר סבא?", { type: "stat", filters: { cities: ["כפר סבא"], rooms: { min: 4, max: 4 } }, metric: "price" }],
  ["3.2 מיליון ל-4 חדרים בכפר סבא, זה סביר?", { type: "priceCheck", filters: { cities: ["כפר סבא"], rooms: { min: 4, max: 4 } }, price: 3_200_000 }],
  ["יש לי 2 מיליון, מה אפשר לקנות?", { type: "budget", filters: {}, budget: 2_000_000 }],
  ["איפה הכי זול לקנות 3 חדרים?", { type: "ranking", filters: { rooms: { min: 3, max: 3 } }, groupBy: "city", order: "cheapest" }],
  ["רמת גן מול גבעתיים", { type: "compare", filters: {}, groups: [{ cities: ["רמת גן"] }, { cities: ["גבעתיים"] }] }],
  ["איך השתנו המחירים בחולון מאז 2022?", { type: "trend", filters: { cities: ["חולון"], dateFrom: "2022" } }],
];

export const PRESET_QUERIES = new Map(EXAMPLES);
