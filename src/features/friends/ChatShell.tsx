import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation } from 'convex/react'
import { Box, IconButton, Menu, MenuItem, Typography } from '@mui/material'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Avatar } from '../../components/Avatar'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { errorMessage } from '../../lib/errors'

// Mobile browsers put the keyboard over the page rather than shrinking it, so a
// composer at the bottom of a normal full-height layout would sit behind the
// keyboard. The visual viewport is the part actually left visible; sizing the
// shell to it keeps the composer just above the keyboard. offsetTop covers iOS
// Safari scrolling the page up as well when an input takes focus.
function useVisualViewport() {
  const [viewport, setViewport] = useState<{ height: number; offsetTop: number } | null>(null)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => setViewport({ height: vv.height, offsetTop: vv.offsetTop })
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  return viewport
}

// The full-screen frame of a conversation, in place of the app's header and tab
// bar: all of the screen goes to the messages and the keyboard.
export function ChatShell({
  friendId,
  friendName,
  avatarUrl,
  isFriend,
  status,
  onLeave,
  children,
}: {
  friendId: Id<'users'>
  friendName: string
  avatarUrl?: string | null
  isFriend: boolean
  status: string | null
  onLeave: () => void
  children: React.ReactNode
}) {
  const viewport = useVisualViewport()
  const removeFriend = useMutation(api.friends.removeFriend)
  const blockUser = useMutation(api.feed.blockUser)

  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const [confirming, setConfirming] = useState<'remove' | 'block' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function confirmAction() {
    setError(null)
    try {
      if (confirming === 'remove') await removeFriend({ friendId })
      else await blockUser({ userId: friendId })
      onLeave()
    } catch (err) {
      setError(errorMessage(err, 'Something went wrong.'))
    }
  }

  return (
    <Box
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        mx: 'auto',
        maxWidth: '32rem',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
      style={{
        height: viewport ? viewport.height : '100dvh',
        transform: viewport ? `translateY(${viewport.offsetTop}px)` : undefined,
      }}
    >
      <Box
        component="header"
        sx={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
          pl: 'max(0.25rem, env(safe-area-inset-left))',
          pr: 'max(0.25rem, env(safe-area-inset-right))',
          pt: 'max(0.5rem, env(safe-area-inset-top))',
          pb: 0.75,
        }}
      >
        <IconButton component={Link} to="/friends?tab=chats" aria-label="Back to chats" sx={{ color: 'text.secondary' }}>
          ←
        </IconButton>
        <Box
          component={Link}
          to={`/friends/${friendId}`}
          sx={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            color: 'inherit',
            textDecoration: 'none',
          }}
        >
          <Avatar src={avatarUrl} name={friendName} size={36} />
          <Box sx={{ minWidth: 0 }}>
            <Typography noWrap sx={{ fontWeight: 600, lineHeight: 1.25 }}>
              {friendName}
            </Typography>
            {status && (
              <Typography noWrap variant="caption" color="primary.main" sx={{ display: 'block', lineHeight: 1.2 }}>
                {status}
              </Typography>
            )}
          </Box>
        </Box>
        <IconButton
          aria-label="Conversation options"
          sx={{ color: 'text.secondary' }}
          onClick={(e) => setMenuAnchor(e.currentTarget)}
        >
          ⋮
        </IconButton>
      </Box>

      {error && (
        <Typography variant="body2" color="error" sx={{ flexShrink: 0, px: 2, py: 0.5 }}>
          {error}
        </Typography>
      )}

      {children}

      <Menu anchorEl={menuAnchor} open={menuAnchor !== null} onClose={() => setMenuAnchor(null)}>
        <MenuItem component={Link} to={`/friends/${friendId}`}>
          View profile
        </MenuItem>
        {isFriend && (
          <MenuItem
            onClick={() => {
              setMenuAnchor(null)
              setConfirming('remove')
            }}
          >
            Remove friend
          </MenuItem>
        )}
        <MenuItem
          sx={{ color: 'error.main' }}
          onClick={() => {
            setMenuAnchor(null)
            setConfirming('block')
          }}
        >
          Block
        </MenuItem>
      </Menu>

      <ConfirmDialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title={confirming === 'remove' ? `Remove ${friendName}?` : `Block ${friendName}?`}
        description={
          confirming === 'remove'
            ? "You'll disappear from each other's friends list and leaderboard. You can send a new request any time."
            : "Neither of you will be able to message, ping or challenge the other, and their posts are hidden from you. They aren't told."
        }
        confirmLabel={confirming === 'remove' ? 'Remove' : 'Block'}
        destructive
        onConfirm={() => void confirmAction()}
      />
    </Box>
  )
}
