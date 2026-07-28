import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery } from 'convex/react'
import { Box, Button, IconButton, TextField, Typography } from '@mui/material'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { formatWorkoutDate } from '../../lib/dates'
import { errorMessage } from '../../lib/errors'
import { Avatar } from '../../components/Avatar'
import { PostCard } from './PostCard'
import { LIMITS } from '../../../convex/validation'

export function PostDetailPage() {
  const { postId } = useParams()
  const data = useQuery(api.feed.getPost, { postId: postId as Id<'posts'> })
  const addComment = useMutation(api.feed.addComment)
  const deleteComment = useMutation(api.feed.deleteComment)

  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const text = draft.trim()
    if (!text || !postId) return
    setBusy(true)
    setError(null)
    setDraft('')
    try {
      await addComment({ postId: postId as Id<'posts'>, text })
    } catch (err) {
      setDraft(text) // don't lose what they typed
      setError(errorMessage(err, 'Could not post that comment.'))
    } finally {
      setBusy(false)
    }
  }

  if (data === undefined) {
    return (
      <Typography sx={{ mt: 4, textAlign: 'center' }} color="text.secondary">
        Loading…
      </Typography>
    )
  }
  if (data === null) {
    return (
      <Box sx={{ mt: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">This post isn't available.</Typography>
        <Typography component={Link} to="/friends" color="primary.main" sx={{ textDecoration: 'underline' }}>
          Back to Friends
        </Typography>
      </Box>
    )
  }

  return (
    <Box>
      <Typography component={Link} to="/friends" variant="body2" color="text.secondary" sx={{ textDecoration: 'none' }}>
        ← Feed
      </Typography>

      <Box sx={{ mt: 1.5 }}>
        <PostCard post={data.post} />
      </Box>

      <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
        {data.comments.length} comment{data.comments.length === 1 ? '' : 's'}
      </Typography>

      <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {data.comments.map((comment) => (
          <Box key={comment._id} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
            <Avatar src={comment.author.avatarUrl} name={comment.author.displayName} size={28} />
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {comment.author.displayName}{' '}
                <Typography component="span" variant="caption" color="text.secondary">
                  {formatWorkoutDate(comment.createdAt)}
                </Typography>
              </Typography>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {comment.text}
              </Typography>
            </Box>
            {(comment.isMine || data.post.isMine) && (
              <IconButton
                aria-label="Delete comment"
                size="small"
                sx={{ flexShrink: 0, color: 'text.secondary' }}
                onClick={() => void deleteComment({ commentId: comment._id })}
              >
                ✕
              </IconButton>
            )}
          </Box>
        ))}
      </Box>

      {error && (
        <Typography variant="body2" color="error" sx={{ mt: 1 }}>
          {error}
        </Typography>
      )}

      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{
          position: 'sticky',
          bottom: 'var(--app-nav-h)',
          ml: 'calc(-1 * var(--app-gutter-left))',
          mr: 'calc(-1 * var(--app-gutter-right))',
          pl: 'var(--app-gutter-left)',
          pr: 'var(--app-gutter-right)',
          py: 1,
          mt: 2,
          display: 'flex',
          gap: 1,
          bgcolor: 'rgb(30 28 25 / 0.9)',
          backdropFilter: 'blur(4px)',
        }}
      >
        <TextField
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={data.post.visibility === 'public' ? 'Anyone can see this…' : 'Add a comment…'}
          size="small"
          fullWidth
          slotProps={{ htmlInput: { maxLength: LIMITS.postCommentMaxLength, 'aria-label': 'Comment' } }}
        />
        <Button type="submit" variant="contained" disabled={busy || !draft.trim()} sx={{ flexShrink: 0 }}>
          Post
        </Button>
      </Box>
    </Box>
  )
}
