// The /api/ask logic, kept out of the route so it can be tested with a fake model.
import type { Deal } from "./clean.ts";
import { answer } from "./engine.ts";
import { PRESET_QUERIES } from "./examples.ts";
import type { LlmResult } from "./parse-llm.ts";
import { parseRules, type Vocabulary } from "./parse-rules.ts";
import type { Query } from "./schema.ts";

export const MAX_QUESTION = 300;

export type AskDeps = { deals: Deal[]; vocab: Vocabulary; llm: (question: string) => Promise<LlmResult> };

// Cities the query names, including both sides of a comparison.
const cities = (q: Query) =>
  q.type === "unsupported" ? [] : [...new Set([q.filters, ...(q.type === "compare" ? q.groups : [])].flatMap((f) => f.cities ?? []))].sort();

export async function ask(body: unknown, { deals, vocab, llm: parseLlm }: AskDeps) {
  const raw = (body as { question?: unknown } | null)?.question;
  const question = typeof raw === "string" ? raw.trim() : "";
  if (!question || question.length > MAX_QUESTION)
    return { status: 400, body: { error: `question must be 1–${MAX_QUESTION} characters` } };

  // An example question from the start page: its query is known in advance, so no model call.
  const preset = PRESET_QUERIES.get(question);
  if (preset) return { status: 200, body: { question, parsedBy: "preset", query: preset, answer: answer(preset, deals) } };

  const rules = parseRules(question, vocab);
  const llm = await parseLlm(question);

  const query = llm.ok ? llm.query : rules;
  if (!query) return { status: 200, body: { question, parsedBy: null, llm: { ok: false, error: llm.ok ? undefined : llm.error } } };

  // The two parsers disagree on a city the rules saw explicitly: answer with the LLM's reading, offer the other.
  const ruleCities = rules ? cities(rules) : [];
  const alternative = llm.ok && rules && ruleCities.length && ruleCities.join() !== cities(llm.query).join() ? rules : undefined;

  return {
    status: 200,
    body: {
      question,
      parsedBy: llm.ok ? "llm" : "rules",
      query,
      alternative,
      answer: answer(query, deals),
      llm: llm.ok ? { ok: true, ms: llm.ms } : { ok: false, error: llm.error, ms: llm.ms },
    },
  };
}
