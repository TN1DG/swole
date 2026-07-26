import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery } from 'convex/react'
import { Box, Button, TextField, Typography } from '@mui/material'
import type { Id } from '../../../convex/_generated/dataModel'
import { api } from '../../../convex/_generated/api'
import { formatShortDate, formatWorkoutDate } from '../../lib/dates'
import { errorMessage } from '../../lib/errors'
import { ProgressRing } from '../../components/ProgressRing'
import { GlassTile } from '../../components/GlassTile'
import { tokens } from '../../theme/tokens'

const DAY_MS = 24 * 60 * 60 * 1000

export function FriendChatPage() {
  const { userId } = useParams<{ userId: string }>()
  const friendId = userId as Id<'users'>

  const thread = useQuery(api.pings.getThread, { friendUserId: friendId })
  const friends = useQuery(api.friends.myFriends)
  const sendPing = useMutation(api.pings.send)
  const acknowledge = useMutation(api.pings.acknowledge)

  const bottomRef = useRef<HTMLDivElement>(null)
  const friend = friends?.find((f) => f.userId === friendId)
  const now = Date.now()
  const hasPendingOutgoing =
    thread?.some((p) => p.isMine && p.acknowledgedAt === null) ?? false

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [thread?.length])

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          mx: -2,
          mt: -2,
          px: 2,
          py: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
          position: 'sticky',
          top: 0,
          zIndex: 10,
          bgcolor: 'rgb(30 28 25 / 0.9)',
          backdropFilter: 'blur(4px)',
        }}
      >
        <Typography component={Link} to="/friends" color="text.secondary" sx={{ fontWeight: 500, textDecoration: 'none' }}>
          ←
        </Typography>
        <Typography sx={{ fontWeight: 600 }}>{friend?.displayName ?? '…'}</Typography>
      </Box>

      <ChallengeSection friendId={friendId} friendName={friend?.displayName ?? 'them'} />

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, py: 2, minHeight: '50vh' }}>
        {thread === undefined ? (
          <Typography sx={{ textAlign: 'center' }} color="text.secondary">
            Loading…
          </Typography>
        ) : thread.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 4 }}>
            No pings yet — hit "Ping" below to get started!
          </Typography>
        ) : (
          thread.map((ping) => {
            const expired = now - ping.sentAt > DAY_MS
            return (
              <Box
                key={ping._id}
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 0.5,
                  maxWidth: '80%',
                  alignSelf: ping.isMine ? 'flex-end' : 'flex-start',
                  alignItems: ping.isMine ? 'flex-end' : 'flex-start',
                  opacity: expired ? 0.4 : 1,
                }}
              >
                <Box
                  sx={
                    ping.isMine
                      ? { borderRadius: '16px', px: 2, py: 1.25, bgcolor: 'primary.main', color: 'primary.contrastText' }
                      : { borderRadius: '16px', px: 2, py: 1.25, bgcolor: tokens.surface2Glass, border: '1px solid rgb(69 61 53 / 0.3)' }
                  }
                >
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    I'm heading to the gym! 💪
                  </Typography>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ px: 0.5 }}>
                  {formatWorkoutDate(ping.sentAt)}
                </Typography>

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
          })
        )}
        <div ref={bottomRef} />
      </Box>

      <Button
        variant="contained"
        fullWidth
        disabled={hasPendingOutgoing}
        sx={{ position: 'sticky', bottom: 0 }}
        onClick={() => void sendPing({ toUserId: friendId })}
      >
        Ping 🏋️
      </Button>
    </Box>
  )
}

