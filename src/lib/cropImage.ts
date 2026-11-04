// Turns a source image plus react-easy-crop's pixel crop area into a small
// square avatar, ready to upload. Everything happens on a canvas in the
// browser, so the full-size original never leaves the device.
import { renderForProfile, type CropArea } from './optimizeImage'

export type { CropArea }

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
  return (await renderForProfile(image, crop, 'avatar')).blob
}
