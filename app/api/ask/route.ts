import Anthropic from "@anthropic-ai/sdk";
import { ask } from "@/lib/ask.ts";
import type { Deal } from "@/lib/clean.ts";
import { parseLlm, systemPrompt } from "@/lib/parse-llm.ts";
import { buildVocabulary } from "@/lib/parse-rules.ts";
import rawDeals from "@/data/deals.json";

const deals = rawDeals as Deal[];
const vocab = buildVocabulary(deals);
const system = systemPrompt(vocab, deals.reduce((m, d) => (d.date > m ? d.date : m), "").slice(0, 7));
const client = new Anthropic({ maxRetries: 2 });
const llm = (question: string) => parseLlm(question, system, vocab, client);

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const res = await ask(body, { deals, vocab, llm });
  return Response.json(res.body, { status: res.status });
}
