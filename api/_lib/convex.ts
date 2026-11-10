import { ConvexHttpClient } from 'convex/browser'
import { makeFunctionReference } from 'convex/server'
import { GENERATED_CONVEX_URL } from './convexUrl.generated.js'
import type { PublicPost } from './postMeta.js'

// By name rather than through convex/_generated/api: the generated module is
// built for the app bundle, and a function only needs this one reference.
const publicPostRef = makeFunctionReference<'query', { postId: string }, PublicPost | null>('feed:publicPost')

/**
 * The Convex deployment this Vercel deployment talks to. Written at build
 * time, because `convex deploy` only hands the URL to the build command; a
 * CONVEX_URL environment variable overrides it if one is ever set.
 */
function convexUrl(): string | undefined {
  return process.env.CONVEX_URL ?? GENERATED_CONVEX_URL
}

/** The public view of a post, or null when it isn't public or can't be read. */
export async function fetchPublicPost(postId: string): Promise<PublicPost | null> {
  const url = convexUrl()
  if (!url || !postId) return null
  try {
    return await new ConvexHttpClient(url).query(publicPostRef, { postId })
  } catch (error) {
    console.error('publicPost failed', error)
    return null
  }
}
