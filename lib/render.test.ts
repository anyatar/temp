import { test } from "node:test";
import assert from "node:assert/strict";
import { describeFilters, formatDate, unsupportedMessage, verdict } from "./render.ts";

test("describeFilters turns a query into readable Hebrew chips", () => {
  assert.deepEqual(
    describeFilters({ cities: ["רעננה"], rooms: { min: 4, max: 4 }, price: { max: 3_000_000 }, hasParking: true, hasElevator: false, dateFrom: "2024", dateTo: "2024" }),
    ["רעננה", "4 חדרים", "עד ₪3,000,000", "עם חניה", "בלי מעלית", "ב-2024"],
  );
  assert.deepEqual(describeFilters({ rooms: { min: 5 }, dateFrom: "2022" }), ["לפחות 5 חדרים", "מאז 2022"]);
  assert.deepEqual(describeFilters({}), []);
});

test("verdict bands by percentile", () => {
  assert.equal(verdict(10), "נמוך מרוב העסקאות הדומות");
  assert.equal(verdict(50), "בטווח המקובל של עסקאות דומות");
  assert.equal(verdict(90), "גבוה מרוב העסקאות הדומות");
});

test("dates and declines", () => {
  assert.equal(formatDate("2025-03-04"), "04/03/2025");
  assert.equal(formatDate("2025-08"), "08/2025");
  assert.equal(unsupportedMessage("notInData", "אילת"), "אין במאגר עסקאות באילת.");
});
