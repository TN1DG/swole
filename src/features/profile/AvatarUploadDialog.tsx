import { useCallback, useState } from 'react'
import Cropper from 'react-easy-crop'
import { useMutation } from 'convex/react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Slider, Typography } from '@mui/material'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { cropToSquareBlob, type CropArea } from '../../lib/cropImage'
import { errorMessage } from '../../lib/errors'

export function AvatarUploadDialog({
  imageSrc,
  onClose,
}: {
  imageSrc: string
  onClose: () => void
}) {
  const generateUploadUrl = useMutation(api.profiles.generateAvatarUploadUrl)
  const setAvatar = useMutation(api.profiles.setAvatar)

  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [area, setArea] = useState<CropArea | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onCropComplete = useCallback((_: unknown, areaPixels: CropArea) => {
    setArea(areaPixels)
  }, [])

  async function handleSave() {
    if (!area) return
    setError(null)
    setSaving(true)
    try {
      const blob = await cropToSquareBlob(imageSrc, area)
      const uploadUrl = await generateUploadUrl({})
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': blob.type },
        body: blob,
      })
      if (!response.ok) throw new Error('Upload failed — check your connection')
      const { storageId } = (await response.json()) as { storageId: Id<'_storage'> }
      // Rejections come back as a result rather than a thrown error so the
      // server can clean up the bad blob — see profiles.ts:setAvatar.
      const result = await setAvatar({ storageId })
      if (!result.ok) throw new Error(result.error)
      onClose()
    } catch (err) {
      setError(errorMessage(err, 'Could not save that photo.'))
      setSaving(false)
    }
  }

  return (
    <Dialog open onClose={saving ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ fontWeight: 700 }}>Crop your photo</DialogTitle>
      <DialogContent>
        <Box sx={{ position: 'relative', width: '100%', height: 280, bgcolor: '#000', borderRadius: '12px', overflow: 'hidden' }}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
          Drag to reposition · pinch or use the slider to zoom
        </Typography>
        <Slider
          value={zoom}
          min={1}
          max={3}
          step={0.01}
          onChange={(_, value) => setZoom(value as number)}
          aria-label="Zoom"
        />
        {error && (
          <Typography variant="body2" color="error">
            {error}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button color="inherit" disabled={saving} onClick={onClose}>
          Cancel
        </Button>
        <Button variant="contained" disabled={saving || !area} onClick={() => void handleSave()}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
