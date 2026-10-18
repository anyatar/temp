import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRules } from "./parse-rules.ts";
import { CASES } from "./questions.ts";

const vocab = {
  neighborhoods: new Map([
    ["נאות רחל", ["חולון"]],
    ["קריית שרת", ["חולון"]],
    ["פלורנטין", ["תל אביב-יפו"]],
    ["מרכז", ["רמת גן", "בת ים"]],
  ]),
};


for (const [question, expected] of CASES)
  test(question, () => {
    const q = parseRules(question, vocab);
    if (expected === null) assert.equal(q, null);
    else assert.partialDeepStrictEqual(q, expected);
  });
