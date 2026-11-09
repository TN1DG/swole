import { useRef, useState } from 'react'
import { domToBlob } from 'modern-screenshot'

const EXPORT_WIDTH = 1080 // 1080x1920 story or 1080x1080 square, see cardFormat.ts

/**
 * iPhone and iPad, including iPadOS, which reports itself as a Mac but has a
 * touchscreen. On these a web app has exactly one way into Photos: the share
 * sheet, whose top row is "Save Image". A download lands in Files instead.
 */
export function isAppleMobile(nav: Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'> = navigator) {
  return /iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)
}

/**
 * Renders a card to a PNG and either saves it or hands it to the OS share
 * sheet. Owns the ref you attach to the exportable node.
 *
 * - `save()`: the fewest taps to get the image into the photo library. A
 *   plain download on Android (lands in the gallery) and desktop; the share
 *   sheet on iPhone, where "Save Image" is the only route into Photos.
 * - `share()`: always the share sheet, for Instagram, Snapchat, WhatsApp…
 *   (websites can't post into Stories directly). Falls back to a download
 *   where files can't be shared.
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
export function useCardExport(fileName = 'swole-workout.png') {
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

  async function shareFile(blob: Blob): Promise<boolean> {
    const file = new File([blob], fileName, { type: 'image/png' })
    if (!navigator.canShare?.({ files: [file] })) return false
    try {
      await navigator.share({ files: [file] })
    } catch {
      // user closed the share sheet — not an error
    }
    return true
  }

  async function run(handle: (blob: Blob) => Promise<void>) {
    setBusy(true)
    try {
      const blob = await makePng()
      if (blob) await handle(blob)
    } catch (error) {
      console.error('Card export failed', error)
    } finally {
      setBusy(false)
    }
  }

  const share = () =>
    run(async (blob) => {
      if (!(await shareFile(blob))) downloadBlob(blob) // desktop browsers: just save it
    })

  const save = () =>
    run(async (blob) => {
      if (isAppleMobile() && (await shareFile(blob))) return
      downloadBlob(blob)
    })

  return { frameRef, busy, share, save }
}
