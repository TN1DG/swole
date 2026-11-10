import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from 'convex/react'
import { Box, Typography } from '@mui/material'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { FriendTrophyCard } from './FriendTrophyCard'
import { useCardExport } from '../share/useCardExport'
import { CHECKERBOARD_SX, type CardVariant } from '../share/cardVariant'
import { cardFileName, type PickableFormat } from '../share/cardFormat'
import { CardExportButtons, CardOptions } from '../share/CardExportControls'

// A friend's download of someone else's workout — stats only, no photo step
// (the friend wasn't there), so this skips straight to the exportable card.
export function FriendTrophyPage() {
  const { userId, workoutId } = useParams()
  const detail = useQuery(api.friends.getFriendWorkoutDetail, {
    workoutId: workoutId as Id<'workouts'>,
  })

  const [format, setFormat] = useState<PickableFormat>('story')
  const [variant, setVariant] = useState<CardVariant>('card')
  const { frameRef, busy, share, save } = useCardExport(
    cardFileName(detail ? `${detail.owner.displayName} ${detail.name}` : 'workout', format),
  )

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

      <CardOptions format={format} onFormatChange={setFormat} variant={variant} onVariantChange={setVariant} />

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
        <FriendTrophyCard ref={frameRef} detail={detail} variant={variant} format={format} />
      </Box>

      <CardExportButtons busy={busy} onSave={() => void save()} onShare={() => void share()} />
    </Box>
  )
}
