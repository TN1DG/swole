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
pull request. `main` is protected (no direct pushes) and is what's live in
production, with its own Convex deployment; `staging` gets a real Vercel
preview build against its own Convex preview deployment. **Commit new work to
`dev`, not `main`** — including backlog/feature work from manual or scheduled
sessions.
