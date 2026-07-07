// One-time setup: generates the JWT signing keys Convex Auth needs and
// stores them as environment variables on the Convex deployment.
// Run with: node scripts/setup-auth-env.mjs [--prod] [--site-url=https://...]
import { exportJWK, exportPKCS8, generateKeyPair } from 'jose'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const isProd = process.argv.includes('--prod')
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
function envSet(name, value) {
  console.log(`Setting ${name}${isProd ? ' (prod)' : ''}...`)
  // '--' stops the CLI from treating the value (e.g. a PEM key starting
  // with dashes) as an option flag.
  const args = [cli, 'env', 'set', ...(isProd ? ['--prod'] : []), '--', name, value]
  const r = spawnSync(process.execPath, args, { stdio: 'inherit' })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

envSet('JWT_PRIVATE_KEY', privateKey.trimEnd().replace(/\n/g, ' '))
envSet('JWKS', jwks)
envSet('SITE_URL', siteUrl)
console.log('Done.')
