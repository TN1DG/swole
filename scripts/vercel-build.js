import { execSync } from 'node:child_process'

// Vercel builds every branch (git integration is now on): production gets the
// real Convex backend, every other branch gets its own Convex preview
// deployment instead of touching prod data.
const isProduction = process.env.VERCEL_ENV === 'production'
const branch = process.env.VERCEL_GIT_COMMIT_REF ?? 'preview'

const cmd = isProduction
  ? `npx convex deploy --cmd "npm run build"`
  : `npx convex deploy --cmd "npm run build" --preview-create "${branch}"`

console.log(`[vercel-build] VERCEL_ENV=${process.env.VERCEL_ENV ?? 'unset'} -> ${cmd}`)
execSync(cmd, { stdio: 'inherit' })
