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

// A fresh preview deployment also starts with zero environment variables, so
// Convex Auth has no signing keys and every sign-up fails — previously with a
// misleading "password must be at least 8 characters" error. Set them here so
// a new branch or PR preview is usable the moment it finishes building.
//
// Runs after the deploy because the deployment has to exist first, and only on
// previews: production's keys are set once, by hand, and must never be
// regenerated. `--if-absent` makes this a no-op on rebuilds, which matters
// because new keys would invalidate every session on that preview.
if (!isProduction) {
  // VERCEL_BRANCH_URL is the stable per-branch alias (swole-git-<branch>-...);
  // VERCEL_URL is the per-deployment hash, which changes on every push.
  const host = process.env.VERCEL_BRANCH_URL ?? process.env.VERCEL_URL
  const authCmd = [
    'node scripts/setup-auth-env.mjs',
    `--preview-name="${branch}"`,
    '--if-absent',
    host ? `--site-url="https://${host}"` : '',
  ]
    .filter(Boolean)
    .join(' ')

  console.log(`[vercel-build] ${authCmd}`)
  execSync(authCmd, { stdio: 'inherit' })
}
