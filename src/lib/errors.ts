import { ConvexError } from 'convex/values'

// Convex mutations throw ConvexError for expected, user-facing conditions
// (a name too long, insufficient points, ...) — see convex/validation.ts.
// The clean message lives on `.data`, NOT `.message`: the client wraps
// `.message` in a "[CONVEX ...] Server Error" diagnostic string meant for
// debugging, regardless of whether the server threw Error or ConvexError.
// Anything that isn't a ConvexError (network failure, a genuine bug) falls
// back to a generic message instead of leaking that diagnostic text.
export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ConvexError && typeof err.data === 'string') return err.data
  return fallback
}
