import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_QUESTION, ask } from "./ask.ts";
import { EXAMPLES } from "./examples.ts";
import type { Deal } from "./clean.ts";
import type { LlmResult } from "./parse-llm.ts";
import type { Query } from "./schema.ts";

const deal = (i: number, city: string): Deal => ({
  id: `T${city}${i}`, city, neighborhood: null, street: "הרצל", propertyType: "דירה", rooms: 4, sizeSqm: 100,
  floor: 1, totalFloors: 4, yearBuilt: 2000, condition: "שמור", hasElevator: true, hasParking: true, hasBalcony: true,
  hasSafeRoom: true, date: "2025-01-01", dateApprox: false, price: 3_000_000 + i * 100_000, pricePerSqm: 30_000 + i * 1000,
  source: "רשות המסים", flags: [], excludeFromStats: false,
});
const deals = [...Array.from({ length: 6 }, (_, i) => deal(i, "חולון")), ...Array.from({ length: 6 }, (_, i) => deal(i, "בת ים"))];
const vocab = { neighborhoods: new Map<string, string[]>() };

const modelSays = (query: Query) => async (): Promise<LlmResult> => ({ ok: true, query, ms: 5, usage: {} as never });
const modelFails = async (): Promise<LlmResult> => ({ ok: false, error: "timeout", ms: 4000 });
const run = (question: unknown, llm: () => Promise<LlmResult>) => ask({ question }, { deals, vocab, llm });

test("rejects missing, empty, non-string and overlong questions without calling the model", async () => {
  let called = false;
  const llm = async (): Promise<LlmResult> => { called = true; return modelFails(); };
  for (const q of [undefined, "", "   ", 42, "א".repeat(MAX_QUESTION + 1)]) assert.equal((await run(q, llm)).status, 400);
  assert.equal((await ask(null, { deals, vocab, llm })).status, 400); // body that isn't JSON
  assert.equal(called, false);
});

test("uses the model's query when it succeeds", async () => {
  const r = await run("כמה עולה דירה בחולון?", modelSays({ type: "stat", filters: { cities: ["חולון"] }, metric: "price" }));
  assert.equal(r.body.parsedBy, "llm");
  assert.equal((r.body.answer as { n: number }).n, 6);
  assert.equal(r.body.alternative, undefined);
});

test("falls back to the rule parser when the model fails, and says why", async () => {
  const r = await run("כמה עולה דירה בחולון?", modelFails);
  assert.equal(r.body.parsedBy, "rules");
  assert.deepEqual(r.body.query, { type: "stat", filters: { cities: ["חולון"] }, metric: "price" });
  assert.deepEqual(r.body.llm, { ok: false, error: "timeout", ms: 4000 });
});

test("nothing understood: no query, no answer", async () => {
  const r = await run("שלום", modelFails);
  assert.equal(r.status, 200);
  assert.equal(r.body.parsedBy, null);
  assert.equal(r.body.answer, undefined);
});

test("parsers disagree on a city the rules saw: answer with the model, offer the rules' reading", async () => {
  const r = await run("דירות בחולון", modelSays({ type: "search", filters: { cities: ["בת ים"] } }));
  assert.equal(r.body.parsedBy, "llm");
  assert.deepEqual((r.body.alternative as Query & { type: "search" }).filters.cities, ["חולון"]);
});

test("no warning when the model finds a city the rules missed", async () => {
  const r = await run("דירות בעיר הלבנה", modelSays({ type: "search", filters: { cities: ["תל אביב-יפו"] } })); // a nickname only the model knows
  assert.equal(r.body.alternative, undefined);
});

test("example questions use their preset query and never call the model", async () => {
  let called = false;
  const llm = async (): Promise<LlmResult> => { called = true; return modelFails(); };
  for (const [question, query] of EXAMPLES) {
    const r = await run(` ${question} `, llm); // surrounding spaces are trimmed
    assert.equal(r.body.parsedBy, "preset");
    assert.deepEqual(r.body.query, query);
  }
  assert.equal(called, false);
});
