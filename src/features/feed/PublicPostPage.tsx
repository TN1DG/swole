import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from 'convex/react'
import { Box, Button, Typography } from '@mui/material'
import { api } from '../../../convex/_generated/api'
import { formatWorkoutDate } from '../../lib/dates'
import { Avatar } from '../../components/Avatar'
import { BarbellIcon } from '../../components/icons'
import { GlassCard } from '../../components/GlassCard'
import { SignInPage } from '../auth/SignInPage'
import { brandTokens } from '../../theme/tokens'
import { StatLine } from './PostCard'

/**
 * A shared post, for someone who isn't signed in: the X-style landing page
 * behind swole.day/p/:id. Public posts only (feed.publicPost returns null for
 * anything else). Signed-in visitors never see this; App sends them to the
 * full post at /feed/:id.
 */
export function PublicPostPage() {
  const { postId = '' } = useParams()
  const post = useQuery(api.feed.publicPost, { postId })
  const [joining, setJoining] = useState<false | 'signIn' | 'signUp'>(false)

  // Signing up from here lands on the full post: App's /p/:id route
  // redirects signed-in users to /feed/:id.
  if (joining) return <SignInPage initialStep={joining} />

  const join = (
    <Box sx={{ mt: 3, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Button variant="contained" size="large" fullWidth onClick={() => setJoining('signUp')}>
        Join Swole
      </Button>
      <Button color="inherit" fullWidth onClick={() => setJoining('signIn')}>
        I already have an account
      </Button>
    </Box>
  )

  return (
    <Box sx={{ maxWidth: 480, mx: 'auto', px: 2, py: 3, minHeight: '100svh' }}>
      <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, color: 'primary.main' }}>
        <BarbellIcon size={22} />
        <Typography component="span" sx={{ fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase' }}>
          Swole
        </Typography>
      </Box>

      {post === undefined ? (
        <Typography color="text.secondary" sx={{ textAlign: 'center', mt: 6 }}>
          Loading…
        </Typography>
      ) : post === null ? (
        <GlassCard sx={{ textAlign: 'center' }}>
          <Typography sx={{ fontWeight: 600 }}>This post isn’t public</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            It may be for friends only, or it’s been deleted. Join Swole to see what your friends are lifting.
          </Typography>
          {join}
        </GlassCard>
      ) : (
        <GlassCard>
          {post.repostedBy && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              🔁 Reposted by {post.repostedBy}
            </Typography>
          )}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Avatar src={post.author.avatarUrl} name={post.author.displayName} size={40} />
            <Box sx={{ minWidth: 0 }}>
              <Typography noWrap sx={{ fontWeight: 600 }}>
                {post.author.displayName}
              </Typography>
              <Typography noWrap variant="body2" color="text.secondary">
                {post.author.username && `@${post.author.username} · `}
                {formatWorkoutDate(post.createdAt)}
              </Typography>
            </Box>
          </Box>

          {post.caption && <Typography sx={{ mt: 1.5, whiteSpace: 'pre-wrap' }}>{post.caption}</Typography>}

          {post.photoUrl ? (
            <Box
              component="img"
              src={post.photoUrl}
              alt=""
              sx={{
                mt: 1.5,
                width: '100%',
                borderRadius: '12px',
                display: 'block',
                ...(post.photoWidth && post.photoHeight
                  ? { aspectRatio: `${post.photoWidth} / ${post.photoHeight}` }
                  : null),
              }}
            />
          ) : post.cardUrl ? (
            // No photo: the workout card the link preview shows.
            <Box component="img" src={post.cardUrl} alt={post.workoutName ?? 'Workout'} sx={{ mt: 1.5, width: '100%', borderRadius: '12px', display: 'block', aspectRatio: '1200 / 630' }} />
          ) : (
            post.workoutName !== null && (
              // An older post with no card: draw its stats instead.
              <Box sx={{ mt: 1.5, borderRadius: '12px', bgcolor: brandTokens.surface, p: 2, color: '#fff' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: brandTokens.accent }}>
                  <BarbellIcon size={18} />
                  <Typography component="span" sx={{ fontSize: '0.75rem', fontWeight: 900, letterSpacing: '0.2em' }}>
                    SWOLE
                  </Typography>
                </Box>
                <StatLine post={post} />
              </Box>
            )
          )}

          {(post.photoUrl || post.cardUrl) && <StatLine post={post} />}

          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
            ❤️ {post.likeCount} · 💬 {post.commentCount}
          </Typography>
          {join}
        </GlassCard>
      )}
    </Box>
  )
}
