import { useEffect, useState } from 'react'

/**
 * Owns the object URL for whatever image the user picked from their device.
 * Its own module (not AvatarUploadDialog.tsx) so that file exports only a
 * component — mixing hooks and components in one file breaks React Fast
 * Refresh, which oxlint's react(only-export-components) rule flags.
 *
 * The URL is revoked when the picked file changes or on unmount, so a user
 * who re-crops a few times doesn't leak a blob URL per attempt.
 */
export function useAvatarPicker() {
  const [imageSrc, setImageSrc] = useState<string | null>(null)

  useEffect(() => {
    if (!imageSrc) return
    return () => URL.revokeObjectURL(imageSrc)
  }, [imageSrc])

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Reset so picking the *same* file twice still fires a change event.
    event.target.value = ''
    if (!file) return
    setImageSrc(URL.createObjectURL(file))
  }

  return { imageSrc, onFileChange, clear: () => setImageSrc(null) }
}
