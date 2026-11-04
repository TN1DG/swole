import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { Box, Button, Typography } from '@mui/material'
import { motion, useReducedMotion } from 'framer-motion'
import { api } from '../../../convex/_generated/api'
import { formatShortDate } from '../../lib/dates'
import { errorMessage } from '../../lib/errors'
import { Avatar } from '../../components/Avatar'
import { GlassTile } from '../../components/GlassTile'
import { SwoleCoin } from '../../components/SwoleCoin'
import {
  challengeOutcome,
  closedLabel,
  leadLabel,
  myAndTheirStreak,
  timeLeftLabel,
} from './challengeDisplay'

type ThreadEntry = FunctionReturnType<typeof api.friendThread.getThread>[number]
export type ChallengeEntry = Extract<ThreadEntry, { type: 'challenge' }>['challenge']

type Tone = 'accent' | 'live' | 'gold' | 'neutral'

const TONE_STYLES: Record<Tone, { color: string; bgcolor: string }> = {
  // Solid, because this one is asking you to do something.
  accent: { color: 'primary.contrastText', bgcolor: 'primary.main' },
  live: { color: 'success.main', bgcolor: 'rgb(122 154 82 / 0.16)' },
  gold: { color: 'pr.main', bgcolor: 'rgb(217 164 65 / 0.16)' },
  neutral: { color: 'text.secondary', bgcolor: 'surface2.main' },
}

function StatusPill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <Box
      component="span"
      sx={{
        ...TONE_STYLES[tone],
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        px: 1,
        py: 0.25,
        borderRadius: '999px',
        fontSize: '0.6875rem',
        fontWeight: 700,
        letterSpacing: '0.02em',
      }}
    >
      {tone === 'live' && (
        <Box component="span" aria-hidden sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'success.main' }} />
      )}
      {children}
    </Box>
  )
}

// One segment per week of the challenge, which says "2 of 4 weeks" at a glance.
function WeekPips({ filled, total, color }: { filled: number; total: number; color: string }) {
  return (
    <Box aria-hidden sx={{ display: 'flex', gap: '3px', width: '100%', maxWidth: 88 }}>
      {Array.from({ length: total }, (_, i) => (
        <Box
          key={i}
          sx={{ flex: 1, height: 4, borderRadius: '2px', bgcolor: i < filled ? color : 'surface2.main' }}
        />
      ))}
    </Box>
  )
}

function Player({
  name,
  avatarUrl,
  score,
  weeks,
  barColor,
  emphasized,
}: {
  name: string
  avatarUrl?: string | null
  // Absent until the challenge has started, when there's nothing to score.
  score?: number
  weeks: number
  barColor: string
  emphasized: boolean
}) {
  return (
    <Box sx={{ minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
      <Avatar src={avatarUrl} name={name} size={44} />
      <Typography
        noWrap
        variant="caption"
        color={emphasized ? 'text.primary' : 'text.secondary'}
        sx={{ maxWidth: '100%', fontWeight: emphasized ? 700 : 500 }}
      >
        {name}
      </Typography>
      {score !== undefined && (
        <>
          <Typography
            component="p"
            aria-label={`${name}: ${score} of ${weeks} weeks`}
            sx={{ fontSize: '1.5rem', fontWeight: 800, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}
          >
            {score}
            <Typography component="span" color="text.secondary" sx={{ fontSize: '0.8125rem', fontWeight: 500 }}>
              /{weeks}
            </Typography>
          </Typography>
          <WeekPips filled={score} total={weeks} color={barColor} />
        </>
      )}
    </Box>
  )
}

function Pot({ amount, tone = 'neutral' }: { amount: number; tone?: 'neutral' | 'gold' }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.25 }}>
      <SwoleCoin size={tone === 'gold' ? 30 : 26} title="points" />
      <Typography sx={{ fontWeight: 800, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
        {amount}
      </Typography>
      <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1 }}>
        Pot
      </Typography>
    </Box>
  )
}

const weeksText = (weeks: number) => `${weeks} week${weeks === 1 ? '' : 's'}`

