// Read a Convex deployment environment variable.
//
// Reached through `globalThis` rather than the bare `process` global on
// purpose. nutrition.ts and turnstile.ts both export a *public* action,
// which puts this file in the `api` type surface that `src` imports — so it
// gets type-checked by tsconfig.app.json, whose `types` is `["vite/client"]`
// with no node types. (convex/emailAuth.ts uses `process.env` directly and
// is fine precisely because it only exports internal functions and never
// enters that graph.)
export function envVar(name: string): string | undefined {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[
    name
  ]
}
