// The service worker's copies of photos, which can include friends' chat photos,
// so they have to go when someone signs out of a device. The name lives here so
// the worker that fills the cache and the page that clears it can't disagree.
export const PHOTO_CACHE_NAME = 'swole-photos'

export async function clearPhotoCache(): Promise<void> {
  if (typeof caches === 'undefined') return
  await caches.delete(PHOTO_CACHE_NAME)
}
