import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fetchPublicPost } from './_lib/convex.js'
import { injectPostMeta, postMeta } from './_lib/postMeta.js'

/**
 * swole.day/p/:id (rewritten here by vercel.json). Serves the app's own
 * index.html with link-preview tags for the post, so X, iMessage, WhatsApp
 * and the rest unfurl it like a tweet, while a person gets the normal app,
 * which renders the post at the same URL.
 *
 * dist/index.html is bundled into this function via vercel.json's
 * `includeFiles`; reading it from disk rather than fetching it over HTTP
 * keeps previews behind Vercel's deployment protection working.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const postId = url.searchParams.get('id') ?? ''

  let html: string
  try {
    html = readFileSync(join(process.cwd(), 'dist', 'index.html'), 'utf8')
  } catch {
    // Never leave a shared link dead: without the shell, send them to the app.
    return Response.redirect(`${url.origin}/feed/${encodeURIComponent(postId)}`, 302)
  }

  const post = await fetchPublicPost(postId)
  return new Response(injectPostMeta(html, postMeta(post, url.origin, postId)), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Short: a caption edit or deletion should reach previews soon.
      'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=600',
    },
  })
}
