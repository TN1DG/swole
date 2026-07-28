import { useRef, useState } from 'react'
import { domToBlob } from 'modern-screenshot'

const EXPORT_WIDTH = 1080 // Instagram-story sized PNG (1080x1920)

/**
 * Renders a card to a PNG and hands it to the OS share sheet (or a download
 * on desktop). Owns the ref you attach to the exportable node.
 *
 * Extracted because SharePage and FriendTrophyPage carried byte-identical
 * copies of all four functions below, and the transparent-export work would
 * have made that three.
 *
 * Its own module rather than living beside a component: a file that exports
 * both a hook and a component breaks React Fast Refresh, which oxlint's
 * react(only-export-components) rule flags. Same reason useAvatarPicker.ts
 * is separate from AvatarUploadDialog.tsx.
 *
 * Note on transparency: `domToBlob`'s `backgroundColor` defaults to null and
 * we never pass one, so it skips its canvas fill entirely and the PNG keeps
 * its alpha channel. Transparency is therefore purely a CSS concern in the
 * card — see cardVariant.ts. Do not add a backgroundColor here.
 */
export function useCardExport(fileName = 'workout.png') {
  const frameRef = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)

  async function makePng(): Promise<Blob | null> {
    const node = frameRef.current
    if (!node) return null
    return domToBlob(node, {
      // Export resolution is derived from the live preview's width, so the
      // card's layout must not differ between variants or the output
      // dimensions shift with it.
      scale: EXPORT_WIDTH / node.clientWidth,
      type: 'image/png',
    })
  }

  function downloadBlob(blob: Blob) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
  }

  async function share() {
    setBusy(true)
    try {
      const blob = await makePng()
      if (!blob) return
      const file = new File([blob], fileName, { type: 'image/png' })
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

  async function download() {
    setBusy(true)
    try {
      const blob = await makePng()
      if (blob) downloadBlob(blob)
    } finally {
      setBusy(false)
    }
  }

  return { frameRef, busy, share, download }
}
