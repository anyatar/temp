import { test } from "node:test";
import assert from "node:assert/strict";
import { EXAMPLES } from "./examples.ts";
import { parseRules } from "./parse-rules.ts";
import { Query } from "./schema.ts";

const vocab = { neighborhoods: new Map<string, string[]>() };

for (const [question, preset] of EXAMPLES)
  test(`preset matches how the question is parsed: ${question}`, () => {
    assert.deepEqual(Query.parse(preset), preset); // a valid query
    assert.deepEqual(parseRules(question, vocab), preset); // and the same reading the parser gives it
  });
