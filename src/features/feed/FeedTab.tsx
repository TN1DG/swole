import { useState } from 'react'
import { useQuery } from 'convex/react'
import { Box, Button, Typography } from '@mui/material'
import { api } from '../../../convex/_generated/api'
import { SegmentedControl } from '../../components/SegmentedControl'
import { PostCard, type FeedPost } from './PostCard'

type Stream = 'friends' | 'discover'

/**
 * The feed, as a segment of the Friends page rather than a sixth bottom tab —
 * five tabs already ellipsize "Exercises" on a 360px phone, and a sixth drops
 * each to ~60px.
 *
 * Paging accumulates in local state rather than using `usePaginatedQuery`,
 * because the friends stream is a hand-rolled merge across up to 40 author
 * indexes and has no Convex cursor to hand back. See convex/feed.ts.
 */
export function FeedTab() {
  const [stream, setStream] = useState<Stream>('friends')
  const [cursor, setCursor] = useState<{ createdAt: number; id: string } | null>(null)
  const [older, setOlder] = useState<FeedPost[]>([])

  const args = cursor
    ? { beforeCreatedAt: cursor.createdAt, beforeId: cursor.id as FeedPost['_id'] }
    : {}
  const friends = useQuery(api.feed.friendsFeed, stream === 'friends' ? args : 'skip')
  const discover = useQuery(api.feed.discoverFeed, stream === 'discover' ? args : 'skip')
  const result = stream === 'friends' ? friends : discover

  function switchStream(next: Stream) {
    setStream(next)
    setCursor(null)
    setOlder([])
  }

  // Newest page stays live (Convex re-runs it when a friend posts); pages
  // already scrolled past are frozen snapshots, which is what you want —
  // items must not reshuffle under the reader.
  const posts = [...older, ...(result?.posts ?? [])]

  return (
    <>
      <Box sx={{ mt: 2 }}>
        <SegmentedControl
          value={stream}
          onChange={switchStream}
          options={[
            { value: 'friends', label: 'Friends' },
            { value: 'discover', label: 'Discover' },
          ]}
        />
      </Box>

      {result?.truncated && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
          You have a lot of friends — this feed covers your 40 most recent.
        </Typography>
      )}

      {result === undefined ? (
        <Typography sx={{ mt: 3, textAlign: 'center' }} color="text.secondary">
          Loading…
        </Typography>
      ) : posts.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 4, textAlign: 'center' }}>
          {stream === 'friends'
            ? 'Nothing here yet — finish a workout and tap Share to Feed.'
            : 'No public posts yet. Be the first.'}
        </Typography>
      ) : (
        <Box sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {posts.map((post) => (
            <PostCard key={post._id} post={post} />
          ))}
        </Box>
      )}

      {result && !result.isDone && result.nextCursor && (
        <Button
          fullWidth
          variant="outlined"
          color="inherit"
          sx={{ mt: 2 }}
          onClick={() => {
            setOlder(posts)
            setCursor(result.nextCursor)
          }}
        >
          Load more
        </Button>
      )}
    </>
  )
}
