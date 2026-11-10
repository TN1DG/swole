import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery } from 'convex/react'
import { ConvexError } from 'convex/values'
import { Box, Button, TextField, Typography } from '@mui/material'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { errorMessage } from '../../lib/errors'
import { optimizeImage, type OptimizedImage } from '../../lib/optimizeImage'
import { uploadBlob } from '../../lib/uploadBlob'
import { GlassTile } from '../../components/GlassTile'
import { StoredImage } from '../../components/StoredImage'
import { SegmentedControl } from '../../components/SegmentedControl'
import { LIMITS } from '../../../convex/validation'
import { ShareCard } from '../share/ShareCard'
import { cardToPng } from '../share/useCardExport'

/** Link previews (X, iMessage, WhatsApp…) use 1200×630 pictures. */
const LINK_CARD_WIDTH = 1200
/**
 * The width the card is laid out at before being scaled up to 1200. The
 * card's type is sized for a phone-width share card, so narrower means
 * bigger text in the preview: at 600 it filled half the height and read as
 * tiny. 440 gives a 231px-tall frame, which fits the panel with its two
 * exercise lines and "+ N more" (about 210px).
 */
const LINK_CARD_LAYOUT_WIDTH = 440

type Visibility = 'public' | 'friends'

export function ComposePostPage() {
  const { workoutId } = useParams()
  const navigate = useNavigate()
  const detail = useQuery(api.history.getDetail, { workoutId: workoutId as Id<'workouts'> })

  const generateUploadUrl = useMutation(api.feed.generatePostPhotoUploadUrl)
  const createPost = useMutation(api.feed.createPost)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const linkCardRef = useRef<HTMLDivElement>(null)
  const [photo, setPhoto] = useState<(OptimizedImage & { url: string }) | null>(null)
  const [processing, setProcessing] = useState(false)
  // Friends-only is the default on purpose — the safer of the two, and the
  // one that matches how the rest of the app already behaves.
  const [visibility, setVisibility] = useState<Visibility>('friends')
  const [caption, setCaption] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Optimized as soon as it's picked rather than at post time: the preview then
  // shows exactly what will be published, an unreadable format fails right away
  // instead of after writing the caption, and Post only has the upload to wait on.
  async function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    setError(null)
    setProcessing(true)
    try {
      const optimized = await optimizeImage(file, 'post')
      if (photo) URL.revokeObjectURL(photo.url)
      setPhoto({ ...optimized, url: URL.createObjectURL(optimized.blob) })
    } catch (err) {
      setError(errorMessage(err, 'Could not read that photo.'))
    } finally {
      setProcessing(false)
    }
  }

  /**
   * The picture a link to a public, photo-less post previews with: the
   * workout card, rendered here because the app already draws it. Best
   * effort: if it fails, the post still goes out and previews generically.
   */
  async function uploadLinkCard(): Promise<Id<'_storage'> | undefined> {
    const node = linkCardRef.current
    if (photo || visibility !== 'public' || !node) return undefined
    try {
      return await uploadBlob(() => generateUploadUrl({}), await cardToPng(node, LINK_CARD_WIDTH))
    } catch (err) {
      console.error('Link card failed', err)
      return undefined
    }
  }

  async function handlePost() {
    if (!workoutId) return
    setBusy(true)
    setError(null)
    try {
      const storageId = photo ? await uploadBlob(() => generateUploadUrl({}), photo.blob) : undefined
      const cardStorageId = await uploadLinkCard()

      // Blob rejections come back as a result rather than a thrown error, so
      // the server can delete the bad upload — see convex/feed.ts:createPost.
      const result = await createPost({
        workoutId: workoutId as Id<'workouts'>,
        visibility,
        ...(caption.trim() && { caption }),
        ...(photo && storageId && {
          storageId,
          photoWidth: photo.width,
          photoHeight: photo.height,
        }),
        ...(cardStorageId && { cardStorageId }),
      })
      if (!result.ok) throw new ConvexError(result.error)
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
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => void pickFile(e)}
        sx={{ display: 'none' }}
      />
      <Button
        fullWidth
        variant="outlined"
        color="inherit"
        sx={{ mt: 1.5 }}
        disabled={processing}
        onClick={() => fileInputRef.current?.click()}
      >
        {processing ? 'Preparing photo…' : photo ? 'Change photo' : '🖼 Add a photo'}
      </Button>

      {photo && (
        <StoredImage src={photo.url} width={photo.width} height={photo.height} sx={{ mt: 1.5 }} />
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
        disabled={busy || processing}
        onClick={() => void handlePost()}
      >
        {busy ? 'Posting…' : 'Post'}
      </Button>

      {/* The link-preview card, laid out off-screen so it can be captured
          (see uploadLinkCard). Never seen, so hidden from assistive tech. */}
      {!photo && visibility === 'public' && (
        <Box aria-hidden sx={{ position: 'fixed', left: -10_000, top: 0, width: LINK_CARD_LAYOUT_WIDTH, pointerEvents: 'none' }}>
          <ShareCard ref={linkCardRef} detail={detail} photoUrl={null} format="link" />
        </Box>
      )}
    </Box>
  )
}
