<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `TN1DG/swole` (uses the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five canonical triage labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root (created lazily by `/domain-modeling`). See `docs/agents/domain.md`.

### Branch workflow

This repo promotes through `dev` → `staging` → `main`, each hop via a reviewed
pull request. `main` is what's live in production, with its own Convex
deployment; `staging` gets a real Vercel preview build against its own
*persistent* Convex preview deployment. **Commit new work to `dev`, not `main`**
— including backlog/feature work from manual or scheduled sessions.

`main` is **not** mechanically protected: branch protection and rulesets are
GitHub Pro features on a private repo, and both return 403 here. Nothing stops a
direct push to `main` except this instruction, so treat it as binding rather than
advisory. Never push to `main` or `staging` directly, and never run
`npm run deploy` — it goes straight to production Convex and Vercel, bypassing
both PR gates and skipping the staging rehearsal.

`.github/workflows/ci.yml` runs `npm run typecheck`, `npm run lint`,
`npx vitest run` and `npm run build` on every push and PR to these three
branches. Run those four locally before committing; CI is not yet a *required*
status check, so a red run does not block a merge on its own.
