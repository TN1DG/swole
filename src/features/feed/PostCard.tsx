import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { Box, Button, IconButton, Menu, MenuItem, Typography } from '@mui/material'
import { api } from '../../../convex/_generated/api'
import { formatDuration, formatKg } from '../../../convex/fitness'
import { formatWorkoutDate } from '../../lib/dates'
import { errorMessage } from '../../lib/errors'
import { Avatar } from '../../components/Avatar'
import { GlassTile } from '../../components/GlassTile'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { tokens } from '../../theme/tokens'

export type FeedPost = FunctionReturnType<typeof api.feed.friendsFeed>['posts'][number]

type WorkoutSnapshot = {
  workoutName: string | null
  durationMs: number | null
  volumeKg: number | null
  setCount: number | null
  prCount: number | null
  exerciseNames: string[]
}

function StatLine({ post: p }: { post: WorkoutSnapshot }) {
  if (p.workoutName === null) return null
  return (
    <>
      <Typography sx={{ mt: 1, fontWeight: 600 }}>{p.workoutName}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
        {p.durationMs !== null && `${formatDuration(p.durationMs)} · `}
        {formatKg(p.volumeKg ?? 0)} kg · {p.setCount ?? 0} sets
        {(p.prCount ?? 0) > 0 && ` · 🏆 ${p.prCount}`}
      </Typography>
      {p.exerciseNames.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          {p.exerciseNames.slice(0, 4).join(' · ')}
          {p.exerciseNames.length > 4 && ` +${p.exerciseNames.length - 4} more`}
        </Typography>
      )}
    </>
  )
}

/**
 * One post in the feed. Everything shown here comes off the post row itself
 * — the workout stats are a snapshot taken when it was published, so this
 * never fetches a workout.
 */
export function PostCard({ post }: { post: FeedPost }) {
  const toggleLike = useMutation(api.feed.toggleLike)
  const repost = useMutation(api.feed.repost)
  const deletePost = useMutation(api.feed.deletePost)
  const reportPost = useMutation(api.feed.reportPost)
  const blockUser = useMutation(api.feed.blockUser)

  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(action: () => Promise<unknown>) {
    setError(null)
    setMenuAnchor(null)
    try {
      await action()
    } catch (err) {
      setError(errorMessage(err, 'Something went wrong.'))
    }
  }

  const original = post.repostOf

  return (
    <GlassTile sx={{ p: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Avatar src={post.author.avatarUrl} name={post.author.displayName} size={36} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography noWrap sx={{ fontWeight: 600 }}>
            {post.author.displayName}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {formatWorkoutDate(post.createdAt)}
            {post.visibility === 'friends' && ' · Friends only'}
          </Typography>
        </Box>
        <IconButton
          aria-label="Post options"
          size="small"
          sx={{ flexShrink: 0, color: 'text.secondary' }}
          onClick={(e) => setMenuAnchor(e.currentTarget)}
        >
          ⋯
        </IconButton>
      </Box>

      {post.caption && (
        <Typography variant="body2" sx={{ mt: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {post.caption}
        </Typography>
      )}

      {post.photoUrl && (
        <Box
          component="img"
          src={post.photoUrl}
          alt=""
          sx={{ mt: 1, width: '100%', borderRadius: '12px', display: 'block' }}
        />
      )}

      {original === null ? (
        <StatLine post={post} />
      ) : !original.available ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontStyle: 'italic' }}>
          This post is no longer available.
        </Typography>
      ) : (
        // Quote-tweet layout. Never nests further: repost() collapses the
        // chain, so the embed is always the true original.
        <Box sx={{ mt: 1, p: 1.5, borderRadius: '12px', border: `1px solid ${tokens.borderGlass}` }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Avatar src={original.author.avatarUrl} name={original.author.displayName} size={24} />
            <Typography noWrap variant="body2" sx={{ minWidth: 0, fontWeight: 600 }}>
              {original.author.displayName}
            </Typography>
          </Box>
          {original.caption && (
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              {original.caption}
            </Typography>
          )}
          {original.photoUrl && (
            <Box
              component="img"
              src={original.photoUrl}
              alt=""
              sx={{ mt: 1, width: '100%', borderRadius: '8px', display: 'block' }}
            />
          )}
          <StatLine post={original} />
        </Box>
      )}

      {error && (
        <Typography variant="body2" color="error" sx={{ mt: 1 }}>
          {error}
        </Typography>
      )}

      <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Button
          size="small"
          color="inherit"
          sx={{ color: post.likedByMe ? 'primary.main' : 'text.secondary', minWidth: 0 }}
          onClick={() => void run(() => toggleLike({ postId: post._id }))}
        >
          {post.likedByMe ? '❤️' : '🤍'} {post.likeCount}
        </Button>
        <Button
          component={Link}
          to={`/feed/${post._id}`}
          size="small"
          color="inherit"
          sx={{ color: 'text.secondary', minWidth: 0 }}
        >
          💬 {post.commentCount}
        </Button>
        {/* Only public posts can be reposted — see convex/feed.ts:repost for
            why a friends-only repost cannot be made safe. */}
        {post.visibility === 'public' && !post.isMine && (
          <Button
            size="small"
            color="inherit"
            sx={{ color: 'text.secondary', minWidth: 0 }}
            onClick={() => void run(() => repost({ postId: post._id }))}
          >
            🔁 {post.repostCount}
          </Button>
        )}
      </Box>

      <Menu anchorEl={menuAnchor} open={menuAnchor !== null} onClose={() => setMenuAnchor(null)}>
        {post.isMine ? (
          <MenuItem
            onClick={() => {
              setMenuAnchor(null)
              setConfirmDelete(true)
            }}
          >
            Delete post
          </MenuItem>
        ) : (
          [
            <MenuItem
              key="report"
              onClick={() =>
                void run(() => reportPost({ postId: post._id, reason: 'Reported from feed' }))
              }
            >
              Report post
            </MenuItem>,
            <MenuItem
              key="block"
              onClick={() => void run(() => blockUser({ userId: post.author.userId }))}
            >
              Block {post.author.displayName}
            </MenuItem>,
          ]
        )}
      </Menu>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this post?"
        description="Its likes, comments and any reposts of it go too. This can't be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={() => void run(() => deletePost({ postId: post._id }))}
      />
    </GlassTile>
  )
}
