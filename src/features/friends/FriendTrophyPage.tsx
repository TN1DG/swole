import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from 'convex/react'
import { domToBlob } from 'modern-screenshot'
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
    return <p className="mt-8 text-center text-muted">Loading…</p>
  if (detail === null)
    return (
      <div className="mt-8 text-center text-muted">
        <p>Can't view this workout.</p>
        <Link to={`/friends/${userId}`} className="text-accent underline">
          Back
        </Link>
      </div>
    )

  return (
    <div>
      <Link to={`/friends/${userId}/${detail._id}`} className="text-sm text-muted">
        ← Workout
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Download Trophy</h1>

      <div className="mt-4 overflow-hidden rounded-xl border border-border">
        <FriendTrophyCard ref={frameRef} detail={detail} />
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
