# AI log

How this was built with AI assistance (Claude Code). Newest last. Each entry says what the AI proposed, what was wrong or missing, and what changed.

## 2026-10-18: Design discussion

- **Coverage question removed.** The AI proposed a question type answering "which cities / how many deals are in the data". I removed it: it would expose the dataset's size and coverage, which may be proprietary. The AI had misread my reason as "not a buyer question". Remaining tension, kept on purpose: every answer still shows n and a date span (needed for grounding), which reveals coverage a little at a time.
- **Retries were missing.** The AI's failure design had a timeout and a fallback but no retries. I asked about fast failures (overloaded, 5xx, dropped connection). Result: SDK retries for transient errors only, all under one total deadline, plus a circuit breaker for real outages.
- **Same-source conflicts weren't handled.** The AI's duplicate handling covered only conflicts between sources (resolved by precedence). I asked about two different prices from the same source. Result: keep the deal, show both prices, leave it out of price statistics, never average or pick one.
- **Scope pushback (AI on me).** I proposed an admin UI for source precedence; the AI argued it cost too much for 4 conflicting rows, so precedence moved to config. The admin UI came back later, but only for approving LLM-suggested mappings, the one place a human decision is actually needed.
- **Working rules.** The AI follows the Ponytail minimal-code rules (`AGENTS.md`) to fit the ~5-hour budget.
