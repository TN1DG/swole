import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from 'convex/react'
import { domToBlob } from 'modern-screenshot'
import { Box, Button, Typography } from '@mui/material'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { FriendTrophyCard } from './FriendTrophyCard'

const EXPORT_WIDTH = 1080

// A friend's download of someone else's workout — stats only, no photo step
// (the friend wasn't there), so this skips straight to the exportable card.
export function FriendTrophyPage() {
  const { userId, workoutId } = useParams()
  const detail = useQuery(api.friends.getFriendWorkoutDetail, {
    workoutId: workoutId as Id<'workouts'>,
  })

  const frameRef = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)

  async function makePng(): Promise<Blob | null> {
    const node = frameRef.current
    if (!node) return null
    return domToBlob(node, {
      scale: EXPORT_WIDTH / node.clientWidth,
      type: 'image/png',
    })
  }

  async function handleShare() {
    setBusy(true)
    try {
      const blob = await makePng()
      if (!blob) return
      const file = new File([blob], 'workout.png', { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] })
      } else {
        downloadBlob(blob) // desktop browsers: just save it
      }
    } catch {
      // user closed the share sheet — not an error
    } finally {
      setBusy(false)
    }
  }

  async function handleDownload() {
    setBusy(true)
    try {
      const blob = await makePng()
      if (blob) downloadBlob(blob)
    } finally {
      setBusy(false)
    }
  }

  function downloadBlob(blob: Blob) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'workout.png'
    a.click()
    URL.revokeObjectURL(url)
  }

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

      <Box sx={{ mt: 2, overflow: 'hidden', borderRadius: '12px', border: '1px solid', borderColor: 'divider' }}>
        <FriendTrophyCard ref={frameRef} detail={detail} />
      </Box>

      <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
        <Button variant="contained" fullWidth disabled={busy} onClick={handleShare}>
          {busy ? 'Rendering…' : 'Share'}
        </Button>
        <Button variant="outlined" color="inherit" fullWidth disabled={busy} onClick={handleDownload}>
          Save Image
        </Button>
      </Box>
    </Box>
  )
}
