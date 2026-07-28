import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from 'convex/react'
import { Box, Button, Typography } from '@mui/material'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { FriendTrophyCard } from './FriendTrophyCard'
import { useCardExport } from '../share/useCardExport'
import { CHECKERBOARD_SX, type CardVariant } from '../share/cardVariant'
import { SegmentedControl } from '../../components/SegmentedControl'

// A friend's download of someone else's workout — stats only, no photo step
// (the friend wasn't there), so this skips straight to the exportable card.
export function FriendTrophyPage() {
  const { userId, workoutId } = useParams()
  const detail = useQuery(api.friends.getFriendWorkoutDetail, {
    workoutId: workoutId as Id<'workouts'>,
  })

  const { frameRef, busy, share, download } = useCardExport()
  const [variant, setVariant] = useState<CardVariant>('card')

  if (detail === undefined)
    return (
      <Typography sx={{ mt: 4, textAlign: 'center' }} color="text.secondary">
        Loading…
      </Typography>
    )
  if (detail === null)
    return (
      <Box sx={{ mt: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">Can't view this workout.</Typography>
        <Typography component={Link} to={`/friends/${userId}`} color="primary.main" sx={{ textDecoration: 'underline' }}>
          Back
        </Typography>
      </Box>
    )

  return (
    <Box>
      <Typography component={Link} to={`/friends/${userId}/${detail._id}`} variant="body2" color="text.secondary" sx={{ textDecoration: 'none' }}>
        ← Workout
      </Typography>
      <Typography variant="h4" sx={{ mt: 1, fontWeight: 'bold' }}>
        Download Trophy
      </Typography>

      <Box sx={{ mt: 1.5 }}>
        <SegmentedControl
          value={variant}
          onChange={setVariant}
          options={[
            { value: 'card', label: 'Card' },
            { value: 'transparent', label: 'Transparent' },
          ]}
        />
      </Box>

      <Box
        sx={{
          mt: 1.5,
          overflow: 'hidden',
          borderRadius: '12px',
          border: '1px solid',
          borderColor: 'divider',
          ...(variant === 'transparent' ? CHECKERBOARD_SX : null),
        }}
      >
        <FriendTrophyCard ref={frameRef} detail={detail} variant={variant} />
      </Box>

      <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
        <Button variant="contained" fullWidth disabled={busy} onClick={() => void share()}>
          {busy ? 'Rendering…' : 'Share'}
        </Button>
        <Button variant="outlined" color="inherit" fullWidth disabled={busy} onClick={() => void download()}>
          Save Image
        </Button>
      </Box>
    </Box>
  )
}
