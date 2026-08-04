# Domain & environments plan

Written 2026-08-03, ~18:00 UTC, right before a 4-5hr break. Updated 2026-08-04.
Pick up here.

## Where the pipeline stands right now

**Updated 2026-08-04.** The viewport work is shipped and the domain is bought.

- **The app is live at <https://swole.day>.** Bought and wired up 2026-08-04 —
  see the "DONE" section below for hosts, prices and what had to change.
- **PR #7 (staging → main) is merged**, so the four viewport/scroll-freeze
  fixes are in production. `main` is at `f42c9df`.
- **`dev` is ahead of `staging` by three commits** that have *not* been
  promoted: the sign-up error-message fix, preview auto-seeding, and the
  preview auth-env automation. Next hop is a `dev → staging` PR.

<details><summary>Original status, 2026-08-03 (both items now done)</summary>

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

</details>

## "No exercises on a new account" — investigated, not a bug

`convex/exercises.ts:list` returns built-in exercises (`ownerId: undefined`)
plus the signed-in user's custom ones. The built-in library
(`BUILT_IN_EXERCISES` in `convex/seedData.ts`, 70 entries) only exists in a
deployment's database once someone has manually run the one-time mutation
`npx convex run exercises:seed` **against that specific deployment**.

Because `scripts/vercel-build.js` gives every non-production branch its own
Convex preview deployment, a preview starts with zero exercises until it's
seeded. (At the time this was written the script used `--preview-create`, which
made it worse than described — it wiped and rebuilt the deployment on *every*
push, not just the first. See the `--preview-create` section below; it's
`--preview-name` now.) Production's Convex deployment was seeded previously
(existing users already see the library fine), so this has no user-facing
impact on `main` — nothing needs to be fixed or shipped there.

**DONE 2026-08-03 (later session).** `scripts/vercel-build.js` now passes
`--preview-run exercises:seed` to `convex deploy`. Convex has a purpose-built
flag for exactly this: it runs the named function after the schema push and is
**ignored on production deployments**, so the production path is untouched.
Safe on every rebuild because `exercises:seed` short-circuits with "Already
seeded — skipped." (That short-circuit only actually gets exercised now that
the script uses `--preview-name` — under `--preview-create` the database was
new every time, so it always did a full seed.) Verified two things by hand
rather than assuming: the Convex CLI *can* invoke an `internalMutation` (it
holds an admin/deploy key), and the idempotency guard really fires — running
`npx convex run exercises:seed` against the dev deployment returned
"Already seeded — skipped."

Then confirmed live on a real preview build (`dev` @ `d77f373`): the build log
shows `--preview-run exercises:seed` firing after the index push and returning
`"Seeded 70 exercises."` on the fresh deployment.

## "Could not create account, password must be at least 8 characters" on a preview — NOT a password problem

Hit on the `staging` preview 2026-08-03 while verifying the viewport fixes.
The message is a **lie**, in two layers:

1. **The real cause was zero env vars.** `convex env list --preview-name
   staging` returned *nothing* on `rightful-trout-304`. A preview deployment
   created by `--preview-create` starts with no environment variables, so
   Convex Auth had no `JWT_PRIVATE_KEY`/`JWKS` and could not mint a token —
   every sign-up failed. `scripts/setup-auth-env.mjs` already warned about
   this in its header comment; it's the same trap the `--deployment` flag was
   added for.
2. **The UI asserted a cause it never checked.** `SignInPage.tsx` passed that
   sentence as the *fallback* to `errorMessage(err, fallback)`, which returns
   the fallback for anything that isn't a `ConvexError` — network failures,
   misconfigured deployments, genuine bugs. Worse, the password input already
   carries `minLength: 8`, so the browser blocks a short password from ever
   being submitted: the stated cause was close to impossible. Now a neutral
   message.

**So: after creating any new preview deployment, set its auth env vars**, or
sign-up will fail with a misleading error:

```
node scripts/setup-auth-env.mjs --deployment=<name> --site-url=https://<branch-alias>
npx convex run exercises:seed --preview-name <branch>   # only for deployments
                                                        # built before the
                                                        # auto-seed change
```

