// Runs the shared Hebrew questions through the real model and reports accuracy, latency and cost.
// Costs real money (about 30 small calls). Run: npm run eval-llm
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import Anthropic from "@anthropic-ai/sdk";
import { parseLlm, systemPrompt } from "../lib/parse-llm.ts";
import { buildVocabulary } from "../lib/parse-rules.ts";
import { CASES } from "../lib/questions.ts";

// Haiku 5.5, prompts under 100K tokens, USD per million tokens
const PRICE = { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 };

const deals = JSON.parse(readFileSync(new URL("../data/deals.json", import.meta.url), "utf8"));
const vocab = buildVocabulary(deals);
const system = systemPrompt(vocab, deals.reduce((m: string, d: { date: string }) => (d.date > m ? d.date : m), "").slice(0, 7));
const client = new Anthropic({ maxRetries: 2 });

let passed = 0;
let cost = 0;
const times: number[] = [];
for (const [question, expected] of CASES) {
  const r = await parseLlm(question, system, vocab, client);
  times.push(r.ms);
  let verdict: string;
  if (!r.ok) verdict = `FAIL (${r.error})`;
  else {
    const u = r.usage;
    cost += (u.input_tokens * PRICE.input + u.output_tokens * PRICE.output +
      (u.cache_read_input_tokens ?? 0) * PRICE.cacheRead + (u.cache_creation_input_tokens ?? 0) * PRICE.cacheWrite) / 1e6;
    try {
      // "Nothing recognized" for the rules is an unsupported question for the model.
      assert.partialDeepStrictEqual(r.query, expected ?? { type: "unsupported" });
      verdict = "ok";
      passed++;
    } catch {
      verdict = `WRONG ${JSON.stringify(r.query)}`;
    }
  }
  console.log(`${verdict.padEnd(4)} ${String(r.ms).padStart(5)}ms  ${question}`);
}
times.sort((a, b) => a - b);
console.log(`\n${passed}/${CASES.length} correct · median ${times[times.length >> 1]}ms · max ${times.at(-1)}ms`);
console.log(`cost $${cost.toFixed(5)} total, $${(cost / CASES.length).toFixed(6)} per question → $${((cost / CASES.length) * 10_000).toFixed(2)} per 10k questions (before caching answers)`);
