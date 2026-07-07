import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from 'convex/react'
import { domToBlob } from 'modern-screenshot'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { ShareCard } from './ShareCard'

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
    return <p className="mt-8 text-center text-muted">Loading…</p>
  if (detail === null)
    return (
      <div className="mt-8 text-center text-muted">
        <p>Workout not found.</p>
        <Link to="/history" className="text-accent underline">
          Back to history
        </Link>
      </div>
    )

  return (
    <div>
      <Link to={`/history/${detail._id}`} className="text-sm text-muted">
        ← Workout
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Share Workout</h1>

      {/* Hidden inputs: camera vs. gallery */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        className="hidden"
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        className="hidden"
      />

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          className="flex-1 rounded-xl border border-border bg-surface py-2.5 text-sm font-semibold"
        >
          📷 Take Photo
        </button>
        <button
          type="button"
          onClick={() => galleryInputRef.current?.click()}
          className="flex-1 rounded-xl border border-border bg-surface py-2.5 text-sm font-semibold"
        >
          🖼 Choose Photo
        </button>
      </div>

      {/* The exportable preview */}
      <div className="mt-4 overflow-hidden rounded-xl border border-border">
        <ShareCard ref={frameRef} detail={detail} photoUrl={photoUrl} />
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={handleShare}
          disabled={busy}
          className="flex-1 rounded-xl bg-accent py-3 font-semibold text-accent-fg disabled:opacity-50"
        >
          {busy ? 'Rendering…' : 'Share'}
        </button>
        <button
          type="button"
          onClick={handleDownload}
          disabled={busy}
          className="flex-1 rounded-xl border border-border py-3 font-semibold disabled:opacity-50"
        >
          Save Image
        </button>
      </div>
    </div>
  )
}
