import { ImageResponse } from '@vercel/og'
import { fetchPublicPost } from './_lib/convex.js'

// The rust preset (src/theme/presets.ts), which share cards always use.
const BG = '#0a0908'
const SURFACE = '#1e1c19'
const TEXT = '#f0ebe3'
const MUTED = '#a89a8c'
const ACCENT = '#c1541f'

// On the Edge runtime, which @vercel/og is built for. As a Node function it
// failed to load (a dynamic require('fs') in its bundle), and from 1.0 its
// Edge build imports Node's `module`, which Edge refuses, so the package is
// pinned to 0.11.1, whose Edge build imports only its own wasm.
export const config = { runtime: 'edge' }

// Satori takes plain { type, props } element objects, so this file needs no
// JSX, which the root tsconfig.json Vercel compiles functions with lacks.
type Node = { type: string; props: Record<string, unknown> }
type Child = Node | string | null | false
function h(style: Record<string, unknown>, ...children: Child[]): Node {
  const kids = children.filter((c): c is Node | string => c !== null && c !== false)
  return { type: 'div', props: { style: { display: 'flex', ...style }, children: kids } }
}

function formatDuration(ms: number) {
  const minutes = Math.round(ms / 60_000)
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`
}

function stat(label: string, value: string) {
  return h(
    { flexDirection: 'column' },
    h({ fontSize: 26, color: MUTED, textTransform: 'uppercase', letterSpacing: 2 }, label),
    h({ fontSize: 56, fontWeight: 700, color: TEXT }, value),
  )
}

/**
 * The 1200×630 picture a post's link preview shows when the post has no
 * photo: its workout, drawn like a Swole share card. Public posts only;
 * anything else is a 404 and the preview falls back to the page tags.
 */
export default async function handler(request: Request): Promise<Response> {
  const postId = new URL(request.url).searchParams.get('id') ?? ''
  const post = await fetchPublicPost(postId)
  if (!post || post.workoutName === null) return new Response('Not found', { status: 404 })

  const exercises = post.exerciseNames.slice(0, 4).join(' · ')
  const more = post.exerciseNames.length > 4 ? ` +${post.exerciseNames.length - 4}` : ''

  const card = h(
    { width: '100%', height: '100%', background: BG, padding: 48 },
    h(
      {
        flex: 1,
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: SURFACE,
        borderRadius: 32,
        padding: 56,
        color: TEXT,
      },
      h(
        { justifyContent: 'space-between', alignItems: 'center' },
        h({ fontSize: 30, fontWeight: 900, letterSpacing: 10, color: ACCENT }, 'SWOLE'),
        h({ fontSize: 28, color: MUTED }, post.author.displayName),
      ),
      h(
        { flexDirection: 'column' },
        h({ fontSize: 68, fontWeight: 900 }, post.workoutName),
        exercises && h({ marginTop: 8, fontSize: 30, color: MUTED }, exercises + more),
      ),
      h(
        { gap: 72 },
        post.durationMs !== null && stat('Time', formatDuration(post.durationMs)),
        stat('Volume', `${Math.round(post.volumeKg ?? 0).toLocaleString('en-US')} kg`),
        stat('Sets', String(post.setCount ?? 0)),
        (post.prCount ?? 0) > 0 && stat('PRs', String(post.prCount)),
      ),
    ),
  )

  // ImageResponse is typed for React elements; satori renders these objects
  // the same way.
  return new ImageResponse(card as unknown as ConstructorParameters<typeof ImageResponse>[0], {
    width: 1200,
    height: 630,
    headers: {
      'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
    },
  })
}
