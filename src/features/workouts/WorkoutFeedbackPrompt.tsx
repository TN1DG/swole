import { useState } from 'react'
import { useMutation } from 'convex/react'
import { Box, Button, Chip, TextField, Typography } from '@mui/material'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { REASON_OPTIONS } from '../../../convex/workoutFeedback'
import { errorMessage } from '../../lib/errors'
import { GlassCard } from '../../components/GlassCard'

type Props = {
  workoutId: Id<'workouts'>
}

export function WorkoutFeedbackPrompt({ workoutId }: Props) {
  const submit = useMutation(api.workoutFeedback.submit)

  const [reasons, setReasons] = useState<Set<string>>(new Set())
  const [note, setNote] = useState('')
  const [sent, setSent] = useState(false)
  const [skipped, setSkipped] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (skipped) return null

  if (sent) {
    return (
      <GlassCard sx={{ mt: 2, textAlign: 'center' }}>
        <Typography color="success.main">Thanks — that helps!</Typography>
      </GlassCard>
    )
  }

  function toggleReason(reason: string) {
    setReasons((prev) => {
      const next = new Set(prev)
      if (next.has(reason)) next.delete(reason)
      else next.add(reason)
      return next
    })
  }

  async function handleSubmit() {
    setError(null)
    try {
      await submit({ workoutId, reasons: [...reasons], note: note.trim() || undefined })
      setSent(true)
    } catch (err) {
      setError(errorMessage(err, 'Could not send.'))
    }
  }

  return (
    <GlassCard sx={{ mt: 2 }}>
      <Typography sx={{ fontWeight: 600 }}>What would have helped you work out better?</Typography>
      <Box sx={{ mt: 1.5, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {REASON_OPTIONS.map((reason) => (
          <Chip
            key={reason}
            label={reason}
            clickable
            onClick={() => toggleReason(reason)}
            color={reasons.has(reason) ? 'primary' : undefined}
            sx={reasons.has(reason) ? undefined : { bgcolor: 'surface2.main', color: 'text.secondary' }}
          />
        ))}
      </Box>
      <TextField
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Something else…"
        fullWidth
        sx={{ mt: 1.5 }}
      />
      {error && (
        <Typography variant="body2" color="error" sx={{ mt: 1 }}>
          {error}
        </Typography>
      )}
      <Box sx={{ mt: 1.5, display: 'flex', gap: 1 }}>
        <Button
          variant="contained"
          fullWidth
          disabled={reasons.size === 0 && !note.trim()}
          onClick={() => void handleSubmit()}
        >
          Submit
        </Button>
        <Button variant="outlined" color="inherit" fullWidth onClick={() => setSkipped(true)}>
          Skip
        </Button>
      </Box>
    </GlassCard>
  )
}
