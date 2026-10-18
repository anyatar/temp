import { test } from "node:test";
import assert from "node:assert/strict";
import Anthropic from "@anthropic-ai/sdk";
import { parseLlm } from "./parse-llm.ts";

const vocab = { neighborhoods: new Map([["נאות רחל", ["חולון"]]]) };
// A stand-in for client.messages: only create() is used.
const fake = (create: () => Promise<unknown>) => ({ messages: { create } }) as unknown as Pick<Anthropic, "messages">;
const replyText = (text: string, stop_reason = "end_turn") => async () => ({ stop_reason, content: [{ type: "text", text }], usage: {} });
const reply = (query: unknown, stop_reason = "end_turn") => replyText(JSON.stringify(query), stop_reason);

test("accepts JSON wrapped in a code fence", async () => {
  const r = await parseLlm("x", "", vocab, fake(replyText('```json\n{"type":"trend","filters":{}}\n```')));
  assert.ok(r.ok);
});

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

test("refusal, truncation, non-JSON and off-schema replies are failures", async () => {
  for (const [res, error] of [
    [reply({ type: "trend", filters: {} }, "refusal"), "stop-refusal"],
    [reply({ type: "trend", filters: {} }, "max_tokens"), "stop-max_tokens"],
    [replyText("I can't help with that"), "invalid-json"],
    [reply({ type: "search", filters: { cities: ["אילת"] } }), "schema-mismatch"], // not a city in the data
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
