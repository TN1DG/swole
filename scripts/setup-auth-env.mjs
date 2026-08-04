// Generates the JWT signing keys Convex Auth needs and stores them as
// environment variables on a Convex deployment. Every deployment needs its own
// copy: a fresh preview deployment created via `--preview-create` starts with
// zero env vars, so sign-up fails there until this has been run against it.
//
// Run with:
//   node scripts/setup-auth-env.mjs --prod --site-url=https://...
//   node scripts/setup-auth-env.mjs --deployment=<name> --site-url=https://...
//   node scripts/setup-auth-env.mjs --preview-name=<branch> --if-absent --site-url=https://...
//
// `--preview-name` + `--if-absent` is the CI path, used by
// scripts/vercel-build.js. See --if-absent below for why it matters.
import { spawnSync } from 'node:child_process'
import path from 'node:path'

function flagValue(name) {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
}

const isProd = process.argv.includes('--prod')
const deployment = flagValue('deployment')
const previewName = flagValue('preview-name')
// Only write the keys when the deployment doesn't already have them.
// Regenerating JWT_PRIVATE_KEY invalidates every existing session, so a build
// that ran this unconditionally would sign everyone out on every push.
const ifAbsent = process.argv.includes('--if-absent')
const siteUrl = flagValue('site-url') ?? 'http://localhost:5173'

// Call the Convex CLI via node directly so values pass as single argv
// entries (no shell quoting issues on Windows).
const cli = path.resolve('node_modules/convex/bin/main.js')
const targetFlags = isProd
  ? ['--prod']
  : deployment
    ? ['--deployment', deployment]
    : previewName
      ? ['--preview-name', previewName]
      : []
const targetLabel = isProd
  ? ' (prod)'
  : deployment
    ? ` (${deployment})`
    : previewName
      ? ` (preview: ${previewName})`
      : ''

if (ifAbsent) {
  // Capture rather than inherit: the listing includes secret values, and this
  // runs in CI logs. Only the presence of the key name is used.
  const listed = spawnSync(process.execPath, [cli, 'env', 'list', ...targetFlags], {
    encoding: 'utf8',
  })
  if (listed.status === 0 && /^JWT_PRIVATE_KEY=/m.test(listed.stdout ?? '')) {
    console.log(`[setup-auth-env] JWT_PRIVATE_KEY already set${targetLabel} — leaving it alone.`)
    process.exit(0)
  }
}

const { exportJWK, exportPKCS8, generateKeyPair } = await import('jose')
const keys = await generateKeyPair('RS256', { extractable: true })
const privateKey = await exportPKCS8(keys.privateKey)
const publicKey = await exportJWK(keys.publicKey)
const jwks = JSON.stringify({ keys: [{ use: 'sig', ...publicKey }] })

function envSet(name, value) {
  console.log(`Setting ${name}${targetLabel}...`)
  // '--' stops the CLI from treating the value (e.g. a PEM key starting
  // with dashes) as an option flag.
  const args = [cli, 'env', 'set', ...targetFlags, '--', name, value]
  const r = spawnSync(process.execPath, args, { stdio: 'inherit' })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

envSet('JWT_PRIVATE_KEY', privateKey.trimEnd().replace(/\n/g, ' '))
envSet('JWKS', jwks)
envSet('SITE_URL', siteUrl)
console.log('Done.')
