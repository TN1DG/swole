import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from 'convex/react'
import { Box, Button, Typography } from '@mui/material'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { ShareCard } from './ShareCard'
import { useCardExport } from './useCardExport'
import { CHECKERBOARD_SX, type CardVariant } from './cardVariant'
import { GlassTile } from '../../components/GlassTile'
import { SegmentedControl } from '../../components/SegmentedControl'

export function SharePage() {
  const { workoutId } = useParams()
  const detail = useQuery(api.history.getDetail, {
    workoutId: workoutId as Id<'workouts'>,
  })

  const { frameRef, busy, share, download } = useCardExport()
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [variant, setVariant] = useState<CardVariant>('card')

  // Release the previous photo's memory when replaced / on unmount.
  useEffect(() => {
    return () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl)
    }
  }, [photoUrl])

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoUrl(URL.createObjectURL(file))
    e.target.value = '' // allow re-picking the same file
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
        <Typography color="text.secondary">Workout not found.</Typography>
        <Typography component={Link} to="/history" color="primary.main" sx={{ textDecoration: 'underline' }}>
          Back to history
        </Typography>
      </Box>
    )

  return (
    <Box>
      <Typography component={Link} to={`/history/${detail._id}`} variant="body2" color="text.secondary" sx={{ textDecoration: 'none' }}>
        ← Workout
      </Typography>
      <Typography variant="h4" sx={{ mt: 1, fontWeight: 'bold' }}>
        Share Workout
      </Typography>

      {/* Hidden inputs: camera vs. gallery */}
      <Box
        component="input"
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        sx={{ display: 'none' }}
      />
      <Box component="input" ref={galleryInputRef} type="file" accept="image/*" onChange={handleFile} sx={{ display: 'none' }} />

      <Box sx={{ mt: 1.5, display: 'flex', gap: 1 }}>
        <GlassTile
          component="button"
          onClick={() => cameraInputRef.current?.click()}
          sx={{ flex: 1, py: 1.5, fontSize: '0.875rem', fontWeight: 600, border: 'none', cursor: 'pointer', font: 'inherit', color: 'text.primary' }}
        >
          📷 Take Photo
        </GlassTile>
        <GlassTile
          component="button"
          onClick={() => galleryInputRef.current?.click()}
          sx={{ flex: 1, py: 1.5, fontSize: '0.875rem', fontWeight: 600, border: 'none', cursor: 'pointer', font: 'inherit', color: 'text.primary' }}
        >
          🖼 Choose Photo
        </GlassTile>
      </Box>

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
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
        {variant === 'card'
          ? 'A solid card, ready to post as-is.'
          : 'No background — drop it straight onto another photo.'}
      </Typography>

      {/* The exportable preview. The checkerboard is on this wrapper, which
          sits OUTSIDE frameRef and so never reaches the PNG — without it a
          transparent card looks identical to a solid one against the app's
          own dark page. */}
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
        <ShareCard ref={frameRef} detail={detail} photoUrl={photoUrl} variant={variant} />
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
