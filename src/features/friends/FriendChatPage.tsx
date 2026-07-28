import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { Box, Button, IconButton, TextField, Typography } from '@mui/material'
import type { Id } from '../../../convex/_generated/dataModel'
import { api } from '../../../convex/_generated/api'
import { formatShortDate, formatWorkoutDate } from '../../lib/dates'
import { errorMessage } from '../../lib/errors'
import { ProgressRing } from '../../components/ProgressRing'
import { GlassTile } from '../../components/GlassTile'
import { Avatar } from '../../components/Avatar'
import { SwoleCoin } from '../../components/SwoleCoin'
import { ChallengeComposeDialog } from './ChallengeComposeDialog'
import { tokens } from '../../theme/tokens'

const DAY_MS = 24 * 60 * 60 * 1000

type ThreadEntry = FunctionReturnType<typeof api.friendThread.getThread>[number]
type ChallengeEntry = Extract<ThreadEntry, { type: 'challenge' }>['challenge']
type PingEntry = Extract<ThreadEntry, { type: 'ping' }>['ping']

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

  return (
    <Box>
      {/* Sticks *below* the app header, not at the viewport top — at top: 0
          it slid underneath the (higher z-index) app bar and vanished the
          moment you scrolled. --app-header-h is the app bar's measured
          height; see useChromeHeights in AppLayout. */}
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
          top: 'var(--app-header-h)',
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

          Pinned above the tab bar rather than at bottom: 0, where the fixed
          nav covered it whenever the thread was scrolled mid-way. Full-bleed
          (negative gutter margins) so the blur covers the whole strip instead
          of leaving message text visible in the side gutters. */}
      <Box
        sx={{
          position: 'sticky',
          bottom: 'var(--app-nav-h)',
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
          <Button
            variant="contained"
            fullWidth
            disabled={sending || hasPendingOutgoingPing}
            onClick={() => void run(() => sendPing({ toUserId: friendId }))}
          >
            Ping 🏋️
          </Button>
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

// ---------- thread entry renderers ----------

function Bubble({
  isMine,
  ts,
  children,
  faded,
}: {
  isMine: boolean
  ts: number
  children: React.ReactNode
  faded?: boolean
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
        opacity: faded ? 0.4 : 1,
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

function PingBubble({ ping }: { ping: PingEntry }) {
  const acknowledge = useMutation(api.pings.acknowledge)
  const expired = Date.now() - ping.sentAt > DAY_MS

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 0.5,
        maxWidth: '80%',
        alignSelf: ping.isMine ? 'flex-end' : 'flex-start',
        alignItems: ping.isMine ? 'flex-end' : 'flex-start',
      }}
    >
      <Bubble isMine={ping.isMine} ts={ping.sentAt} faded={expired}>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          I'm heading to the gym! 💪
        </Typography>
      </Bubble>

      {ping.isMine ? (
        <Typography variant="caption" color="text.secondary" sx={{ px: 0.5 }}>
          {ping.acknowledgedAt !== null ? 'Held accountable ✓' : 'Waiting…'}
        </Typography>
      ) : !ping.acknowledgedAt && !expired ? (
        <Button
          variant="contained"
          size="small"
          sx={{ mt: 0.5 }}
          onClick={() => void acknowledge({ pingId: ping._id })}
        >
          Hold them accountable 💪
        </Button>
      ) : null}

      {ping.linkedWorkout && (
        <Typography
          component={Link}
          to={`/friends/${ping.fromUserId}/${ping.linkedWorkout._id}`}
          variant="caption"
          color="primary.main"
          sx={{ px: 0.5, textDecoration: 'underline' }}
        >
          See workout → {ping.linkedWorkout.name}
        </Typography>
      )}

      {ping.isMine && !ping.linkedWorkout && !expired && (
        <Typography component={Link} to="/" variant="caption" color="primary.main" sx={{ px: 0.5, textDecoration: 'underline' }}>
          Log workout →
        </Typography>
      )}
    </Box>
  )
}

// One card per challenge, showing its CURRENT status — the thread has no
// per-transition event log (see convex/friendThread.ts).
function ChallengeCard({
  challenge,
  friendName,
}: {
  challenge: ChallengeEntry
  friendName: string
}) {
  const accept = useMutation(api.challenges.accept)
  const decline = useMutation(api.challenges.decline)
  const cancelChallenge = useMutation(api.challenges.cancel)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function respond(action: 'accept' | 'decline' | 'cancel') {
    setError(null)
    setBusy(true)
    try {
      if (action === 'accept') await accept({ challengeId: challenge._id })
      else if (action === 'decline') await decline({ challengeId: challenge._id })
      else await cancelChallenge({ challengeId: challenge._id })
    } catch (err) {
      setError(errorMessage(err, 'Something went wrong.'))
    } finally {
      setBusy(false)
    }
  }

  const header = (
    <Typography
      variant="overline"
      color="text.secondary"
      sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
    >
      Challenge · {challenge.wagerPoints} <SwoleCoin size={13} title="points" /> · {challenge.weeks}w
    </Typography>
  )

  if (challenge.status === 'pending') {
    return (
      <GlassTile sx={{ p: 2 }}>
        {header}
        {challenge.isMine ? (
          <>
            <Typography variant="body2" color="text.secondary">
              Waiting for {friendName} to accept…
            </Typography>
            <Button
              variant="outlined"
              color="inherit"
              size="small"
              disabled={busy}
              sx={{ mt: 1 }}
              onClick={() => void respond('cancel')}
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Typography variant="body2">
              {friendName} challenged you — longer streak wins.
            </Typography>
            <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
              <Button variant="contained" size="small" fullWidth disabled={busy} onClick={() => void respond('accept')}>
                Accept
              </Button>
              <Button variant="outlined" color="inherit" size="small" fullWidth disabled={busy} onClick={() => void respond('decline')}>
                Decline
              </Button>
            </Box>
          </>
        )}
        {error && (
          <Typography variant="body2" color="error" sx={{ mt: 0.5 }}>
            {error}
          </Typography>
        )}
      </GlassTile>
    )
  }

  if (challenge.status === 'active') {
    const youName = 'You'
    const challengerName = challenge.isMine ? youName : friendName
    const opponentName = challenge.isMine ? friendName : youName
    const challengerStreak = challenge.liveChallengerStreak ?? 0
    const opponentStreak = challenge.liveOpponentStreak ?? 0

    return (
      <GlassTile sx={{ p: 2 }}>
        {header}
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          In progress — ends {challenge.endsAt !== undefined ? formatShortDate(challenge.endsAt) : '…'}
        </Typography>
        <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-around' }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
            <ProgressRing progress={challengerStreak / challenge.weeks} color="var(--color-accent)" size={48} label={String(challengerStreak)} />
            <Typography variant="caption" color="text.secondary">
              {challengerName}
            </Typography>
          </Box>
          <Typography color="text.secondary">vs</Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
            <ProgressRing progress={opponentStreak / challenge.weeks} color="var(--color-accent)" size={48} label={String(opponentStreak)} />
            <Typography variant="caption" color="text.secondary">
              {opponentName}
            </Typography>
          </Box>
        </Box>
      </GlassTile>
    )
  }

  // resolved / declined / cancelled
  return (
    <GlassTile sx={{ p: 2 }}>
      {header}
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
      >
        {challenge.status === 'declined' ? (
          'Challenge declined.'
        ) : challenge.status === 'cancelled' ? (
          'Challenge cancelled.'
        ) : challenge.winnerId === undefined ? (
          'Tied — points returned.'
        ) : challenge.isMine === (challenge.winnerId === challenge.challengerId) ? (
          <>
            You won! +{challenge.wagerPoints} <SwoleCoin size={14} title="points" />
          </>
        ) : (
          `${friendName} won.`
        )}
      </Typography>
    </GlassTile>
  )
}