// The most recent challenge between me and this friend, plus the compose
// flow. Only one open (pending/active) challenge per friend pair can exist
// (enforced server-side), so "current" is unambiguous.
function ChallengeSection({ friendId, friendName }: { friendId: Id<'users'>; friendName: string }) {
  const challenges = useQuery(api.challenges.getThread, { friendUserId: friendId })
  const propose = useMutation(api.challenges.propose)
  const accept = useMutation(api.challenges.accept)
  const decline = useMutation(api.challenges.decline)
  const cancelChallenge = useMutation(api.challenges.cancel)

  const [composing, setComposing] = useState(false)
  const [weeks, setWeeks] = useState('2')
  const [wager, setWager] = useState('20')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (challenges === undefined) return null
  const current = challenges[0]
  const open = current && (current.status === 'pending' || current.status === 'active')

  async function handlePropose(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await propose({
        opponentId: friendId,
        weeks: parseInt(weeks, 10),
        wagerPoints: parseInt(wager, 10),
      })
      setComposing(false)
    } catch (err) {
      setError(errorMessage(err, 'Could not propose.'))
    } finally {
      setBusy(false)
    }
  }

  async function respond(action: 'accept' | 'decline' | 'cancel', challengeId: Id<'challenges'>) {
    setError(null)
    setBusy(true)
    try {
      if (action === 'accept') await accept({ challengeId })
      else if (action === 'decline') await decline({ challengeId })
      else await cancelChallenge({ challengeId })
    } catch (err) {
      setError(errorMessage(err, 'Something went wrong.'))
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <GlassTile sx={{ mt: 1.5, p: 2 }}>
        {current?.status === 'resolved' && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {current.winnerId === undefined
              ? 'Last challenge tied — points returned.'
              : current.isMine === (current.winnerId === current.challengerId)
                ? `You won the last challenge! +${current.wagerPoints} pts`
                : `${friendName} won the last challenge.`}
          </Typography>
        )}
        {composing ? (
          <Box component="form" onSubmit={handlePropose} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography sx={{ fontWeight: 600 }}>Challenge {friendName} ⚔️</Typography>
            <Typography variant="caption" color="text.secondary">
              Whoever keeps the longer streak wins the pot.
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1 }}>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Weeks
                </Typography>
                <TextField
                  value={weeks}
                  onChange={(e) => setWeeks(e.target.value)}
                  size="small"
                  fullWidth
                  sx={{ mt: 0.5 }}
                  slotProps={{ htmlInput: { inputMode: 'numeric' } }}
                />
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Wager (pts)
                </Typography>
                <TextField
                  value={wager}
                  onChange={(e) => setWager(e.target.value)}
                  size="small"
                  fullWidth
                  sx={{ mt: 0.5 }}
                  slotProps={{ htmlInput: { inputMode: 'numeric' } }}
                />
              </Box>
            </Box>
            {error && (
              <Typography variant="body2" color="error">
                {error}
              </Typography>
            )}
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button type="submit" variant="contained" size="small" fullWidth disabled={busy}>
                Propose
              </Button>
              <Button variant="outlined" color="inherit" size="small" fullWidth onClick={() => setComposing(false)}>
                Cancel
              </Button>
            </Box>
          </Box>
        ) : (
          <Button variant="outlined" color="inherit" fullWidth sx={{ color: 'text.secondary' }} onClick={() => setComposing(true)}>
            Start a Challenge ⚔️
          </Button>
        )}
      </GlassTile>
    )
  }

  if (current.status === 'pending' && current.isMine) {
    return (
      <GlassTile sx={{ mt: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Waiting for {friendName} to accept… ({current.wagerPoints} pts, {current.weeks}w)
        </Typography>
        <Button
          variant="outlined"
          color="inherit"
          size="small"
          disabled={busy}
          sx={{ flexShrink: 0 }}
          onClick={() => void respond('cancel', current._id)}
        >
          Cancel
        </Button>
      </GlassTile>
    )
  }

  if (current.status === 'pending' && !current.isMine) {
    return (
      <GlassTile sx={{ mt: 1.5, p: 2 }}>
        <Typography variant="body2">
          {friendName} challenged you: {current.wagerPoints} pts, {current.weeks} weeks — longer streak wins.
        </Typography>
        {error && (
          <Typography variant="body2" color="error" sx={{ mt: 0.5 }}>
            {error}
          </Typography>
        )}
        <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
          <Button variant="contained" size="small" fullWidth disabled={busy} onClick={() => void respond('accept', current._id)}>
            Accept
          </Button>
          <Button variant="outlined" color="inherit" size="small" fullWidth disabled={busy} onClick={() => void respond('decline', current._id)}>
            Decline
          </Button>
        </Box>
      </GlassTile>
    )
  }

  // active
  const youName = 'You'
  const challengerName = current.isMine ? youName : friendName
  const opponentName = current.isMine ? friendName : youName
  const challengerStreak = current.liveChallengerStreak ?? 0
  const opponentStreak = current.liveOpponentStreak ?? 0

  return (
    <GlassTile sx={{ mt: 1.5, p: 2 }}>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        Challenge in progress — {current.wagerPoints} pts · ends{' '}
        {current.endsAt !== undefined ? formatShortDate(current.endsAt) : '…'}
      </Typography>
      <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-around' }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
          <ProgressRing progress={challengerStreak / current.weeks} color="var(--color-accent)" size={48} label={String(challengerStreak)} />
          <Typography variant="caption" color="text.secondary">
            {challengerName}
          </Typography>
        </Box>
        <Typography color="text.secondary">vs</Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
          <ProgressRing progress={opponentStreak / current.weeks} color="var(--color-accent)" size={48} label={String(opponentStreak)} />
          <Typography variant="caption" color="text.secondary">
            {opponentName}
          </Typography>
        </Box>
      </Box>
    </GlassTile>
  )
}
