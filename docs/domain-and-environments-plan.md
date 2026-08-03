# Domain & environments plan

Written 2026-08-03, ~18:00 UTC, right before a 4-5hr break. Pick up here.

## Where the pipeline stands right now

- **PR #6 (dev → staging) is merged.** `staging` is now at `c1b59c4`, identical
  to `dev`. It carries the four viewport/scroll-freeze fixes, most recently
  `ab31c30` ("Stop html/body overflow:hidden from freezing sign-up/onboarding"),
  which you already manually verified on the PR's own preview deployment
  (`swole-5f1js93z1-tn1dgs-projects.vercel.app`) — sign-up/onboarding no longer
  freezes; on a fresh account there's nothing to scroll to yet, which is
  expected, not a bug.
- **`staging → main` PR has deliberately NOT been opened yet.** Merging into
  `staging` triggers a brand-new Vercel Preview build for the `staging` branch
  with its **own fresh Convex preview deployment** (see
  `scripts/vercel-build.js` — every non-production branch gets an isolated,
  empty Convex backend). That build didn't exist when you tested, so re-check
  the fix there before promoting to `main`/production. Once it looks good:
  `gh pr create --repo TN1DG/swole --base main --head staging`.

## "No exercises on a new account" — investigated, not a bug

`convex/exercises.ts:list` returns built-in exercises (`ownerId: undefined`)
plus the signed-in user's custom ones. The built-in library
(`BUILT_IN_EXERCISES` in `convex/seedData.ts`, 71 entries) only exists in a
deployment's database once someone has manually run the one-time mutation
`npx convex run exercises:seed` **against that specific deployment**.

Because `scripts/vercel-build.js` spins up a brand-new, empty Convex preview
deployment for every non-production branch (`convex deploy --preview-create
"<branch>"`), *every* preview/dev build starts with zero exercises until it's
seeded by hand. Production's Convex deployment was seeded previously (existing
users already see the library fine), so this has no user-facing impact on
`main` — nothing needs to be fixed or shipped there.

**Optional backlog item, not urgent:** auto-run the seed mutation after
`convex deploy --preview-create` in `scripts/vercel-build.js` so new
preview/staging/dev deployments aren't confusingly empty during manual
testing. Low priority — didn't implement, just flagging it.

## Would buying a domain make the dev/staging/main flow better?

Short answer: yes, but for usability of the existing pipeline, not for the
git-promotion mechanics themselves (dev → staging → main via PRs stays exactly
as-is either way).

**What's true today:** every Preview build (dev branch, staging branch, any
PR) gets a random, rotating URL like `swole-<hash>-tn1dgs-projects.vercel.app`,
and it sits behind Vercel's deployment-protection auth wall (that's the 302
you'd see hitting it directly). Finding "the current staging URL" means
digging through `vercel ls` or the dashboard every time.

**What a custom domain buys you:** in Vercel → Project Settings → Domains you
can add a domain and assign subdomains to specific git branches ("Git Branch
Domains"). Vercel then keeps that alias permanently pointed at the latest
deployment on that branch:

- `app.<domain>` (or the bare apex) → `main` — production, effectively
  automatic once the domain's added.
- `staging.<domain>` → `staging` — a stable, bookmarkable URL for manual QA
  instead of hunting for the latest preview hash.
- Probably **skip** a public alias for `dev` — it's the most volatile branch
  and doesn't need a permanent address; ad-hoc preview URLs are fine there.

This mainly pays off if/when the app grows features that need a *fixed*
callback URL (OAuth/social login providers require allowlisting exact
redirect URIs, which rotating preview URLs break). Convex Auth's current
email/password + magic-link flows don't have that constraint, so there's no
urgency — this is a "nice to have, plan it, don't rush it" item.

**Steps to actually do this, once you pick a domain:**

1. Register the domain — either buy it through Vercel directly, or buy
   elsewhere (Namecheap, Cloudflare, etc.) and point it at Vercel via
   nameservers or A/CNAME records.
2. Add it in the `swole` Vercel project → Settings → Domains.
3. Assign `main` as the Production domain (usually the default once added).
4. Add a second domain/subdomain entry, assign it to the `staging` git branch
   under that same Domains screen.
5. Sanity-check `vercel.json`'s CSP — `connect-src` already allows
   `https://*.convex.cloud` regardless of frontend origin, so no change
   needed there for Convex itself. Revisit only if an OAuth provider gets
   added later.
6. Decide whether Vercel's Deployment Protection should stay enabled on the
   `staging` domain now that it's a stable, memorable URL, or be relaxed for
   easier QA access.

## Decisions needed from you when you're back

- [ ] Verify the fix on the new `staging` preview build, then say go/no-go
      on opening the `staging → main` PR.
- [ ] Domain name + registrar (buy through Vercel, or bring your own).
- [ ] Confirm subdomain scheme (`staging.<domain>` etc., or something else).
- [ ] Whether to bother auto-seeding preview Convex deployments with
      exercises (low priority, easy fix in `scripts/vercel-build.js`).
