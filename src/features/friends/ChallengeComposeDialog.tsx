import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { Box, Button, ButtonBase, IconButton, Typography } from '@mui/material'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { BottomSheet } from '../../components/BottomSheet'
import { SwoleCoin } from '../../components/SwoleCoin'
import { errorMessage } from '../../lib/errors'
import { LIMITS } from '../../../convex/validation'
import { stepWager, wagerPresets } from './challengeDisplay'

const WEEK_OPTIONS = Array.from(
  { length: LIMITS.challengeMaxWeeks - LIMITS.challengeMinWeeks + 1 },
  (_, i) => LIMITS.challengeMinWeeks + i,
)

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography variant="overline" color="text.secondary" component="p" sx={{ mt: 2.5, mb: 0.75 }}>
      {children}
    </Typography>
  )
}

function Choice({
  selected,
  label,
  onClick,
  children,
}: {
  selected: boolean
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <ButtonBase
      aria-label={label}
      aria-pressed={selected}
      onClick={onClick}
      sx={{
        flex: 1,
        minWidth: 0,
        height: 44,
        fontSize: '0.9375rem',
        fontWeight: 700,
        borderRadius: '10px',
        border: '1px solid',
        borderColor: selected ? 'primary.main' : 'divider',
        bgcolor: selected ? 'primary.main' : 'surface2.main',
        color: selected ? 'primary.contrastText' : 'text.primary',
      }}
    >
      {children}
    </ButtonBase>
  )
}

// A sheet of tap targets rather than sliders: on a phone a slider makes it hard to
// land on an exact number, and these are exact-number decisions about real points.
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
  const balance = profile?.pointsBalance

  return (
    <BottomSheet open onClose={onClose}>
      <Box sx={{ px: 2.5, pt: 2.5, overflowY: 'auto' }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>
          ⚔️ Challenge {friendName}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
          Whoever keeps the longer weekly streak takes the pot.
        </Typography>

        {balance === undefined ? (
          <Typography color="text.secondary" sx={{ my: 4, textAlign: 'center' }}>
            Loading…
          </Typography>
        ) : balance < 1 ? (
          <Box sx={{ my: 3, textAlign: 'center' }}>
            <SwoleCoin size={40} title="points" />
            <Typography sx={{ mt: 1, fontWeight: 700 }}>You need points to wager</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              Finish a workout to earn some, then come back and challenge {friendName}.
            </Typography>
            <Button variant="outlined" color="inherit" fullWidth sx={{ mt: 2 }} onClick={onClose}>
              Got it
            </Button>
          </Box>
        ) : (
          <ComposeForm
            balance={balance}
            onClose={onClose}
            onSubmit={(weeks, wagerPoints) => propose({ opponentId: friendId, weeks, wagerPoints })}
          />
        )}
      </Box>
    </BottomSheet>
  )
}

// Mounted only once the balance is known, so the starting wager is a real one.
function ComposeForm({
  balance,
  onClose,
  onSubmit,
}: {
  balance: number
  onClose: () => void
  onSubmit: (weeks: number, wager: number) => Promise<unknown>
}) {
  const maxWager = Math.min(LIMITS.maxWagerPoints, balance)
  const [weeks, setWeeks] = useState(2)
  const [wager, setWager] = useState(Math.min(25, maxWager))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit() {
    setError(null)
    setBusy(true)
    try {
      await onSubmit(weeks, wager)
      onClose()
    } catch (err) {
      setError(errorMessage(err, 'Could not send that challenge.'))
      setBusy(false)
    }
  }

  return (
    <>
      <SectionLabel>How many weeks</SectionLabel>
      <Box role="group" aria-label="How many weeks" sx={{ display: 'flex', gap: 0.5 }}>
        {WEEK_OPTIONS.map((option) => (
          <Choice
            key={option}
            selected={option === weeks}
            label={`${option} week${option === 1 ? '' : 's'}`}
            onClick={() => setWeeks(option)}
          >
            {option}
          </Choice>
        ))}
      </Box>

      <SectionLabel>Your stake</SectionLabel>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
        <IconButton
          aria-label="Lower stake"
          disabled={wager <= 1}
          onClick={() => setWager(stepWager(wager, -1, maxWager))}
          sx={{ width: 44, height: 44, fontSize: '1.375rem', border: '1px solid', borderColor: 'divider' }}
        >
          −
        </IconButton>
        <Box
          sx={{ minWidth: 112, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75 }}
          aria-live="polite"
        >
          <SwoleCoin size={26} title="points" />
          <Typography sx={{ fontSize: '2rem', fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {wager}
          </Typography>
        </Box>
        <IconButton
          aria-label="Raise stake"
          disabled={wager >= maxWager}
          onClick={() => setWager(stepWager(wager, 1, maxWager))}
          sx={{ width: 44, height: 44, fontSize: '1.375rem', border: '1px solid', borderColor: 'divider' }}
        >
          +
        </IconButton>
      </Box>
      <Box role="group" aria-label="Quick stakes" sx={{ mt: 1.25, display: 'flex', gap: 0.5 }}>
        {wagerPresets(maxWager).map((amount) => (
          <Choice key={amount} selected={amount === wager} label={`Stake ${amount}`} onClick={() => setWager(amount)}>
            {amount}
          </Choice>
        ))}
        <Choice selected={wager === maxWager} label={`Stake the maximum, ${maxWager}`} onClick={() => setWager(maxWager)}>
          Max
        </Choice>
      </Box>
      <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.75, textAlign: 'center' }}>
        You have {balance} points
      </Typography>

      <Box
        sx={{
          mt: 2,
          px: 1.5,
          py: 1,
          borderRadius: '12px',
          bgcolor: 'rgb(var(--color-accent-rgb) / 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
        }}
      >
        <Typography variant="body2" color="text.secondary">
          Winner takes
        </Typography>
        <Typography sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
          <SwoleCoin size={18} title="points" /> {wager * 2}
        </Typography>
      </Box>
      <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.75, textAlign: 'center' }}>
        Your stake is held until it ends. A tie or a decline returns it.
      </Typography>

      {error && (
        <Typography variant="body2" color="error" sx={{ mt: 1, textAlign: 'center' }}>
          {error}
        </Typography>
      )}

      <Button
        variant="contained"
        fullWidth
        size="large"
        disabled={busy}
        sx={{ mt: 2 }}
        onClick={() => void handleSubmit()}
      >
        {busy ? 'Sending…' : 'Send challenge'}
      </Button>
      <Button variant="text" color="inherit" fullWidth disabled={busy} sx={{ mt: 0.5, color: 'text.secondary' }} onClick={onClose}>
        Cancel
      </Button>
    </>
  )
}
