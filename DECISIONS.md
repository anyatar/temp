# Decisions

Short record of what we chose and why. Update when a decision changes.

## Product
- **Persona: a buyer** asking "is this price reasonable / what can I get". Highest-stakes use of the data, so "don't overclaim" matters most here.
- **Supported question types (closed list):**
  1. Search: list matching deals, each expandable
  2. Statistic: median, range, n, date span for a segment
  3. Price check: percentile of a given price among comparable deals
  4. Budget: what a budget buys (by city / rooms / size)
  5. Ranking: cities or neighborhoods by median price per m² (only groups with enough deals)
  6. Comparison: two segments side by side, each with its own n
  7. Trend: median per year, city level or wider only; 2026 marked partial, thin years marked
- **Not supported:**
  - Coverage questions ("which cities / how many deals do you have"). Removed: they would expose the dataset's size and coverage, which may be proprietary.
  - Feature premiums ("how much does parking add"). Confounded at this sample size; a naive difference would overclaim.
- **Declined, with a Hebrew explanation and a suggested supported question:** forecasts, investment advice, anything not in the data (rent, asking prices, schools, transport, exact addresses), causal "why" questions.
- **"No data" is said explicitly**, never shown as an empty list.

## LLM boundary
- **The LLM turns a Hebrew question into `{type, filters, params}` JSON, and that is its only job.** It gets the question plus the valid values (cities, neighborhoods, enums). It never sees deal rows and never writes the answer.
- **The engine (plain code) computes every number. The answer is rendered from a Hebrew template.** Nothing the user sees as a fact comes from the model.
- **Grounding the user can see:** the interpretation shown as chips ("הבנתי: ..."), n and the date span, any widening, excluded or flagged deals, the deals behind every number, and which parser handled the question.
- **Medians, not averages.** Below about 5 deals, show the deals but no statistic.

## Query engine (`lib/engine.ts`)
- **One `Query` schema** (`lib/schema.ts`, zod) is the contract for both parsers. Cities and enums are closed lists, so a parser can't invent a city.
- **Unknown never matches:** a deal with unknown parking or condition doesn't match a parking or condition filter.
- **Widening order** when fewer than 5 usable deals: drop the street, then the neighborhood, then widen rooms by ±0.5. Each step is reported. **Comparison never widens**, because widening one side would make the sides incomparable.
- **Budget** ("what can I buy for X") looks at deals priced 80–100% of X, grouped by city. Sizes get a median only when a city has 5 or more deals; otherwise only actual min–max ranges are shown.
- **Price check** compares price per m² when the user gives a size, otherwise the total price, and reports the percentile among comparable deals.
- **Ranking** shows only groups with 5 or more deals and reports how many groups were left out.
- **Places outside the dataset** (a fixed list of other Israeli cities) are answered "no data for X", never with a country-wide answer.

## Model choice
- **Claude Haiku 5.5** (`claude-haiku-5-5`) for question parsing: the cheapest current Claude model, and parsing needs no reasoning (thinking off, effort low). The system prompt (valid cities, neighborhoods, enums) is prompt-cached.
- **Considered and rejected: a free tier (Groq, open models).** Free-tier rate limits are designed not to cover 10k requests/day, so at peak most answers would come from the rule fallback; Hebrew quality of open models is unmeasured; and the paid cost is small. A hard monthly spend limit in the Anthropic Console caps the risk.
- A Pro (claude.ai) subscription can't be used: it covers one person's use of Claude, not an app serving the public.
- **The model's reply is plain JSON validated by our zod schema, not the API's structured outputs.** Structured outputs compile the schema into a grammar; ours (8 query types × ~15 optional filters) was rejected as "Schema is too complex" after ~40s. The schema now sits in the cached system prompt, written with shared references (4× smaller). Invalid JSON, an off-schema reply, a refusal or an unknown neighborhood all count as failures and go to the rule parser.
- **Measured (30 Hebrew questions, `npm run eval-llm`):** 29/30 correct, median 0.8s, max 1.3s, **$0.83 per 10k questions** (~$25/month at 10k/day) before caching answers.
- **Cost model (verified against the live pricing page: input $0.10, 5-min cache write $0.125, cache read $0.01, output $0.50 per million tokens).** Per question: the system prompt is 4,167 tokens (mostly Hebrew neighborhood names; Hebrew is ~1 token per character), plus ~26 tokens of question and ~53 tokens of JSON output.
  - Cache warm: ~$0.00007 → **~$21/month** at 10k/day. At ~7 requests/minute every hit refreshes the 5-minute cache, so only quiet periods (nights) pay a cache write: a few cents a day.
  - No cache at all: ~$0.00045 → **~$135/month**. Cache writes on every call (worst case): ~$0.00055 → ~$165/month.
  - Not included: free tiers for hosting and Redis; abuse, which the rate limit and the console spend cap bound. The one miss is genuinely ambiguous Hebrew ("כמה עלו דירות בפלורנטין": cost, or went up?).

