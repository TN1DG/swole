import { useState } from 'react'
import { useMutation } from 'convex/react'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from '@mui/material'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { errorMessage } from '../../lib/errors'
import { SwoleCoin } from '../../components/SwoleCoin'

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
  const [weeks, setWeeks] = useState('2')
  const [wager, setWager] = useState('20')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await propose({
        opponentId: friendId,
        weeks: parseInt(weeks, 10),
        wagerPoints: parseInt(wager, 10),
      })
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
          <Box sx={{ mt: 2, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.5 }}>
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
                slotProps={{ htmlInput: { inputMode: 'numeric', 'aria-label': 'Weeks' } }}
              />
            </Box>
            <Box>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
              >
                Wager <SwoleCoin size={14} title="points" />
              </Typography>
              <TextField
                value={wager}
                onChange={(e) => setWager(e.target.value)}
                size="small"
                fullWidth
                sx={{ mt: 0.5 }}
                slotProps={{ htmlInput: { inputMode: 'numeric', 'aria-label': 'Wager points' } }}
              />
            </Box>
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
