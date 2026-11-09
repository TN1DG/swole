import { ImageResponse } from '@vercel/og'
import { fetchPublicPost } from './_lib/convex.js'

// The rust preset (src/theme/presets.ts), which share cards always use.
const BG = '#0a0908'
const SURFACE = '#1e1c19'
const TEXT = '#f0ebe3'
const MUTED = '#a89a8c'
const ACCENT = '#c1541f'

function formatDuration(ms: number) {
  const minutes = Math.round(ms / 60_000)
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 26, color: MUTED, textTransform: 'uppercase', letterSpacing: 2 }}>{label}</div>
      <div style={{ fontSize: 56, fontWeight: 700, color: TEXT }}>{value}</div>
    </div>
  )
}

/**
 * The 1200×630 picture a post's link preview shows when the post has no
 * photo: its workout, drawn like a Swole share card. Public posts only;
 * anything else is a 404 and the preview falls back to the page tags.
 */
export async function GET(request: Request): Promise<Response> {
  const postId = new URL(request.url).searchParams.get('id') ?? ''
  const post = await fetchPublicPost(postId)
  if (!post || post.workoutName === null) return new Response('Not found', { status: 404 })

  const exercises = post.exerciseNames.slice(0, 4).join(' · ')
  const more = post.exerciseNames.length > 4 ? ` +${post.exerciseNames.length - 4}` : ''

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: BG, padding: 48 }}>
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            background: SURFACE,
            borderRadius: 32,
            padding: 56,
            color: TEXT,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: 10, color: ACCENT }}>SWOLE</div>
            <div style={{ fontSize: 28, color: MUTED }}>{post.author.displayName}</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 68, fontWeight: 900 }}>{post.workoutName}</div>
            {exercises && <div style={{ marginTop: 8, fontSize: 30, color: MUTED }}>{exercises + more}</div>}
          </div>

          <div style={{ display: 'flex', gap: 72 }}>
            {post.durationMs !== null && <Stat label="Time" value={formatDuration(post.durationMs)} />}
            <Stat label="Volume" value={`${Math.round(post.volumeKg ?? 0).toLocaleString('en-US')} kg`} />
            <Stat label="Sets" value={String(post.setCount ?? 0)} />
            {(post.prCount ?? 0) > 0 && <Stat label="PRs" value={String(post.prCount)} />}
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
      },
    },
  )
}
