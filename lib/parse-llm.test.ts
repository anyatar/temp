import { test } from "node:test";
import assert from "node:assert/strict";
import Anthropic from "@anthropic-ai/sdk";
import { parseLlm } from "./parse-llm.ts";

const vocab = { neighborhoods: new Map([["נאות רחל", ["חולון"]]]) };
// A stand-in for client.messages: only parse() is used.
const fake = (parse: () => Promise<unknown>) => ({ messages: { parse } }) as unknown as Pick<Anthropic, "messages">;
const reply = (query: unknown, stop_reason = "end_turn") => async () => ({ stop_reason, parsed_output: query && { query }, usage: {} });

test("returns the parsed query", async () => {
  const q = { type: "search", filters: { cities: ["חולון"] } };
  const r = await parseLlm("דירות בחולון", "", vocab, fake(reply(q)));
  assert.ok(r.ok);
  assert.deepEqual(r.query, q);
});

test("rejects a neighborhood the data doesn't have", async () => {
  const r = await parseLlm("x", "", vocab, fake(reply({ type: "search", filters: { neighborhoods: ["שכונה מומצאת"] } })));
  assert.deepEqual([r.ok, !r.ok && r.error], [false, "unknown-neighborhood:שכונה מומצאת"]);
});

test("refusal, truncation and missing output are failures", async () => {
  for (const [res, error] of [
    [reply({ type: "trend", filters: {} }, "refusal"), "stop-refusal"],
    [reply({ type: "trend", filters: {} }, "max_tokens"), "stop-max_tokens"],
    [reply(null), "unparseable"],
  ] as const) {
    const r = await parseLlm("x", "", vocab, fake(res));
    assert.equal(!r.ok && r.error, error);
  }
});

test("API errors, timeouts and dropped connections become failures, not exceptions", async () => {
  const cases: [Error, string][] = [
    [new Anthropic.APIUserAbortError(), "timeout"],
    [new Anthropic.APIConnectionError({ message: "reset" }), "connection"],
    [Anthropic.APIError.generate(529, { type: "error", error: { type: "overloaded_error" } }, "overloaded", new Headers()), "api-529"],
  ];
  for (const [err, error] of cases) {
    const r = await parseLlm("x", "", vocab, fake(async () => { throw err; }));
    assert.equal(!r.ok && r.error, error);
  }
});
