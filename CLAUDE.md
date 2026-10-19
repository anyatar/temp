@AGENTS.md

# Project

Madlan tech challenge: Hebrew/RTL question-answering over Israeli property deals (`data/deals.csv`).
Next.js + React + TypeScript, deployed on Vercel.

- Build steps and status: `PLAN.md`. Update the status when a step finishes.
- Decisions and their reasons: `DECISIONS.md`. Read it before changing behavior; update it when a decision changes.
- How we worked with AI: `AI-LOG.md`. Add an entry when the AI's answer was wrong, incomplete, or redirected by the user.
- The LLM only parses questions into the `Query` schema. It never sees deal data and never writes numbers.
