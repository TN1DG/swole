import { execSync } from 'node:child_process'

// Vercel builds every branch (git integration is now on): production gets the
// real Convex backend, every other branch gets its own Convex preview
// deployment instead of touching prod data.
const isProduction = process.env.VERCEL_ENV === 'production'
const branch = process.env.VERCEL_GIT_COMMIT_REF ?? 'preview'

// Every preview deployment starts with an empty database, so the built-in
// exercise library is missing until it's seeded. `--preview-run` runs after the
// schema push and is ignored on production, and `exercises:seed` is a no-op
// once seeded, so it's safe on every rebuild of a reused preview deployment.
const cmd = isProduction
  ? `npx convex deploy --cmd "npm run build"`
  : `npx convex deploy --cmd "npm run build" --preview-create "${branch}" --preview-run exercises:seed`

console.log(`[vercel-build] VERCEL_ENV=${process.env.VERCEL_ENV ?? 'unset'} -> ${cmd}`)
execSync(cmd, { stdio: 'inherit' })
