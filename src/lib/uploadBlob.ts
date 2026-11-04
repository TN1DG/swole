import { ConvexError } from 'convex/values'
import type { Id } from '../../convex/_generated/dataModel'

// The middle step of every photo flow: mint a one-shot URL with a mutation,
// POST the bytes to it, get back the storageId to adopt in a second mutation.
export async function uploadBlob(
  generateUploadUrl: () => Promise<string>,
  blob: Blob,
): Promise<Id<'_storage'>> {
  const uploadUrl = await generateUploadUrl()
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': blob.type },
    body: blob,
  })
  if (!response.ok) throw new ConvexError('Upload failed — check your connection')
  const { storageId } = (await response.json()) as { storageId: Id<'_storage'> }
  return storageId
}
