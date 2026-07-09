# cllctd outreach build pack

Use this pack to start the outreach console build in Codex.

Assumptions I am making:
- The egocentric catalogue claim is accurate.
- The 2,000+ contributor network claim is accurate.
- Outreach senders are Viresh and Tarun.
- Public inbound stays team@cllctd.ai.
- Stage 1 is the right build order: pipeline, generation, hard lint, manual send.
- Gmail send and reply detection are Stage 2.

What is included:
- `docs/CODEX_PROMPT_OUTREACH_STAGE1.md`: paste into Codex.
- `supabase/001_outreach_schema.sql`: tables, RLS, allowlist, indexes.
- `api/generate-email.ts`: Vercel endpoint for billing-free compliant draft generation.
- `api/lint-email.ts`: hard-fail pre-send linter endpoint.
- `src/lib/outreachPrompt.ts`: prompt builder.
- `src/lib/outreachLint.ts`: shared lint logic.
- `data/seed_leads_physical_ai.csv`: first seed list for robotics and physical AI buyers.
- `docs/OUTREACH_OPERATING_RULES.md`: daily use rules.

Build principle:
Do not rebuild the old v1 tool. Use the old file only for layout inspiration and target import patterns. The new tool is v2 only.

Stage 1 acceptance checklist:
- Supabase Google auth works for the two founder accounts only.
- Targets load from Supabase, not local storage.
- Lead CSV imports cleanly.
- Compose creates one reviewed draft at a time.
- Lint blocks restricted copy before any send action.
- Manual send opens the user's mail client or copies a reviewed draft.
- Every manual send can be marked sent and logged.
- Grep audit passes on changed files.

Stage 2 later:
- Gmail OAuth send.
- Reply detection.
- Bounce tracking.
- Daily send caps.
- Per-sender warming controls.
