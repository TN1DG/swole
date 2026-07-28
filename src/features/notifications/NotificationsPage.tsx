import { Link } from 'react-router-dom'
import { useMutation, usePaginatedQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { Box, Button, Typography } from '@mui/material'
import { api } from '../../../convex/_generated/api'
import { formatWorkoutDate } from '../../lib/dates'
import { GlassTile } from '../../components/GlassTile'

type Notification = FunctionReturnType<typeof api.notifications.listRecent>['page'][number]

/**
 * The notifications inbox.
 *
 * Shipped with the feed rather than after it: the banner stack shows at most
 * three at once and has no overflow, so likes and comments would otherwise
 * push friend requests off the only surface that ever displayed them.
 */
function describe(n: Notification): { text: string; to: string } {
  const others = n.othersCount > 0 ? ` and ${n.othersCount} other${n.othersCount > 1 ? 's' : ''}` : ''
  switch (n.kind) {
    case 'friend_request_received':
      return { text: `${n.fromName} sent you a friend request`, to: '/friends' }
    case 'friend_request_accepted':
      return { text: `${n.fromName} accepted your friend request`, to: '/friends' }
    case 'ping_received':
      return { text: `${n.fromName} is heading to the gym`, to: `/friends/${n.fromUserId}/chat` }
    case 'workout_finished_after_ping':
      return {
        text: `${n.fromName} won the battle 🏆`,
        to: n.workoutId ? `/friends/${n.fromUserId}/${n.workoutId}` : `/friends/${n.fromUserId}/chat`,
      }
    case 'post_liked':
      return { text: `${n.fromName}${others} liked your post`, to: n.postId ? `/feed/${n.postId}` : '/friends' }
    case 'post_commented':
      return { text: `${n.fromName}${others} commented on your post`, to: n.postId ? `/feed/${n.postId}` : '/friends' }
    case 'post_reposted':
      return { text: `${n.fromName}${others} reposted you`, to: n.postId ? `/feed/${n.postId}` : '/friends' }
  }
}

export function NotificationsPage() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.notifications.listRecent,
    {},
    { initialNumItems: 25 },
  )
  const markAllRead = useMutation(api.notifications.markAllRead)

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
          Notifications
        </Typography>
        <Button
          size="small"
          color="inherit"
          sx={{ flexShrink: 0, color: 'text.secondary' }}
          onClick={() => void markAllRead({})}
        >
          Mark all read
        </Button>
      </Box>

      {status === 'LoadingFirstPage' ? (
        <Typography sx={{ mt: 4, textAlign: 'center' }} color="text.secondary">
          Loading…
        </Typography>
      ) : results.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 4, textAlign: 'center' }}>
          Nothing yet.
        </Typography>
      ) : (
        <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {results.map((n) => {
            const { text, to } = describe(n)
            return (
              <Link key={n._id} to={to} style={{ textDecoration: 'none', display: 'block' }}>
                <GlassTile
                  sx={{
                    px: 1.5,
                    py: 1.25,
                    color: 'text.primary',
                    ...(n.readAt === null && { borderColor: 'rgb(193 84 31 / 0.4)' }),
                  }}
                >
                  <Typography variant="body2" sx={{ fontWeight: n.readAt === null ? 600 : 400 }}>
                    {text}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatWorkoutDate(n.createdAt)}
                  </Typography>
                </GlassTile>
              </Link>
            )
          })}
        </Box>
      )}

      {status === 'CanLoadMore' && (
        <Button fullWidth variant="outlined" color="inherit" sx={{ mt: 2 }} onClick={() => loadMore(25)}>
          Load more
        </Button>
      )}
    </Box>
  )
}
