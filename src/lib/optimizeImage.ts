import { ConvexError } from 'convex/values'

// The one path every user photo takes on its way to storage. Convex storage
// serves back exactly the bytes it was given (there is no resizing CDN in front
// of it), so whatever leaves the device here is what every viewer downloads,
// every time.
//
// Re-encoding through a canvas is also the privacy boundary: a canvas has no
// EXIF, so a phone photo's GPS coordinates and device details never get
// uploaded. That's why even an already-small image is always re-encoded rather
// than passed through untouched.

export type ImageProfile = 'avatar' | 'post' | 'chat' | 'food'

type ProfileSpec = {
  maxEdge: number
  targetBytes: number
  // The vision model is the only consumer of food photos, and JPEG is the
  // format its pipeline is most predictable with.
  jpegOnly?: boolean
}

export const IMAGE_PROFILES: Record<ImageProfile, ProfileSpec> = {
  // Rendered at 100 CSS px at the very largest, so 3x that covers any phone.
  avatar: { maxEdge: 320, targetBytes: 40 * 1024 },
  // The app column is 32rem (512 CSS px), so ~3x again.
  post: { maxEdge: 1440, targetBytes: 400 * 1024 },
  chat: { maxEdge: 1280, targetBytes: 300 * 1024 },
  food: { maxEdge: 1024, targetBytes: 300 * 1024, jpegOnly: true },
}

// Tried in order until one lands under the profile's target. Below 0.5 the
// artifacts are obvious, so that's the floor; the server's byte caps sit well
// above the targets, so a stubborn photo still uploads at the lowest quality.
const QUALITY_STEPS = [0.82, 0.74, 0.66, 0.58, 0.5]

export type Size = { width: number; height: number }
export type CropArea = Size & { x: number; y: number }
export type OptimizedImage = Size & { blob: Blob }

export function fitWithin(width: number, height: number, maxEdge: number): Size {
  const longest = Math.max(width, height)
  if (longest <= maxEdge) return { width, height }
  const scale = maxEdge / longest
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

// Stops at the first quality under target. If none fits, the last (smallest
// quality) wins — better a slightly heavy photo than a failed upload.
export async function encodeWithinTarget(
  encode: (quality: number) => Promise<Blob>,
  targetBytes: number,
  qualities: readonly number[] = QUALITY_STEPS,
): Promise<Blob> {
  let blob: Blob | null = null
  for (const quality of qualities) {
    blob = await encode(quality)
    if (blob.size <= targetBytes) return blob
  }
  if (!blob) throw new Error('Could not process that image')
  return blob
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not process that image'))),
      type,
      quality,
    )
  })
}

// Safari can decode WebP but not encode it, and rather than failing, toBlob
// quietly hands back a PNG — a many-megabyte one for a photo. So the only way
// to know is to ask for WebP and look at what actually came back.
let webpEncodable: Promise<boolean> | null = null
function canEncodeWebp(): Promise<boolean> {
  webpEncodable ??= (async () => {
    const probe = document.createElement('canvas')
    probe.width = 1
    probe.height = 1
    try {
      return (await canvasToBlob(probe, 'image/webp', 0.8)).type === 'image/webp'
    } catch {
      return false
    }
  })()
  return webpEncodable
}

function get2dContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not process that image')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  return ctx
}

// Halves repeatedly before the final draw. A single drawImage from 4000px to
// 320px samples too few source pixels and comes out visibly jagged, even with
// imageSmoothingQuality on.
function drawScaled(
  source: CanvasImageSource,
  from: CropArea,
  to: Size,
  background: string | null,
): HTMLCanvasElement {
  let current = source
  let rect = from
  while (rect.width / 2 >= to.width && rect.height / 2 >= to.height) {
    const width = Math.round(rect.width / 2)
    const height = Math.round(rect.height / 2)
    const step = document.createElement('canvas')
    step.width = width
    step.height = height
    get2dContext(step).drawImage(
      current,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      0,
      0,
      width,
      height,
    )
    current = step
    rect = { x: 0, y: 0, width, height }
  }

  const canvas = document.createElement('canvas')
  canvas.width = to.width
  canvas.height = to.height
  const ctx = get2dContext(canvas)
  if (background) {
    ctx.fillStyle = background
    ctx.fillRect(0, 0, to.width, to.height)
  }
  ctx.drawImage(current, rect.x, rect.y, rect.width, rect.height, 0, 0, to.width, to.height)
  return canvas
}

// Draws `from` (a region of `source`) at the profile's size and encodes it.
export async function renderForProfile(
  source: CanvasImageSource,
  from: CropArea,
  profile: ImageProfile,
): Promise<OptimizedImage> {
  const spec = IMAGE_PROFILES[profile]
  const useWebp = !spec.jpegOnly && (await canEncodeWebp())
  const size = fitWithin(from.width, from.height, spec.maxEdge)
  // JPEG has no alpha, so an unpainted background would come out black anyway;
  // painting it makes that explicit. WebP keeps a transparent PNG transparent.
  const canvas = drawScaled(source, from, size, useWebp ? null : '#000000')
  const type = useWebp ? 'image/webp' : 'image/jpeg'
  const blob = await encodeWithinTarget(
    (quality) => canvasToBlob(canvas, type, quality),
    spec.targetBytes,
  )
  return { blob, ...size }
}

// For a whole picked file. `imageOrientation: 'from-image'` bakes in the EXIF
// rotation phone photos rely on, since the EXIF itself won't survive. Decoding
// is also what makes HEIC work: on iOS Safari the browser defers to OS codecs,
// and where it can't, this throws the message the UI shows.
export async function optimizeImage(file: Blob, profile: ImageProfile): Promise<OptimizedImage> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    // ConvexError so errorMessage() shows this text rather than its fallback.
    throw new ConvexError("That photo's format isn't supported — try a different one.")
  }
  try {
    return await renderForProfile(
      bitmap,
      { x: 0, y: 0, width: bitmap.width, height: bitmap.height },
      profile,
    )
  } finally {
    bitmap.close()
  }
}
