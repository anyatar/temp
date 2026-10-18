import { test } from "node:test";
import assert from "node:assert/strict";
import { clean, parseCsv, parseDate } from "./clean.ts";

const HEADER =
  "deal_id,city,neighborhood,street,property_type,rooms,size_sqm,floor,total_floors,year_built,condition,has_elevator,has_parking,has_balcony,has_safe_room,deal_date,price_nis,price_per_sqm,source";
const BASE: Record<string, string> = {
  deal_id: "D1", city: "חולון", neighborhood: "קריית שרת", street: "הרצל", property_type: "דירה", rooms: "4",
  size_sqm: "100", floor: "3", total_floors: "8", year_built: "2000", condition: "שמור", has_elevator: "כן",
  has_parking: "לא", has_balcony: "כן", has_safe_room: "כן", deal_date: "2025-01-15", price_nis: "4000000",
  price_per_sqm: "40000", source: "רשות המסים",
};
const csvField = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const csv = (...rows: Partial<Record<string, string>>[]) =>
  [HEADER, ...rows.map((r) => HEADER.split(",").map((h) => csvField(r[h] ?? BASE[h])).join(","))].join("\n");
// Enough ordinary deals that the city median is stable, so the row under test is judged against it.
const filler = Array.from({ length: 12 }, (_, i) => ({ deal_id: `F${i}` }));
const run = (...rows: Partial<Record<string, string>>[]) => clean(csv(...rows, ...filler), "2026-10-19");
const deal = (r: ReturnType<typeof run>, id = "D1") => r.deals.find((d) => d.id === id);

test("parseCsv handles quoted commas, escaped quotes and CRLF", () => {
  assert.deepEqual(parseCsv('a,b\r\n"4,331,000","הפלמ""ח"\r\n'), [["a", "b"], ["4,331,000", 'הפלמ"ח']]);
});

test("parseDate: ISO, day-first, month-only, and invalid dates", () => {
  assert.deepEqual(parseDate("2025-03-04"), { date: "2025-03-04", approx: false });
  assert.deepEqual(parseDate("03/04/2025"), { date: "2025-04-03", approx: false });
  assert.deepEqual(parseDate("17.07.2026"), { date: "2026-07-17", approx: false });
  assert.deepEqual(parseDate("Aug 2025"), { date: "2025-08", approx: true });
  assert.equal(parseDate("31/02/2025"), null);
  assert.equal(parseDate("yesterday"), null);
});

test("normalizes city aliases, rooms suffix, currency, booleans, whitespace", () => {
  const d = deal(run({ city: "ת\"א", rooms: "4 חדרים", price_nis: "₪4,000,000", has_elevator: "TRUE", has_parking: "", street: "  הרצל " }));
  assert.equal(d?.city, "תל אביב-יפו");
  assert.equal(d?.rooms, 4);
  assert.equal(d?.price, 4_000_000);
  assert.equal(d?.hasElevator, true);
  assert.equal(d?.hasParking, null); // blank is unknown, not false
  assert.equal(d?.street, "הרצל");
});

test("recomputes price per m² instead of trusting the CSV", () => {
  const r = run({ price_per_sqm: "99999" });
  assert.equal(deal(r)?.pricePerSqm, 40000);
  assert.ok(r.report.changes.some((c) => c.id === "D1" && c.rule === "recomputed"));
});

test("quarantines impossible rows and keeps them in the report", () => {
  const r = run({ deal_id: "Z", price_nis: "0" }, { deal_id: "C", city: "עיר לא קיימת" }, { deal_id: "F", deal_date: "2027-01-01" });
  const reasons = Object.fromEntries(r.report.quarantine.map((q) => [q.id, q.reason]));
  assert.deepEqual(reasons, { Z: "price-below-floor", C: "unknown-city", F: "future-date" });
  assert.equal(deal(r, "Z"), undefined);
});

test("duplicate ids: exact copies merge, cross-source conflicts follow precedence", () => {
  const r = run({}, {}, { deal_id: "D2", price_nis: "4100000", source: "מתווך" }, { deal_id: "D2", source: "רשות המסים" });
  assert.equal(r.deals.filter((d) => d.id === "D1").length, 1);
  assert.equal(deal(r, "D2")?.price, 4_000_000);
  assert.equal(deal(r, "D2")?.source, "רשות המסים");
});

test("same-source price conflict keeps both prices and leaves stats", () => {
  const d = deal(run({ source: "מתווך" }, { source: "מתווך", price_nis: "4200000" }));
  assert.deepEqual(d?.conflictingPrices, [4_000_000, 4_200_000]);
  assert.equal(d?.excludeFromStats, true);
});

test("price outliers: ~3x off is flagged, ~10x off is quarantined", () => {
  const r = run({ deal_id: "HI", price_nis: "13000000" }, { deal_id: "TYPO", price_nis: "400000", size_sqm: "100" });
  assert.equal(deal(r, "HI")?.excludeFromStats, true);
  assert.ok(r.report.quarantine.some((q) => q.id === "TYPO"));
});

test("contradictory condition becomes unknown, the row still counts", () => {
  const d = deal(run({ condition: "חדש מקבלן", year_built: "1960" }));
  assert.equal(d?.condition, null);
  assert.equal(d?.excludeFromStats, false);
});
