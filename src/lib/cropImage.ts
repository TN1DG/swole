// Turns a source image plus react-easy-crop's pixel crop area into a small
// square JPEG blob, ready to upload. Everything happens on a canvas in the
// browser, so the full-size original never leaves the device.

// Avatars render at 100px at the very largest; 512 keeps them crisp on
// high-DPI screens while landing well under 100KB as JPEG.
const OUTPUT_SIZE = 512
const JPEG_QUALITY = 0.9

export type CropArea = { x: number; y: number; width: number; height: number }

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', () => reject(new Error('Could not read that image')))
    image.src = src
  })
}

export async function cropToSquareBlob(imageSrc: string, crop: CropArea): Promise<Blob> {
  const image = await loadImage(imageSrc)

  const canvas = document.createElement('canvas')
  canvas.width = OUTPUT_SIZE
  canvas.height = OUTPUT_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not process that image')

  // JPEG has no alpha, so an un-painted background would come out black.
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE)
  ctx.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    OUTPUT_SIZE,
    OUTPUT_SIZE,
  )

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not process that image'))),
      'image/jpeg',
      JPEG_QUALITY,
    )
  })
}
