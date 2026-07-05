You are continuing cllctd.

Goal: build the v2 outreach console in the real project.

Before coding:
1. Read `cllctd-handoff.md` top to bottom.
2. Read `cllctd-project-context-v2.txt` top to bottom.
3. Read the outreach buildspec if present.
4. Treat the handoff language rules as hard build requirements.

Product shape:
cllctd is a real-world data layer for physical AI.
The offer is rights-cleared, first-person task video and audio, captured by a contributor network, graded, packaged, and licensed to AI labs.
The console is for buyer outreach only.
It should lead with what cllctd has.
It should not quote buyer weaknesses back to them.

Build Stage 1 only:
- Auth.
- Shared Supabase pipeline.
- Lead import.
- AI draft generation through a server endpoint.
- Hard lint before send.
- Human-reviewed manual send.
- Sent log.
- CSV export.

Do not build Stage 2 yet:
- No Gmail send until Stage 1 is merged.
- No reply detection yet.
- No background sending.
- No blind batch send.

Implementation rules:
- Use React + Vite.
- Use Supabase Auth with Google.
- Restrict access to Viresh and Tarun only.
- Use Supabase Postgres for all state.
- Do not use local storage for pipeline state.
- Keep API keys server-side only.
- Use Vercel serverless functions.
- Use the project style, near-black background, sparse terminal feel.
- Desktop first is fine.

Routes and views:
- `/outreach` route or standalone app entry, depending existing repo shape.
- Dashboard: counts by status, recent activity.
- Targets: searchable table, filters, import CSV, add lead.
- Compose: selected target, generated draft, edit box, lint panel, copy/send manually.
- Follow-ups: sent targets that need action.
- Log: sent log with CSV export.

Database:
Use `supabase/001_outreach_schema.sql` from this pack as the starting migration.
Add only necessary changes.
Do not rename columns without updating the seed import.

API endpoints:
- `POST /api/generate-email`
- `POST /api/lint-email`
- `POST /api/manual-log-send`
- `POST /api/verify-email` can be a stub in Stage 1 if keys are not present.

Draft generation:
- Use OpenAI via server env only.
- The client sends target, sender, sample link, asset summary, and CTA.
- The server returns subject and body.
- Every returned draft is immediately linted before display.
- If lint fails, show errors and do not allow manual send logging.

Linter:
- Enforce the restricted terms from the handoff.
- Do not commit sensitive restricted names into the repo.
- Load the sensitive banlist from `CLLCTD_RESTRICTED_TERMS` in env.
- Also enforce tone and structure:
  - starts with Hey
  - no long corporate opener
  - no em dash
  - no buyer-gap opener
  - no India lead
  - uses contributor language for supply side
  - under 140 words by default

Lead seed:
Import `data/seed_leads_physical_ai.csv` into `targets`.
Leave email blank where no verified contact exists.
Hunter or manual research can fill those later.
No guessed personal emails.

Manual send flow:
- User selects target.
- User generates draft.
- User edits draft.
- User runs lint.
- If pass, enable copy body and open mail client.
- User clicks `Mark sent` after manually sending.
- Insert sent log row and update target status.

Grep audit after each edit:
- Run the repo audit using the restricted list from the handoff.
- Also grep changed files for old v1 language.
- Fix any match before moving on.

Acceptance test:
- `npm run build` passes.
- Supabase migration runs.
- Seed import works.
- A target can move from new to draft to sent.
- A bad draft is blocked by lint.
- No API key appears client-side.
- No restricted outbound language appears in changed public files.
