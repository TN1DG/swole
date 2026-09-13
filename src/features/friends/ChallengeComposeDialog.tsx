import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Slider,
  Typography,
} from '@mui/material'
import { AnimatePresence, motion } from 'framer-motion'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { errorMessage } from '../../lib/errors'
import { SwoleCoin } from '../../components/SwoleCoin'
import { LIMITS } from '../../../convex/validation'

// The propose form, lifted out of what used to be a card pinned above the
// ping thread (see FriendChatPage). It's a dialog now so the thread itself
// stays a single chronological conversation.
export function ChallengeComposeDialog({
  friendId,
  friendName,
  onClose,
}: {
  friendId: Id<'users'>
  friendName: string
  onClose: () => void
}) {
  const propose = useMutation(api.challenges.propose)
  const profile = useQuery(api.profiles.getMine)
  const myBalance = profile?.pointsBalance ?? LIMITS.maxWagerPoints
  const maxWager = Math.max(1, Math.min(LIMITS.maxWagerPoints, myBalance))

  const [weeks, setWeeks] = useState(2)
  const [wager, setWager] = useState(Math.min(20, maxWager))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await propose({ opponentId: friendId, weeks, wagerPoints: wager })
      onClose()
    } catch (err) {
      setError(errorMessage(err, 'Could not propose.'))
      setBusy(false)
    }
  }

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ fontWeight: 700 }}>Challenge {friendName} ⚔️</DialogTitle>
      <Box component="form" onSubmit={handleSubmit}>
        <DialogContent sx={{ pt: 0 }}>
          <Typography variant="body2" color="text.secondary">
            Whoever keeps the longer streak wins the pot. Your wager is held
            until the challenge resolves.
          </Typography>

          <Box sx={{ mt: 3 }}>
            <Typography variant="caption" color="text.secondary">
              Weeks
            </Typography>
            <Box sx={{ px: 1 }}>
              <Slider
                value={weeks}
                onChange={(_, v) => setWeeks(v as number)}
                min={LIMITS.challengeMinWeeks}
                max={LIMITS.challengeMaxWeeks}
                step={1}
                marks
                valueLabelDisplay="auto"
                aria-label="Weeks"
              />
            </Box>
          </Box>

          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              Wager <SwoleCoin size={14} title="points" />
            </Typography>
            <Box sx={{ px: 1 }}>
              <Slider
                value={wager}
                onChange={(_, v) => setWager(v as number)}
                min={1}
                max={maxWager}
                step={Math.max(1, Math.round(maxWager / 50))}
                valueLabelDisplay="auto"
                aria-label="Wager points"
              />
            </Box>
            <Typography variant="caption" color="text.secondary">
              You have {myBalance} <SwoleCoin size={12} title="points" />
            </Typography>
          </Box>

          <Box
            sx={{
              mt: 2,
              p: 1.5,
              borderRadius: 1,
              bgcolor: 'rgb(193 84 31 / 0.08)',
              border: '1px solid rgb(193 84 31 / 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1,
            }}
          >
            <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              You wager <PopNumber value={wager} /> <SwoleCoin size={14} title="points" />
            </Typography>
            <Typography variant="body2" color="primary.main" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              Winner takes <PopNumber value={wager * 2} /> <SwoleCoin size={14} title="points" />
            </Typography>
          </Box>

          {error && (
            <Typography variant="body2" color="error" sx={{ mt: 1.5 }}>
              {error}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button color="inherit" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={busy}>
            {busy ? 'Sending…' : 'Propose'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  )
}

// A small pop whenever the number changes, so dragging the sliders feels
// tactile rather than the pot summary just silently re-rendering.
function PopNumber({ value }: { value: number }) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={value}
        initial={{ y: -6, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.15 }}
        style={{ display: 'inline-block', fontWeight: 700 }}
      >
        {value}
      </motion.span>
    </AnimatePresence>
  )
}
