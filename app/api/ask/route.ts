import Anthropic from "@anthropic-ai/sdk";
import type { Deal } from "@/lib/clean.ts";
import { answer } from "@/lib/engine.ts";
import { parseLlm, systemPrompt } from "@/lib/parse-llm.ts";
import { buildVocabulary, parseRules } from "@/lib/parse-rules.ts";
import type { Query } from "@/lib/schema.ts";
import rawDeals from "@/data/deals.json";

const deals = rawDeals as Deal[];
const vocab = buildVocabulary(deals);
const system = systemPrompt(vocab, deals.reduce((m, d) => (d.date > m ? d.date : m), "").slice(0, 7));
const client = new Anthropic({ maxRetries: 2 });

const MAX_QUESTION = 300;

// Cities the query names, including both sides of a comparison.
const cities = (q: Query) =>
  q.type === "unsupported" ? [] : [...new Set([q.filters, ...(q.type === "compare" ? q.groups : [])].flatMap((f) => f.cities ?? []))].sort();

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!question || question.length > MAX_QUESTION)
    return Response.json({ error: `question must be 1–${MAX_QUESTION} characters` }, { status: 400 });

  const rules = parseRules(question, vocab);
  const llm = await parseLlm(question, system, vocab, client);

  const query = llm.ok ? llm.query : rules;
  if (!query) return Response.json({ question, parsedBy: null, llm: { ok: false, error: llm.ok ? undefined : llm.error } });

  // The two parsers disagree on a city the rules saw explicitly: answer with the LLM's reading, offer the other.
  const ruleCities = rules ? cities(rules) : [];
  const alternative = llm.ok && rules && ruleCities.length && ruleCities.join() !== cities(llm.query).join() ? rules : undefined;

  return Response.json({
    question,
    parsedBy: llm.ok ? "llm" : "rules",
    query,
    alternative,
    answer: answer(query, deals),
    llm: llm.ok ? { ok: true, ms: llm.ms } : { ok: false, error: llm.error, ms: llm.ms },
  });
}
