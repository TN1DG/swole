// Generates the VAPID keys Web Push needs and stores them as environment variables
// on a Convex deployment. Every deployment needs its own pair.
//
// Run with:
//   node scripts/setup-push-env.mjs --prod
//   node scripts/setup-push-env.mjs --preview-name=<branch> --if-absent
//
// `--if-absent` is the CI path, used by scripts/vercel-build.js. Regenerating keys
// silently kills every existing subscription, so never overwrite a working pair:
// devices would simply stop getting notifications, with no error anywhere.
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import webpush from 'web-push'

function flagValue(name) {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
}

const previewName = flagValue('preview-name')
const targetFlags = process.argv.includes('--prod')
  ? ['--prod']
  : previewName
    ? ['--preview-name', previewName]
    : []

const cli = path.resolve('node_modules/convex/bin/main.js')

// Captured rather than inherited: the listing includes secret values, and this
// runs in CI logs. Only the presence of the key name is used.
const listed = spawnSync(process.execPath, [cli, 'env', 'list', ...targetFlags], { encoding: 'utf8' })
if (/^VAPID_PRIVATE_KEY=/m.test(listed.stdout ?? '')) {
  if (process.argv.includes('--if-absent')) {
    console.log('[setup-push-env] VAPID keys already set — leaving them alone.')
    process.exit(0)
  }
  console.error('[setup-push-env] VAPID keys are already set. Replacing them breaks every device')
  console.error('[setup-push-env] subscribed today. Remove VAPID_PRIVATE_KEY first if you mean it.')
  process.exit(1)
}

const { publicKey, privateKey } = webpush.generateVAPIDKeys()
const values = {
  VAPID_PUBLIC_KEY: publicKey,
  VAPID_PRIVATE_KEY: privateKey,
  // How a push service can reach whoever runs this. A URL rather than an email, so
  // no personal address gets attached to anything.
  VAPID_SUBJECT: 'https://swole.day',
}

for (const [name, value] of Object.entries(values)) {
  console.log(`[setup-push-env] Setting ${name}...`)
  // Output not inherited: `env set` can echo what it was given.
  spawnSync(process.execPath, [cli, 'env', 'set', ...targetFlags, '--', name, value], {
    encoding: 'utf8',
  })
}

// Verified by listing rather than by exit codes, which Node on Windows can report
// as a crash even after the value was saved.
const after = spawnSync(process.execPath, [cli, 'env', 'list', ...targetFlags], { encoding: 'utf8' })
const missing = Object.keys(values).filter((name) => !new RegExp(`^${name}=`, 'm').test(after.stdout ?? ''))
if (missing.length > 0) {
  console.error(`[setup-push-env] Failed to set: ${missing.join(', ')}`)
  process.exit(1)
}
console.log('[setup-push-env] Done.')
