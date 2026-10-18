// LLM parser: Hebrew question → Query. The model sees the question and the valid values, never deal data,
// and its output is schema-validated. Any failure returns { ok: false } and the caller falls back to the rule parser.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { CITIES, CONDITIONS, PROPERTY_TYPES } from "./aliases.ts";
import type { Vocabulary } from "./parse-rules.ts";
import { Query, type Filters } from "./schema.ts";

export const MODEL = "claude-haiku-5-5";
export const DEADLINE_MS = 4000; // total, including the SDK's retries; the user never waits longer than this

// Not the API's structured outputs: compiling this schema into a grammar fails ("Schema is too complex") after ~40s.
// The schema goes in the (cached) prompt instead, and zod validates the reply below.
const SCHEMA = JSON.stringify(z.toJSONSchema(Query, { reused: "ref" })); // shared parts written once: 4× smaller

export function systemPrompt(vocab: Vocabulary, lastDealMonth: string) {
  const neighborhoods = [...vocab.neighborhoods]
    .flatMap(([n, cities]) => cities.map((c) => `${n} — ${c}`))
    .sort()
    .join("\n");
  return `You convert one Hebrew question about Israeli residential property deals into a JSON query.
You never answer the question and never state facts: the app computes every answer from your query.

Query types:
- search: list deals matching the filters.
- stat: a typical price for a segment. metric "pricePerSqm" when the user asks per square meter (מ"ר, מטר), otherwise "price".
- priceCheck: the user names a price for a property and asks whether it is reasonable. price in NIS; sizeSqm only if they give a size.
- budget: "what can I buy for X". budget in NIS.
- ranking: cheapest or most expensive places. groupBy "neighborhood" when one city is given or neighborhoods are asked about, otherwise "city".
- compare: two segments side by side. Shared conditions go in filters; what differs goes in groups[0] and groups[1], in the order the user wrote them.
- trend: how prices changed over the years.
- unsupported: reason "forecast" (future prices), "advice" (should I buy or invest), "notInData" (rent, yield, schools, transport, asking prices or listings, or a place that is not in the city list: put the place name in detail), "other" (anything else the types above cannot express).

Filter rules:
- Use only the values listed below, spelled exactly. Map aliases to the listed city name (ת"א → תל אביב-יפו, ב"ש → באר שבע, מודיעין → מודיעין-מכבים-רעות).
- A neighborhood implies its city: include both.
- Rooms: "4 חדרים" → {"min":4,"max":4}; "לפחות 4 חדרים" → {"min":4}; "3-4 חדרים" → {"min":3,"max":4}.
- Prices are plain NIS numbers: "3.2 מיליון" → 3200000.
- Dates are "YYYY" or "YYYY-MM" in dateFrom/dateTo. The latest data is from ${lastDealMonth}; relative periods ("בשנה האחרונה") count back from that month.
- "דירה"/"דירות" alone means any property type: no propertyTypes filter. Only specific types filter.
- "עם חניה" → hasParking true; "בלי/ללא חניה" → false. Same for מעלית (hasElevator), מרפסת (hasBalcony), ממ"ד (hasSafeRoom).
- Include only what the question says. Never guess a filter.

Cities: ${CITIES.join(", ")}
Property types: ${PROPERTY_TYPES.join(", ")}
Conditions: ${CONDITIONS.join(", ")}
Neighborhoods (neighborhood — city):
${neighborhoods}

Reply with only the JSON query object, no other text. It must validate against this JSON Schema:
${SCHEMA}`;
}

const neighborhoodsIn = (f: Filters) => f.neighborhoods ?? [];

function unknownNeighborhood(q: Query, vocab: Vocabulary) {
  if (q.type === "unsupported") return undefined;
  const all = [q.filters, ...(q.type === "compare" ? q.groups : [])].flatMap(neighborhoodsIn);
  return all.find((n) => !vocab.neighborhoods.has(n));
}

export type LlmResult =
  | { ok: true; query: Query; ms: number; usage: Anthropic.Usage }
  | { ok: false; error: string; ms: number };

export async function parseLlm(
  question: string,
  system: string,
  vocab: Vocabulary,
  client: Pick<Anthropic, "messages"> = new Anthropic({ maxRetries: 2 }),
): Promise<LlmResult> {
  const started = Date.now();
  const fail = (error: string): LlmResult => ({ ok: false, error, ms: Date.now() - started });
  try {
    const res = await client.messages.create(
      {
        model: MODEL,
        max_tokens: 1024,
        thinking: { type: "disabled" }, // parsing needs no reasoning, and latency matters
        output_config: { effort: "low" },
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: question }],
      },
      { signal: AbortSignal.timeout(DEADLINE_MS) },
    );
    if (res.stop_reason !== "end_turn") return fail(`stop-${res.stop_reason}`); // refusal, max_tokens...
    const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1); // tolerate a code fence around it
    let parsed: unknown;
    try { parsed = JSON.parse(json); } catch { return fail("invalid-json"); }
    const checked = Query.safeParse(parsed);
    if (!checked.success) return fail("schema-mismatch");
    const query = checked.data;
    const unknown = unknownNeighborhood(query, vocab);
    if (unknown) return fail(`unknown-neighborhood:${unknown}`);
    return { ok: true, query, ms: Date.now() - started, usage: res.usage };
  } catch (e) {
    if (e instanceof Anthropic.APIUserAbortError) return fail("timeout");
    if (e instanceof Anthropic.APIConnectionError) return fail("connection");
    if (e instanceof Anthropic.APIError) return fail(`api-${e.status}`);
    console.error("LLM parse failed:", e); // unexpected, e.g. missing credentials
    return fail(e instanceof Error ? e.name : "error");
  }
}
