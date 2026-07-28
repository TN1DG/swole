import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery } from 'convex/react'
import { Box, Button, TextField, Typography } from '@mui/material'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { errorMessage } from '../../lib/errors'
import { GlassTile } from '../../components/GlassTile'
import { SegmentedControl } from '../../components/SegmentedControl'
import { LIMITS } from '../../../convex/validation'

type Visibility = 'public' | 'friends'

export function ComposePostPage() {
  const { workoutId } = useParams()
  const navigate = useNavigate()
  const detail = useQuery(api.history.getDetail, { workoutId: workoutId as Id<'workouts'> })

  const generateUploadUrl = useMutation(api.feed.generatePostPhotoUploadUrl)
  const createPost = useMutation(api.feed.createPost)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null)
  // Friends-only is the default on purpose — the safer of the two, and the
  // one that matches how the rest of the app already behaves.
  const [visibility, setVisibility] = useState<Visibility>('friends')
  const [caption, setCaption] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    if (photo) URL.revokeObjectURL(photo.url)
    setPhoto({ file, url: URL.createObjectURL(file) })
  }

  async function handlePost() {
    if (!workoutId) return
    setBusy(true)
    setError(null)
    try {
      let storageId: Id<'_storage'> | undefined
      if (photo) {
        const uploadUrl = await generateUploadUrl({})
        const response = await fetch(uploadUrl, {
          method: 'POST',
          headers: { 'Content-Type': photo.file.type },
          body: photo.file,
        })
        if (!response.ok) throw new Error('Upload failed — check your connection')
        storageId = ((await response.json()) as { storageId: Id<'_storage'> }).storageId
      }

      // Blob rejections come back as a result rather than a thrown error, so
      // the server can delete the bad upload — see convex/feed.ts:createPost.
      const result = await createPost({
        workoutId: workoutId as Id<'workouts'>,
        visibility,
        ...(caption.trim() && { caption }),
        ...(storageId && { storageId }),
      })
      if (!result.ok) throw new Error(result.error)
      navigate('/friends')
    } catch (err) {
      setError(errorMessage(err, 'Could not post that.'))
      setBusy(false)
    }
  }

  if (detail === undefined) {
    return (
      <Typography sx={{ mt: 4, textAlign: 'center' }} color="text.secondary">
        Loading…
      </Typography>
    )
  }
  if (detail === null) {
    return (
      <Box sx={{ mt: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">Workout not found.</Typography>
        <Typography component={Link} to="/history" color="primary.main" sx={{ textDecoration: 'underline' }}>
          Back to history
        </Typography>
      </Box>
    )
  }

  return (
    <Box>
      <Typography
        component={Link}
        to={`/history/${detail._id}`}
        variant="body2"
        color="text.secondary"
        sx={{ textDecoration: 'none' }}
      >
        ← Workout
      </Typography>
      <Typography variant="h4" sx={{ mt: 1, fontWeight: 'bold' }}>
        Share to Feed
      </Typography>

      <GlassTile sx={{ mt: 2, p: 1.5 }}>
        <Typography sx={{ fontWeight: 600 }}>{detail.name}</Typography>
        <Typography variant="body2" color="text.secondary">
          {detail.exercises.length} exercise{detail.exercises.length === 1 ? '' : 's'}
        </Typography>
      </GlassTile>

      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
        Who can see this
      </Typography>
      <Box sx={{ mt: 0.5 }}>
        <SegmentedControl
          value={visibility}
          onChange={setVisibility}
          options={[
            { value: 'friends', label: 'Friends' },
            { value: 'public', label: 'Everyone' },
          ]}
        />
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
        {visibility === 'friends'
          ? 'Only people you have accepted as friends.'
          : 'Anyone using Swole, including people you have not added. Your name and photo are shown, and it can be reposted.'}
      </Typography>

      <TextField
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        placeholder="Say something about it…"
        multiline
        rows={3}
        fullWidth
        sx={{ mt: 2 }}
        slotProps={{ htmlInput: { maxLength: LIMITS.postCaptionMaxLength } }}
      />

      <Box
        component="input"
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={pickFile}
        sx={{ display: 'none' }}
      />
      <Button
        fullWidth
        variant="outlined"
        color="inherit"
        sx={{ mt: 1.5 }}
        onClick={() => fileInputRef.current?.click()}
      >
        {photo ? 'Change photo' : '🖼 Add a photo'}
      </Button>

      {photo && (
        <Box
          component="img"
          src={photo.url}
          alt=""
          sx={{ mt: 1.5, width: '100%', borderRadius: '12px', display: 'block' }}
        />
      )}

      {error && (
        <Typography variant="body2" color="error" sx={{ mt: 1.5 }}>
          {error}
        </Typography>
      )}

      <Button
        fullWidth
        variant="contained"
        sx={{ mt: 2 }}
        disabled={busy}
        onClick={() => void handlePost()}
      >
        {busy ? 'Posting…' : 'Post'}
      </Button>
    </Box>
  )
}
