import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery } from 'convex/react'
import { Box, Button, IconButton, TextField, Typography } from '@mui/material'
import { motion } from 'framer-motion'
import type { Id } from '../../../convex/_generated/dataModel'
import { api } from '../../../convex/_generated/api'
import { formatWorkoutDate } from '../../lib/dates'
import { errorMessage } from '../../lib/errors'
import { Avatar } from '../../components/Avatar'
import { PingSendFlare } from '../../components/PingSendFlare'
import { ChallengeComposeDialog } from './ChallengeComposeDialog'
import { PingBubble } from './PingBubble'
import { ChallengeCard } from './ChallengeCard'
import { tokens } from '../../theme/tokens'

const MotionButton = motion.create(Button)

export function FriendChatPage() {
  const { userId } = useParams<{ userId: string }>()
  const friendId = userId as Id<'users'>

  const thread = useQuery(api.friendThread.getThread, { friendUserId: friendId })
  const friends = useQuery(api.friends.myFriends)
  const sendPing = useMutation(api.pings.send)
  const sendMessage = useMutation(api.messages.send)
  const markRead = useMutation(api.friendThread.markRead)

  const bottomRef = useRef<HTMLDivElement>(null)
  const friend = friends?.find((f) => f.userId === friendId)

  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [composingChallenge, setComposingChallenge] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pingFlareKey, setPingFlareKey] = useState(0)

  const hasPendingOutgoingPing =
    thread?.some((e) => e.type === 'ping' && e.isMine && e.ping.acknowledgedAt === null) ?? false

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [thread?.length])

  // Clear this friend's unread badge whenever the thread is open and changes
  // — not just on mount, so a message arriving while you're already looking
  // at the thread still counts as read. Keyed on `thread` itself (a fresh
  // array identity on every reactive update); this can't feed back into
  // itself because getThread doesn't read threadReads.
  useEffect(() => {
    if (thread === undefined) return
    void markRead({ friendUserId: friendId })
  }, [thread, friendId, markRead])

  async function run(action: () => Promise<unknown>) {
    setError(null)
    setSending(true)
    try {
      await action()
    } catch (err) {
      setError(errorMessage(err, 'Something went wrong.'))
    } finally {
      setSending(false)
    }
  }

  async function handleSendMessage(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const text = draft.trim()
    if (!text) return
    setDraft('')
    await run(async () => {
      try {
        await sendMessage({ toUserId: friendId, text })
      } catch (err) {
        setDraft(text) // don't lose what they typed
        throw err
      }
    })
  }

  async function handleSendPing() {
    await run(async () => {
      await sendPing({ toUserId: friendId })
      setPingFlareKey((k) => k + 1)
    })
  }

  return (
    <Box>
      {/* Sticks to the top of the page's own scroll region — AppLayout's
          `main` is the scrolling element (the app header/nav are fixed
          layout chrome outside it), so `top: 0` here means flush against
          the top of the visible content area, not the viewport. */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          ml: 'calc(-1 * var(--app-gutter-left))',
          mr: 'calc(-1 * var(--app-gutter-right))',
          mt: -2,
          pl: 'var(--app-gutter-left)',
          pr: 'var(--app-gutter-right)',
          py: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
          position: 'sticky',
          top: 0,
          zIndex: (t) => t.zIndex.appBar - 1,
          bgcolor: 'rgb(30 28 25 / 0.9)',
          backdropFilter: 'blur(4px)',
        }}
      >
        <Typography component={Link} to="/friends" color="text.secondary" sx={{ fontWeight: 500, textDecoration: 'none' }}>
          ←
        </Typography>
        <Avatar src={friend?.avatarUrl} name={friend?.displayName} size={32} />
        <Typography
          component={Link}
          to={`/friends/${friendId}`}
          sx={{ fontWeight: 600, color: 'text.primary', textDecoration: 'none' }}
        >
          {friend?.displayName ?? '…'}
        </Typography>
      </Box>

      {/* svh, not vh: on mobile Safari `vh` is the *largest* viewport height
          (toolbars hidden), so 50vh reserved more empty space than the thread
          could ever occupy on a short thread. */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, py: 2, minHeight: '50svh' }}>
        {thread === undefined ? (
          <Typography sx={{ textAlign: 'center' }} color="text.secondary">
            Loading…
          </Typography>
        ) : thread.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 4 }}>
            Nothing here yet — say hi, send a ping, or start a challenge.
          </Typography>
        ) : (
          thread.map((entry) => {
            if (entry.type === 'challenge') {
              return (
                <ChallengeCard
                  key={entry.key}
                  challenge={entry.challenge}
                  friendName={friend?.displayName ?? 'them'}
                />
              )
            }
            if (entry.type === 'ping') {
              return <PingBubble key={entry.key} ping={entry.ping} />
            }
            return (
              <Bubble key={entry.key} isMine={entry.isMine} ts={entry.ts}>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {entry.message.text}
                </Typography>
              </Bubble>
            )
          })
        )}
        <div ref={bottomRef} />
      </Box>

      {error && (
        <Typography variant="body2" color="error" sx={{ mb: 1 }}>
          {error}
        </Typography>
      )}

      {/* Composer: Ping and Challenge side by side, then the message row —
          the message box sits closest to the thumb, where the thing you do
          most often belongs.

          Sticks to the bottom of the page's own scroll region (see the
          header comment above — `main` is what scrolls, the nav is fixed
          layout chrome outside it, so `bottom: 0` is flush against the
          content area, not the viewport). Full-bleed (negative gutter
          margins) so the blur covers the whole strip instead of leaving
          message text visible in the side gutters. */}
      <Box
        sx={{
          position: 'sticky',
          bottom: 0,
          ml: 'calc(-1 * var(--app-gutter-left))',
          mr: 'calc(-1 * var(--app-gutter-right))',
          pl: 'var(--app-gutter-left)',
          pr: 'var(--app-gutter-right)',
          pb: 1,
          pt: 1,
          bgcolor: 'rgb(30 28 25 / 0.9)',
          backdropFilter: 'blur(4px)',
        }}
      >
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Box sx={{ position: 'relative', width: '100%', borderRadius: 1, overflow: 'hidden' }}>
            <MotionButton
              variant="contained"
              fullWidth
              disabled={sending || hasPendingOutgoingPing}
              whileTap={{ scale: 0.96 }}
              onClick={() => void handleSendPing()}
            >
              Ping 🏋️
            </MotionButton>
            <PingSendFlare triggerKey={pingFlareKey} />
          </Box>
          <Button
            variant="outlined"
            color="inherit"
            fullWidth
            sx={{ color: 'text.secondary' }}
            onClick={() => setComposingChallenge(true)}
          >
            Challenge ⚔️
          </Button>
        </Box>
        <Box component="form" onSubmit={handleSendMessage} sx={{ mt: 1, display: 'flex', gap: 1 }}>
          <TextField
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Message…"
            size="small"
            fullWidth
            slotProps={{ htmlInput: { maxLength: 1000, 'aria-label': 'Message' } }}
          />
          <IconButton
            type="submit"
            aria-label="Send message"
            disabled={sending || !draft.trim()}
            sx={{ flexShrink: 0, color: 'primary.main' }}
          >
            ➤
          </IconButton>
        </Box>
      </Box>

      {composingChallenge && (
        <ChallengeComposeDialog
          friendId={friendId}
          friendName={friend?.displayName ?? 'them'}
          onClose={() => setComposingChallenge(false)}
        />
      )}
    </Box>
  )
}

// ---------- plain message bubble ----------

function Bubble({
  isMine,
  ts,
  children,
}: {
  isMine: boolean
  ts: number
  children: React.ReactNode
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 0.5,
        maxWidth: '80%',
        alignSelf: isMine ? 'flex-end' : 'flex-start',
        alignItems: isMine ? 'flex-end' : 'flex-start',
      }}
    >
      <Box
        sx={
          isMine
            ? { borderRadius: '16px', px: 2, py: 1.25, bgcolor: 'primary.main', color: 'primary.contrastText' }
            : { borderRadius: '16px', px: 2, py: 1.25, bgcolor: tokens.surface2Glass, border: '1px solid rgb(69 61 53 / 0.3)' }
        }
      >
        {children}
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ px: 0.5 }}>
        {formatWorkoutDate(ts)}
      </Typography>
    </Box>
  )
}
