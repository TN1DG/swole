import { useState } from 'react'
import { useMutation } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { Box, Button, Typography } from '@mui/material'
import { motion, useReducedMotion } from 'framer-motion'
import { api } from '../../../convex/_generated/api'
import { formatShortDate } from '../../lib/dates'
import { errorMessage } from '../../lib/errors'
import { ProgressRing } from '../../components/ProgressRing'
import { GlassTile } from '../../components/GlassTile'
import { SwoleCoin } from '../../components/SwoleCoin'
import { tokens } from '../../theme/tokens'

type ThreadEntry = FunctionReturnType<typeof api.friendThread.getThread>[number]
export type ChallengeEntry = Extract<ThreadEntry, { type: 'challenge' }>['challenge']

const PARTICLE_OFFSETS = [
  { x: -28, y: -18 },
  { x: 28, y: -22 },
  { x: -18, y: 16 },
  { x: 22, y: 14 },
  { x: 0, y: -30 },
]

// One card per challenge, showing its CURRENT status — the thread has no
// per-transition event log (see convex/friendThread.ts). Every status used
// to render inside an identical, uniformly-tinted GlassTile with the same
// muted typography — no color-coding for who's ahead or who won. This gives
// each status its own visual identity instead.
export function ChallengeCard({
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
  const prefersReducedMotion = useReducedMotion()

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
      color={challenge.status === 'pending' ? undefined : 'text.secondary'}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        ...(challenge.status === 'pending' && { color: tokens.accent }),
      }}
    >
      Challenge · {challenge.wagerPoints} <SwoleCoin size={13} title="points" /> · {challenge.weeks}w
    </Typography>
  )

  if (challenge.status === 'pending') {
    const glow = prefersReducedMotion
      ? { boxShadow: '0 0 0 1px rgb(193 84 31 / 0.35), 0 0 10px rgb(193 84 31 / 0.25)' }
      : undefined

    return (
      <motion.div
        style={glow}
        animate={
          prefersReducedMotion
            ? undefined
            : {
                boxShadow: [
                  '0 0 0 1px rgb(193 84 31 / 0.25), 0 0 4px rgb(193 84 31 / 0.1)',
                  '0 0 0 1px rgb(193 84 31 / 0.5), 0 0 16px rgb(193 84 31 / 0.35)',
                  '0 0 0 1px rgb(193 84 31 / 0.25), 0 0 4px rgb(193 84 31 / 0.1)',
                ],
              }
        }
        transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
      >
        <GlassTile sx={{ p: 2, borderColor: 'rgb(193 84 31 / 0.4)' }}>
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
      </motion.div>
    )
  }

  if (challenge.status === 'active') {
    const youName = 'You'
    const challengerName = challenge.isMine ? youName : friendName
    const opponentName = challenge.isMine ? friendName : youName
    const challengerStreak = challenge.liveChallengerStreak ?? 0
    const opponentStreak = challenge.liveOpponentStreak ?? 0
    const challengerAhead = challengerStreak > opponentStreak
    const opponentAhead = opponentStreak > challengerStreak

    return (
      <GlassTile sx={{ p: 2 }}>
        {header}
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          In progress — ends {challenge.endsAt !== undefined ? formatShortDate(challenge.endsAt) : '…'}
        </Typography>
        <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-around' }}>
          <RingSide
            name={challengerName}
            streak={challengerStreak}
            weeks={challenge.weeks}
            ahead={challengerAhead}
          />
          <Typography color="text.secondary">vs</Typography>
          <RingSide
            name={opponentName}
            streak={opponentStreak}
            weeks={challenge.weeks}
            ahead={opponentAhead}
          />
        </Box>
      </GlassTile>
    )
  }

  // resolved / declined / cancelled
  const won =
    challenge.status === 'resolved' &&
    challenge.winnerId !== undefined &&
    challenge.isMine === (challenge.winnerId === challenge.challengerId)
  const lost =
    challenge.status === 'resolved' &&
    challenge.winnerId !== undefined &&
    challenge.isMine !== (challenge.winnerId === challenge.challengerId)
  const declinedOrCancelled = challenge.status === 'declined' || challenge.status === 'cancelled'

  const body = (
    <GlassTile
      sx={{
        p: 2,
        ...(won && { borderColor: 'rgb(217 164 65 / 0.45)', bgcolor: 'rgb(217 164 65 / 0.06)' }),
        ...(lost && { opacity: 0.75 }),
        ...(declinedOrCancelled && { opacity: 0.6 }),
      }}
    >
      {header}
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
      >
        {challenge.status === 'declined' ? (
          '🚫 Challenge declined.'
        ) : challenge.status === 'cancelled' ? (
          '🚫 Challenge cancelled.'
        ) : challenge.winnerId === undefined ? (
          '⚖️ Tied — points returned.'
        ) : won ? (
          <>
            You won!{' '}
            <motion.span
              initial={prefersReducedMotion ? undefined : { scale: 0 }}
              animate={prefersReducedMotion ? undefined : { scale: 1 }}
              transition={{ delay: 0.3, type: 'spring', stiffness: 400, damping: 12 }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              +{challenge.wagerPoints} <SwoleCoin size={14} title="points" />
            </motion.span>
          </>
        ) : (
          `${friendName} won.`
        )}
      </Typography>
    </GlassTile>
  )

  if (!won) return body

  return (
    <motion.div
      style={{ position: 'relative' }}
      initial={prefersReducedMotion ? undefined : { scale: 0.92, opacity: 0 }}
      animate={prefersReducedMotion ? undefined : { scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 15 }}
    >
      {body}
      {!prefersReducedMotion && (
        <Box sx={{ position: 'absolute', top: '20%', left: '20%', pointerEvents: 'none' }} aria-hidden>
          {PARTICLE_OFFSETS.map((offset, i) => (
            <motion.span
              key={i}
              style={{ position: 'absolute', fontSize: '0.9rem' }}
              initial={{ x: 0, y: 0, opacity: 1 }}
              animate={{ x: offset.x, y: offset.y, opacity: 0 }}
              transition={{ duration: 0.8, delay: 0.15 }}
            >
              ✨
            </motion.span>
          ))}
        </Box>
      )}
    </motion.div>
  )
}

function RingSide({
  name,
  streak,
  weeks,
  ahead,
}: {
  name: string
  streak: number
  weeks: number
  ahead: boolean
}) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
      <Box
        sx={
          ahead
            ? { filter: 'drop-shadow(0 0 6px rgb(193 84 31 / 0.5))' }
            : undefined
        }
      >
        <ProgressRing
          progress={streak / weeks}
          color={ahead ? tokens.accent : tokens.muted}
          size={48}
          label={String(streak)}
          animate
        />
      </Box>
      <Typography variant="caption" color={ahead ? 'text.primary' : 'text.secondary'} sx={{ fontWeight: ahead ? 600 : 400 }}>
        {name}
      </Typography>
    </Box>
  )
}
