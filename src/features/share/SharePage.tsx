import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from 'convex/react'
import { domToBlob } from 'modern-screenshot'
import { Box, Button, Typography } from '@mui/material'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { ShareCard } from './ShareCard'
import { GlassTile } from '../../components/GlassTile'

const EXPORT_WIDTH = 1080 // Instagram-story sized PNG (1080x1920)

export function SharePage() {
  const { workoutId } = useParams()
  const detail = useQuery(api.history.getDetail, {
    workoutId: workoutId as Id<'workouts'>,
  })

  const frameRef = useRef<HTMLDivElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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

  // Render the preview DOM node to a PNG blob at export resolution.
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

      {/* The exportable preview */}
      <Box sx={{ mt: 2, overflow: 'hidden', borderRadius: '12px', border: '1px solid', borderColor: 'divider' }}>
        <ShareCard ref={frameRef} detail={detail} photoUrl={photoUrl} />
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
