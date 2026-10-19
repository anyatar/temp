# Plan

Written retroactively on 2026-10-19 from the design discussion and the commit history. Status as of commit `0721c18`.
Why each choice was made lives in `DECISIONS.md`; where the AI was wrong or redirected lives in `AI-LOG.md`.

## Goal

A Hebrew, right-to-left web app where a **home buyer** asks free-text questions about Israeli residential deals and gets answers computed only from the data, with the sample size shown. The LLM turns the question into a structured query; plain code computes every number. Deployed publicly, at 10k requests/day, on our own budget.

## Shape

```
build time:  data/deals.csv → scripts/clean.ts → data/deals.json + data/quality.json
request:     question → rule parser ┐
                      → LLM parser  ┴→ Query (zod-validated) → engine → answer + n → Hebrew UI
```

The LLM never sees deal rows and never writes numbers. If it is slow, down or wrong, the rule parser's query is used.

## Steps

| # | Step | Status | Commits |
|---|---|---|---|
| 0 | Project setup: rules (`AGENTS.md`), `DECISIONS.md`, `AI-LOG.md`, raw data | Done | `5ace883` |
| 1 | Next.js scaffold, Hebrew RTL layout | Done | `8609d2c` |
| 2 | Deterministic cleaning, per-row change log, quality report, tests. **Checkpoint:** outlier threshold reviewed with the data (2.5×) | Done | `be8f44c`, `f71ada0` |
| 3 | Query schema, engine (7 question types, widening, minimum 5 deals), rule-based Hebrew parser, tests | Done | `075bd21` |
| 4 | LLM parser (Claude Haiku 5.5), `/api/ask` with fallback and cross-check, accuracy check against real model, cost measurement | Done | `e0b2c6c` → `bae5e96` |
| 5a | UI: start page with examples, chat-style answers per question type, expandable deals | Done | `17d2198` → `0721c18` |
| 5b | Deploy: Vercel, Anthropic key as an environment variable, spend limit in the console | To do | |
| 5c | Abuse and cost guards: per-IP rate limit, daily request cap (then rules only), circuit breaker, cache of parsed questions (Upstash Redis) | To do | |
| 5d | Read-only `/data-quality` page rendering `quality.json` | To do | |
| 6 | Wrap-up: README (what, why, costs, shortcuts), architecture diagram, teaching topic for the session | To do | |
| — | Optional: quarantine → LLM-suggested aliases → token-protected admin approval page | First to cut | |

## Question types (agreed scope)

Search, statistic, price check, budget, ranking, comparison, trend. Declined with a Hebrew explanation: forecasts, investment advice, anything not in the data (rent, schools, asking prices, places outside the dataset). Coverage questions ("which cities do you have") were removed because they would expose the dataset's size and coverage.

## Changes from the original plan

| Planned | What happened | Why |
|---|---|---|
| Model output forced into the schema by the API's structured outputs | Plain JSON in the reply, validated by our zod schema | The API rejected the schema as too complex after ~40s (`AI-LOG.md`) |
| Outlier flag at 3× the city median | 2.5×, flagged for human review, excluded from statistics | 3× flagged nothing; 2.5× catches exactly the two implausible penthouses |
| Turbopack (Next 16 default) | Webpack (`--webpack`) | Windows Application Control blocks Next's native compiler on the dev machine |
| Cost "a few dollars a month" at 10k/day | Measured ~$21/month with a warm prompt cache, worst case ~$165 | The estimate was never measured; now it is (`DECISIONS.md`) |
| Single start page; results replace it | Examples stay as a compact row above the input during a conversation | Users couldn't get back to the examples |
| Source-precedence admin UI | Precedence lives in config | 4 conflicting rows don't justify a UI |

## Measured so far

- Cleaning: 530 rows in → 518 deals, 2 quarantined (₪0, ₪18,000), 2 suspected outliers pending review, every change logged.
- LLM parsing: 29/30 Hebrew test questions correct; median 0.8s, max 1.3s. The miss is genuinely ambiguous ("כמה עלו" = cost, or went up?).
- Cost: ~$0.00007 per question with the prompt cache warm (~$21/month at 10k/day).
- Tests: 59 passing (`npm test`); live accuracy check: `npm run eval-llm`.

## Not verified yet

- The UI only through server rendering and API calls, plus the user's manual testing; no automated browser test.
- Anything on Vercel: the build there, cold starts, environment variables.
- Behavior under real load and abuse (rate limiting doesn't exist yet).