## Failure handling
- **A keyword rule parser produces the same `Query` schema** and runs in parallel with the LLM every time.
- **One total deadline (~4s) for the LLM call, including retries.** The SDK's built-in retries cover transient errors only (connection, 408/409/429/5xx). No retry on 400/401 or on output our schema check rejects.
- **Fallback order:** LLM, then the rule parser ("פענוח בסיסי"), then a pre-filled filter form.
- **If the LLM and the rule parser disagree** on a concrete entity (city, type), show both interpretations and let the user choose.
- **Circuit breaker:** after about 5 LLM failures in a minute, skip the LLM for 60s (Redis key with an expiry).
- **Cost guards:** per-IP rate limit, a daily request cap (then rules-only), and a monthly spend limit set in the Anthropic console.

## Data cleaning (deterministic, at build time)
- **`scripts/clean.ts`: `data/deals.csv` → `deals.json` + `quality.json`.** Same input, same output. No LLM.
- **Every change is logged per row.** Each issue ends as **fixed**, **flagged** (the row stays, the field isn't trusted), or **quarantined** (kept in the report, left out of statistics). No row is dropped silently.
- **Normalization:**
  - trim whitespace; resolve city aliases
  - booleans `כן/yes/TRUE/1`; blank → unknown, not false
  - `"4 חדרים"` → 4; strip `₪` and commas
  - dates: ISO, `dd/mm/yyyy`, `dd.mm.yyyy` (**day-first, Israeli convention**), `Aug 2025` → month only, marked approximate
  - price_per_sqm recomputed from price ÷ size
- **Duplicate IDs:**
  - Identical copies are merged.
  - Price conflicts across sources: precedence **tax authority > broker > owner** (tax authority = the reported transaction; the others are second-hand). The losing value is logged.
  - **Price conflicts within the same source:** keep the deal, show both prices with a badge, **leave it out of price statistics.** Never average and never pick one: either would create a price nobody reported.
- **Implausible values (guardrails):**
  - Impossible (price ≤ 0 or below a floor, size outside ~15–1000 m², future dates) → quarantine.
  - Price per m² ≥2.5× off the city median (national median if the city is thin) → flag as **suspected, pending human review**. The deal stays in the dataset and in search (with a badge) but is excluded from statistics until reviewed. 2.5× was chosen after inspecting the data: it catches exactly the two penthouses (₪44M Pisgat Ze'ev, ₪38.5M Ramat Gan) that look wrong against every peer group; 2× would also catch two deals that are explainable against similar deals; 3× catches nothing.
  - ~10× off → quarantine (likely a typo).
  - Contradictions (e.g. "new from contractor" built in 1950) → flag the field, not the row.
  - **Never auto-correct** (e.g. ×10 for a "missing zero"); that would be inventing data.
  - Missing size: the row stays; price per m² is unknown, so it only counts toward total-price statistics.
  - Garden apartment above floor 1 is flagged in the report only (it can't change any answer).
  - Not checked: elevator in a low building (plausible in private houses).
  - Thresholds live in `THRESHOLDS` in `lib/clean.ts` and are copied into `quality.json`.

## Build tooling
- **`dev` and `build` use Webpack (`--webpack`), not Next 16's default Turbopack.** On the development machine, Windows Application Control blocks Next's native compiler (`next-swc.win32-x64-msvc.node`); Next falls back to a WebAssembly compiler, which doesn't support Turbopack. Webpack works everywhere, including Vercel, at the cost of slower builds, which don't matter at this size. The "Attempted to load @next/swc-win32-x64-msvc" warning still prints locally and is harmless.

## Later / cut
- **Unparseable values:** the LLM suggests alias mappings offline, they pass the same validators, a human approves, and they become deterministic rules. Approval through a token-protected one-page admin UI. **First to cut** if time runs short.
- Source-precedence admin UI: dropped; precedence stays in config.
- **Human review of suspected deals:** the queue is already in `quality.json` (`flagged`). A review UI (confirm → back into stats, reject → quarantine) is future work.
