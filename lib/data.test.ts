// Regression test on the real CSV: pins what cleaning produces today, so any change to it is deliberate.
// If you change a cleaning rule on purpose, update these numbers and say why in DECISIONS.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CITIES } from "./aliases.ts";
import { clean } from "./clean.ts";

const { deals, report } = clean(readFileSync(new URL("../data/deals.csv", import.meta.url), "utf8"), "2026-10-19");

test("row counts: 530 in, 518 deals, 2 quarantined", () => {
  assert.equal(report.counts.rowsIn, 530);
  assert.equal(report.counts.dealsOut, 518);
  assert.deepEqual(report.quarantine.map((q) => [q.id, q.reason]).sort(), [
    ["D100251", "price-below-floor"], // ₪0
    ["D100317", "price-below-floor"], // ₪18,000
  ]);
});

test("duplicates: 6 exact copies merged, 4 resolved by source precedence, ids unique", () => {
  assert.equal(report.counts.changesByRule["duplicate-merged"], 6);
  assert.equal(report.counts.changesByRule["source-precedence"], 4);
  assert.equal(new Set(deals.map((d) => d.id)).size, deals.length);
});

test("only the two implausible penthouses are excluded from statistics", () => {
  assert.deepEqual(deals.filter((d) => d.excludeFromStats).map((d) => d.id).sort(), ["D100001", "D100193"]);
});

test("every city is canonical, and no neighborhood is left in Latin script", () => {
  assert.deepEqual([...new Set(deals.map((d) => d.city))].sort(), [...CITIES].sort());
  assert.deepEqual(deals.filter((d) => /[A-Za-z]/.test(d.neighborhood ?? "")).map((d) => d.neighborhood), []);
});

test("every deal has a price, a known date and a valid room count", () => {
  for (const d of deals) {
    assert.ok(d.price >= 100_000, d.id);
    assert.match(d.date, /^\d{4}-\d{2}(-\d{2})?$/, d.id);
    assert.ok(d.rooms >= 1 && d.rooms <= 12, d.id);
    if (d.sizeSqm !== null) assert.equal(d.pricePerSqm, Math.round(d.price / d.sizeSqm), d.id);
  }
});
