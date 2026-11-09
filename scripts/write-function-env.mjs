import { writeFileSync } from 'node:fs'

// Runs inside `convex deploy --cmd` (scripts/vercel-build.js), the only place
// the deployment's URL is known: Convex passes it to the build command as
// VITE_CONVEX_URL. The Vercel functions in api/ need it at runtime to read
// public posts, so it is baked into the module they import.
const url = process.env.VITE_CONVEX_URL
if (!url) {
  console.warn('[write-function-env] VITE_CONVEX_URL is not set; api/ functions will need CONVEX_URL')
  process.exit(0)
}

writeFileSync(
  new URL('../api/_lib/convexUrl.generated.ts', import.meta.url),
  `// Written by scripts/write-function-env.mjs during the Vercel build.\nexport const GENERATED_CONVEX_URL: string | undefined = ${JSON.stringify(url)}\n`,
)
console.log(`[write-function-env] api/ functions will use ${url}`)