Note the script parses `--deployment=<name>` (equals form), even though its
usage comment writes it as `--deployment <name>`.

`RESEND_API_KEY` is deliberately **not** set on previews — it's only needed for
password-reset/magic-link email, and pointing a disposable preview at the live
email-sending account isn't worth it. Password reset won't work on previews.

**DONE 2026-08-04.** `scripts/vercel-build.js` now runs the script after
deploying a preview, with `--if-absent` and `VERCEL_BRANCH_URL` as `SITE_URL`.

### `--preview-create` was deleting the deployment on every push

Found straight after PR #8 merged, because the `staging` rebuild logged
`"Seeded 70 exercises."` and *set* the auth keys — on a deployment that had
already been seeded and configured by hand an hour earlier.

The cause was in the flag, not the new code. Per `npx convex deploy --help`:

> `--preview-create <name>` — Like `--preview-name`, but **deletes and
> recreates** an existing preview deployment with the same name.

So every push to a non-production branch was destroying that branch's Convex
deployment and building a new one: empty database, zero environment variables,
every test account gone. Two things follow:

- The seeding/auth automation isn't a convenience. Without it, *every* push
  would leave that preview with no exercises and broken sign-up.
- The `--if-absent` guard was unreachable — there was never an existing
  deployment for it to find. The session loss it was written to prevent was
  happening anyway, by a different route.

Now `--preview-name`, which reuses the deployment. Test data and accounts
survive pushes, and `--if-absent` does its job. It also rehearses production
more honestly: production has persistent data, so a schema change that can't
cope with existing rows fails on a preview first instead of sailing through a
clean slate. The trade-off given up is the guaranteed clean-slate/first-install
test — run `--preview-create` by hand if that's ever specifically wanted.

## Would buying a domain make the dev/staging/main flow better?

Short answer: yes, but for usability of the existing pipeline, not for the
git-promotion mechanics themselves (dev → staging → main via PRs stays exactly
as-is either way).

**CORRECTION 2026-08-03 (later session).** The paragraph below overstated the
problem, and the correction weakens the case for buying a domain — record it
before deciding. Vercel *already* maintains a permanent alias per git branch,
for free, with no custom domain involved. Both were confirmed live:

- `https://swole-git-staging-tn1dgs-projects.vercel.app` → latest `staging`
- `https://swole-git-dev-tn1dgs-projects.vercel.app` → latest `dev`

They're bookmarkable and always track the newest build on that branch, so
hunting through `vercel ls` for a hash was never actually necessary. Both still
sit behind deployment protection (they return 302 to `curl`, and load normally
in a browser signed into Vercel), so a domain does **not** change QA access
either — that's controlled by the Deployment Protection setting, separately.

What a domain still genuinely buys: a real production URL you'd be willing to
put in front of users, and stable OAuth callback URLs later. Neither is urgent.

**What's true today (as originally written):** every Preview build (dev branch,
staging branch, any PR) gets a random, rotating URL like
`swole-<hash>-tn1dgs-projects.vercel.app`, and it sits behind Vercel's
deployment-protection auth wall (that's the 302 you'd see hitting it directly).
Finding "the current staging URL" means digging through `vercel ls` or the
dashboard every time.

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

## DONE 2026-08-04 — the domain is `swole.day`

Bought through Vercel (registrar: Vercel/name.com), $14.99 first year,
**auto-renews at $11.24/yr**, expires 2027-08-04. WHOIS privacy is on by
default — `.day` supports it. Vercel runs the nameservers, so there are no DNS
records to maintain.

| Host | Points at | Notes |
| --- | --- | --- |
| `swole.day` | `main` (production) | Live, HTTP 200, valid SSL |
| `www.swole.day` | → `swole.day` | 307 redirect |
| `staging.swole.day` | `staging` branch | 302s to Vercel SSO — deployment protection is still on, so it loads in a browser signed into Vercel |

