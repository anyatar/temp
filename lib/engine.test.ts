import { test } from "node:test";
import assert from "node:assert/strict";
import type { Deal } from "./clean.ts";
import { MIN_N, answer, summarize } from "./engine.ts";

let seq = 0;
const mk = (p: Partial<Deal> = {}): Deal => {
  const price = p.price ?? 4_000_000;
  const sizeSqm = p.sizeSqm === undefined ? 100 : p.sizeSqm;
  return {
    id: `T${seq++}`, city: "חולון", neighborhood: "קריית שרת", street: "הרצל", propertyType: "דירה", rooms: 4,
    floor: 2, totalFloors: 8, yearBuilt: 2000, condition: "שמור", hasElevator: true, hasParking: true,
    hasBalcony: true, hasSafeRoom: false, date: "2025-01-01", dateApprox: false, source: "רשות המסים",
    flags: [], excludeFromStats: false, ...p, price, sizeSqm, pricePerSqm: sizeSqm ? Math.round(price / sizeSqm) : null,
  };
};
const many = (k: number, p: Partial<Deal> = {}) => Array.from({ length: k }, (_, i) => mk({ price: 3_000_000 + i * 100_000, ...p }));

test("summarize refuses to compute below MIN_N", () => {
  assert.equal(summarize([1, 2, 3, 4]), null);
  assert.deepEqual(summarize([1, 2, 3, 4, 5]), { n: 5, median: 3, p25: 2, p75: 4, min: 1, max: 5 });
  assert.equal(MIN_N, 5);
});

test("stat excludes flagged deals, counts them, and reports n", () => {
  const deals = [...many(5), mk({ price: 40_000_000, excludeFromStats: true })];
  const a = answer({ type: "stat", filters: { cities: ["חולון"] }, metric: "price" }, deals);
  assert.equal(a.type === "stat" && a.n, 5);
  assert.equal(a.type === "stat" && a.excluded, 1);
  assert.equal(a.type === "stat" && a.summary?.median, 3_200_000);
});

test("stat widens neighborhood → city when there are too few deals, and says so", () => {
  const deals = [...many(2, { neighborhood: "נאות רחל" }), ...many(4, { neighborhood: "אחרת" })];
  const a = answer({ type: "stat", filters: { cities: ["חולון"], neighborhoods: ["נאות רחל"] }, metric: "price" }, deals);
  assert.ok(a.type === "stat");
  assert.deepEqual(a.widened, ["neighborhood"]);
  assert.equal(a.n, 6);
});

test("stat with no possible widening and too few deals returns no summary", () => {
  const a = answer({ type: "stat", filters: { cities: ["חולון"] }, metric: "price" }, many(3));
  assert.ok(a.type === "stat");
  assert.equal(a.summary, null);
  assert.equal(a.deals.length, 3);
});

test("unknown values never match a filter", () => {
  const deals = [mk({ condition: null }), mk({ hasParking: null })];
  const a = answer({ type: "search", filters: { conditions: ["שמור"], hasParking: true } }, deals);
  assert.equal(a.type === "search" && a.n, 0);
});

test("priceCheck: percentile by price per m² when size is given", () => {
  const deals = many(10); // 30,000–39,000 per m²
  const a = answer({ type: "priceCheck", filters: {}, price: 3_550_000, sizeSqm: 100 }, deals);
  assert.ok(a.type === "priceCheck");
  assert.equal(a.metric, "pricePerSqm");
  assert.equal(a.percentile, 60);
});

test("budget looks at deals priced 80–100% of the budget, grouped by city", () => {
  const deals = [mk({ price: 1_500_000 }), mk({ price: 1_900_000 }), mk({ price: 2_000_000, city: "בת ים" }), mk({ price: 2_100_000 })];
  const a = answer({ type: "budget", filters: {}, budget: 2_000_000 }, deals);
  assert.ok(a.type === "budget");
  assert.equal(a.n, 2);
  assert.deepEqual(a.groups.map((g) => g.key).sort(), ["בת ים", "חולון"]);
});

test("ranking keeps only groups with enough deals and reports the rest", () => {
  const deals = [...many(5, { city: "חולון" }), ...many(5, { city: "בת ים", price: 2_000_000 }), ...many(2, { city: "חיפה" })];
  const a = answer({ type: "ranking", filters: {}, groupBy: "city", order: "cheapest" }, deals);
  assert.ok(a.type === "ranking");
  assert.deepEqual(a.groups.map((g) => g.key), ["בת ים", "חולון"]);
  assert.equal(a.tooFewDeals, 1);
});

test("compare does not widen either side", () => {
  const deals = [...many(5, { city: "חולון" }), ...many(2, { city: "בת ים" })];
  const a = answer({ type: "compare", filters: {}, groups: [{ cities: ["חולון"] }, { cities: ["בת ים"] }] }, deals);
  assert.ok(a.type === "compare");
  assert.equal(a.sides[0].summary?.n, 5);
  assert.equal(a.sides[1].summary, null);
});

test("trend marks the last year partial and thin years without a median", () => {
  const deals = [...many(5, { date: "2024-03-01" }), ...many(2, { date: "2025-07-01" })];
  const a = answer({ type: "trend", filters: {} }, deals);
  assert.ok(a.type === "trend");
  assert.deepEqual(a.years.map((y) => [y.key, y.partial, y.summary !== null]), [["2024", false, true], ["2025", true, false]]);
});
