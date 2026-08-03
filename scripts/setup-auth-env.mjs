// One-time setup: generates the JWT signing keys Convex Auth needs and
// stores them as environment variables on the Convex deployment. Every
// deployment needs its own copy of these (a fresh preview deployment created
// via `--preview-create` starts with zero env vars — see the "dev" branch
// preview incident this script's --deployment flag was added for) — run this
// against each new preview deployment before testing auth flows on it.
// Run with: node scripts/setup-auth-env.mjs [--prod | --deployment <name>] [--site-url=https://...]
import { exportJWK, exportPKCS8, generateKeyPair } from 'jose'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const isProd = process.argv.includes('--prod')
const deployment = process.argv
  .find((a) => a.startsWith('--deployment='))
  ?.slice('--deployment='.length)
const siteUrl =
  process.argv.find((a) => a.startsWith('--site-url='))?.slice('--site-url='.length) ??
  'http://localhost:5173'

const keys = await generateKeyPair('RS256', { extractable: true })
const privateKey = await exportPKCS8(keys.privateKey)
const publicKey = await exportJWK(keys.publicKey)
const jwks = JSON.stringify({ keys: [{ use: 'sig', ...publicKey }] })

// Call the Convex CLI via node directly so values pass as single argv
// entries (no shell quoting issues on Windows).
const cli = path.resolve('node_modules/convex/bin/main.js')
const targetFlags = isProd ? ['--prod'] : deployment ? ['--deployment', deployment] : []
const targetLabel = isProd ? ' (prod)' : deployment ? ` (${deployment})` : ''
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
