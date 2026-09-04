import { Link } from 'react-router-dom'
import { useMutation } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { Box, Button, Typography } from '@mui/material'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { api } from '../../../convex/_generated/api'
import { formatWorkoutDate } from '../../lib/dates'
import { tokens } from '../../theme/tokens'

const DAY_MS = 24 * 60 * 60 * 1000

type ThreadEntry = FunctionReturnType<typeof api.friendThread.getThread>[number]
export type PingEntry = Extract<ThreadEntry, { type: 'ping' }>['ping']

// A ping used to render as just another chat bubble with static text ("I'm
// heading to the gym!") — indistinguishable from a plain message except for
// its wording. This is deliberately NOT a Bubble: a circular icon badge that
// radiates while waiting (the literal payoff of the feature being called a
// "ping") and settles into a solid color once acknowledged, so it reads as
// its own kind of thing in the thread rather than more chat text.
export function PingBubble({ ping }: { ping: PingEntry }) {
  const acknowledge = useMutation(api.pings.acknowledge)
  const prefersReducedMotion = useReducedMotion()
  const expired = Date.now() - ping.sentAt > DAY_MS
  const acknowledged = ping.acknowledgedAt !== null
  const waiting = !acknowledged && !expired

  const badgeColor = acknowledged ? tokens.success : expired ? tokens.muted : tokens.accent

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={
        prefersReducedMotion
          ? { duration: 0.15 }
          : { type: 'spring', stiffness: 380, damping: 26 }
      }
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        maxWidth: '80%',
        alignSelf: ping.isMine ? 'flex-end' : 'flex-start',
        alignItems: ping.isMine ? 'flex-end' : 'flex-start',
        opacity: expired ? 0.5 : 1,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          borderRadius: '999px',
          pl: 0.5,
          pr: 2,
          py: 0.5,
          bgcolor: tokens.surface2Glass,
          border: '1px solid',
          borderColor: 'rgb(69 61 53 / 0.3)',
        }}
      >
        <Box
          sx={{
            position: 'relative',
            width: 40,
            height: 40,
            flexShrink: 0,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.1rem',
            bgcolor: 'rgb(0 0 0 / 0.15)',
          }}
        >
          {!prefersReducedMotion && waiting && (
            <motion.span
              aria-hidden
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                border: `2px solid ${tokens.accent}`,
              }}
              animate={{ scale: [1, 1.8], opacity: [0.5, 0] }}
              transition={{ repeat: Infinity, duration: 1.6, ease: 'easeOut' }}
            />
          )}
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              border: '2px solid',
              borderColor: badgeColor,
              transition: 'border-color 0.3s ease',
            }}
          />
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={acknowledged ? 'ack' : 'wait'}
              initial={prefersReducedMotion ? { opacity: 0 } : { scale: 0.4, opacity: 0 }}
              animate={prefersReducedMotion ? { opacity: 1 } : { scale: 1, opacity: 1 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { scale: 0.4, opacity: 0 }}
              transition={{ duration: prefersReducedMotion ? 0.15 : 0.25 }}
            >
              {acknowledged ? '✅' : '🏋️'}
            </motion.span>
          </AnimatePresence>
        </Box>

        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {ping.isMine ? 'Gym ping sent' : 'Gym ping'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {formatWorkoutDate(ping.sentAt)}
          </Typography>
        </Box>
      </Box>

      {ping.isMine ? (
        <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
          {acknowledged ? 'Held accountable ✓' : 'Waiting…'}
        </Typography>
      ) : waiting ? (
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
          sx={{ px: 1, textDecoration: 'underline' }}
        >
          See workout → {ping.linkedWorkout.name}
        </Typography>
      )}

      {ping.isMine && !ping.linkedWorkout && !expired && (
        <Typography component={Link} to="/" variant="caption" color="primary.main" sx={{ px: 1, textDecoration: 'underline' }}>
          Log workout →
        </Typography>
      )}
    </motion.div>
  )
}