Also changed: production Convex `SITE_URL` went from `https://swole-six.vercel.app`
to `https://swole.day`. **That mattered** — `SITE_URL` is what password-reset and
magic-link emails build their links from, so leaving it stale would have sent
users to the old origin. It's a runtime env var, so no redeploy was needed.

No CSP change was required, and this was *verified* rather than assumed:
`curl -sI https://swole.day` shows `connect-src 'self' https://*.convex.cloud
wss://*.convex.cloud`, which is origin-independent. HSTS, `X-Content-Type-Options`,
`Referrer-Policy` and `Permissions-Policy` all arrive on the new host too.

### Method note: don't trust RDAP for availability

An earlier pass in this doc listed `swole.io`, `swole.gg` and `swole.co` as
available, based on `rdap.org` returning 404. **All three are registered** —
`swole.io` is parked on Afternic, i.e. for sale on the aftermarket. Several
ccTLDs simply don't publish RDAP, so a 404 means "no data", not "unregistered".
Vercel's registrar API queries the real registry and got it right; a
`dns.google/resolve` NS lookup confirmed it independently. Use the registrar
API, or at minimum corroborate with NS records.

### Prices found while shopping (2026-08-04, Vercel at-cost)

Useful if a second domain is ever wanted. Renewal is the number that matters.

| Domain | First yr | Renewal/yr |
| --- | --- | --- |
| `swole.day` | $14.99 | **$11.24** ← bought |
| `*.app` (`swoleclub`, `swolehq`, `trainswole`, `justswole`, `swoleup`, `swolecoin`, `swoler`) | $9.99 | $15 |
| `swole.rocks` | $5.99 | $19 |
| `swole.run` | $6.99 | $22 |
| `swole.live` | $3.99 | $28 |
| `swole.team` | $7.99 | $31 |
| `swole.fitness` | $9.99 | $33 |

Taken: every `swolemate.*`, `swole.com/.app/.fit/.io/.gg/.co/.club/.social/.one/.studio`,
`getswole.*`, `trainswole.com`, `swolecoin.com`. `swole.win` is a $385 registry premium.

## When the mobile app arrives

The domain is now load-bearing for deep linking, which it wasn't before:

- iOS Universal Links need `https://swole.day/.well-known/apple-app-site-association`
  served as `application/json`, with **no redirect** — note `www` 307s to the
  apex, so publish against the apex.
- Android App Links need `https://swole.day/.well-known/assetlinks.json`.
- Both are static files served from `public/`. `vercel.json` *does* carry a
  catch-all rewrite (`/(.*)` → `/index.html`), but Vercel only applies rewrites
  when nothing matches on the filesystem, so a real file in `dist/.well-known/`
  wins over the SPA fallback. The thing actually worth checking is whether Vite
  copies a **dot-directory** out of `public/` into `dist/` — verify
  `dist/.well-known/` exists after a build before wiring up either platform,
  because a silently-missing file returns `index.html` with a 200 and looks like
  a platform bug rather than a build one.
- If social login is ever added, its redirect URIs should use `swole.day` now
  that a stable origin exists. That was the main argument for owning a domain.

## Decisions needed from you

- [x] ~~Verify the `staging` build, then go/no-go on `staging → main`.~~ Verified;
      PR #7 merged 2026-08-03, production deployed.
- [x] ~~Pick a name + registrar.~~ `swole.day`, bought through Vercel.
- [x] ~~Confirm subdomain scheme.~~ Apex for production, `staging.swole.day` for
      the staging branch, `www` redirecting to the apex. `dev` deliberately has
      no public alias — it's the most volatile branch and the free
      `swole-git-dev-…vercel.app` alias covers it.
- [x] ~~Whether to bother auto-seeding preview Convex deployments with
      exercises.~~ Done — see the seeding section above.
- [ ] Decide whether Vercel Deployment Protection should stay on for
      `staging.swole.day`. It's a stable URL now, but still behind the SSO wall,
      so anyone testing needs Vercel access.
- [ ] Promote the outstanding `dev` work (sign-up error message, preview
      auto-seed, auth automation) via a `dev → staging` PR.