// One card per challenge, showing its CURRENT status: the thread has no
// per-transition event log (see convex/friendThread.ts).
export function ChallengeCard({
  challenge,
  friendName,
  friendAvatarUrl,
}: {
  challenge: ChallengeEntry
  friendName: string
  friendAvatarUrl?: string | null
}) {
  const me = useQuery(api.profiles.getMine)
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

  // Never started, so there's nothing left to show but the fact it happened.
  if (challenge.status === 'declined' || challenge.status === 'cancelled') {
    return (
      <Typography
        variant="caption"
        color="text.secondary"
        component="p"
        sx={{ textAlign: 'center', py: 0.5 }}
      >
        ⚔️ {closedLabel(challenge.status, challenge.isMine, friendName)} ·{' '}
        {challenge.wagerPoints * 2} pot · {weeksText(challenge.weeks)}
      </Typography>
    )
  }

  const pot = challenge.wagerPoints * 2
  const outcome = challengeOutcome(challenge)
  const started = challenge.status !== 'pending'
  const { mine, theirs } = myAndTheirStreak(challenge)
  const yourMove = challenge.status === 'pending' && !challenge.isMine
  const won = outcome === 'won'

  const pill =
    challenge.status === 'pending' ? (
      yourMove ? <StatusPill tone="accent">Your move</StatusPill> : <StatusPill tone="neutral">Waiting</StatusPill>
    ) : challenge.status === 'active' ? (
      <StatusPill tone="live">Live</StatusPill>
    ) : won ? (
      <StatusPill tone="gold">Won</StatusPill>
    ) : outcome === 'lost' ? (
      <StatusPill tone="neutral">Lost</StatusPill>
    ) : (
      <StatusPill tone="neutral">Tied</StatusPill>
    )

  const leaderColor = won ? 'pr.main' : 'primary.main'
  const trailingColor = 'text.secondary'

  const card = (
    <GlassTile
      sx={{
        width: '100%',
        maxWidth: 400,
        mx: 'auto',
        overflow: 'hidden',
        ...(yourMove && { borderColor: 'rgb(var(--color-accent-rgb) / 0.5)' }),
        ...(won && { borderColor: 'rgb(217 164 65 / 0.5)', bgcolor: 'rgb(217 164 65 / 0.06)' }),
      }}
    >
      <Box sx={{ px: 1.5, pt: 1.25, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          ⚔️ Streak challenge
        </Typography>
        {pill}
      </Box>

      <Box
        sx={{
          px: 1.5,
          pt: 1.5,
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
          alignItems: 'start',
          columnGap: 1,
        }}
      >
        <Player
          name="You"
          avatarUrl={me?.avatarUrl}
          score={started ? mine : undefined}
          weeks={challenge.weeks}
          barColor={mine >= theirs ? leaderColor : trailingColor}
          emphasized={started && mine >= theirs}
        />
        <Pot amount={pot} tone={won ? 'gold' : 'neutral'} />
        <Player
          name={friendName}
          avatarUrl={friendAvatarUrl}
          score={started ? theirs : undefined}
          weeks={challenge.weeks}
          barColor={theirs >= mine ? (outcome === 'lost' ? 'primary.main' : leaderColor) : trailingColor}
          emphasized={started && theirs >= mine}
        />
      </Box>

      <Box sx={{ px: 1.5, pt: 1.5, pb: 1.5 }}>
        {challenge.status === 'pending' && (
          <>
            <Typography variant="body2" sx={{ textAlign: 'center', fontWeight: 700 }}>
              {yourMove ? `${friendName} challenged you` : `Waiting for ${friendName} to accept`}
            </Typography>
            <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.25, textAlign: 'center' }}>
              {weeksText(challenge.weeks)}, longer streak takes the pot.{' '}
              {yourMove
                ? `Accepting holds ${challenge.wagerPoints} of your points until it ends.`
                : `Your ${challenge.wagerPoints} points are held, and come back if they decline.`}
            </Typography>
            {yourMove ? (
              <Box sx={{ mt: 1.25, display: 'flex', gap: 1 }}>
                <Button variant="contained" fullWidth disabled={busy} onClick={() => void respond('accept')}>
                  Accept
                </Button>
                <Button
                  variant="outlined"
                  color="inherit"
                  fullWidth
                  disabled={busy}
                  sx={{ borderColor: 'divider', color: 'text.secondary' }}
                  onClick={() => void respond('decline')}
                >
                  Decline
                </Button>
              </Box>
            ) : (
              <Button
                variant="text"
                color="inherit"
                size="small"
                fullWidth
                disabled={busy}
                sx={{ mt: 0.75, color: 'text.secondary' }}
                onClick={() => void respond('cancel')}
              >
                Cancel challenge
              </Button>
            )}
          </>
        )}

        {challenge.status === 'active' && (
          <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1 }}>
            <Typography variant="body2" noWrap sx={{ fontWeight: 600, minWidth: 0 }}>
              {leadLabel(mine, theirs, friendName)}
            </Typography>
            {challenge.endsAt !== undefined && (
              <Typography
                variant="caption"
                color="text.secondary"
                title={`Ends ${formatShortDate(challenge.endsAt)}`}
                sx={{ flexShrink: 0 }}
              >
                {timeLeftLabel(challenge.endsAt, Date.now())}
              </Typography>
            )}
          </Box>
        )}

        {outcome !== null && (
          <>
            <Typography
              variant="body2"
              sx={{ textAlign: 'center', fontWeight: 700, color: won ? 'pr.main' : 'text.primary' }}
            >
              {outcome === 'won'
                ? `You won the ${pot} pot`
                : outcome === 'lost'
                  ? `${friendName} won the ${pot} pot`
                  : 'Tied, so both stakes were returned'}
            </Typography>
            {challenge.resolvedAt !== undefined && (
              <Typography variant="caption" color="text.secondary" component="p" sx={{ textAlign: 'center' }}>
                Finished {formatShortDate(challenge.resolvedAt)}
              </Typography>
            )}
          </>
        )}

        {error && (
          <Typography variant="body2" color="error" sx={{ mt: 0.75, textAlign: 'center' }}>
            {error}
          </Typography>
        )}
      </Box>
    </GlassTile>
  )

  if (!won || prefersReducedMotion) return card

  return (
    <motion.div
      initial={{ scale: 0.96, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 320, damping: 20 }}
    >
      {card}
    </motion.div>
  )
}
