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
  - Price per m² ~3× off the city median (national median if the city is thin) → flag, excluded from statistics.
  - ~10× off → quarantine (likely a typo).
  - Contradictions (e.g. "new from contractor" built in 1950) → flag the field, not the row.
  - **Never auto-correct** (e.g. ×10 for a "missing zero"); that would be inventing data.
  - Thresholds are placeholders until checked against the real distribution.

## Later / cut
- **Unparseable values:** the LLM suggests alias mappings offline, they pass the same validators, a human approves, and they become deterministic rules. Approval through a token-protected one-page admin UI. **First to cut** if time runs short.
- Source-precedence admin UI: dropped; precedence stays in config.
