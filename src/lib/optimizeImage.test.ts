import { describe, expect, it, vi } from 'vitest'
import { encodeWithinTarget, fitWithin, IMAGE_PROFILES } from './optimizeImage'

const blobOfSize = (size: number) => new Blob([new Uint8Array(size)])

describe('fitWithin', () => {
  it('scales the longest edge down and keeps the aspect ratio', () => {
    expect(fitWithin(4000, 3000, 1440)).toEqual({ width: 1440, height: 1080 })
    expect(fitWithin(3000, 4000, 1440)).toEqual({ width: 1080, height: 1440 })
  })

  it('never upscales a small image', () => {
    expect(fitWithin(800, 600, 1440)).toEqual({ width: 800, height: 600 })
  })

  it('keeps an extreme panorama at least one pixel tall', () => {
    expect(fitWithin(10000, 1, 320)).toEqual({ width: 320, height: 1 })
  })
})

describe('encodeWithinTarget', () => {
  it('stops at the first quality under target', async () => {
    const encode = vi.fn(async (q: number) => blobOfSize(q > 0.7 ? 500 : 100))
    const blob = await encodeWithinTarget(encode, 200, [0.9, 0.8, 0.6, 0.5])

    expect(blob.size).toBe(100)
    expect(encode.mock.calls.map(([q]) => q)).toEqual([0.9, 0.8, 0.6])
  })

  it('returns the lowest-quality attempt when nothing fits', async () => {
    const blob = await encodeWithinTarget(async (q) => blobOfSize(q * 1000), 10, [0.9, 0.5])
    expect(blob.size).toBe(500)
  })
})

// These sit well under the server caps in convex/ (1MB/2MB), so a photo that
// misses its target by a wide margin at the lowest quality still uploads.
describe('IMAGE_PROFILES', () => {
  it('stays under every server byte cap', () => {
    expect(IMAGE_PROFILES.avatar.targetBytes).toBeLessThan(1024 * 1024)
    expect(IMAGE_PROFILES.post.targetBytes).toBeLessThan(2 * 1024 * 1024)
    expect(IMAGE_PROFILES.chat.targetBytes).toBeLessThan(1024 * 1024)
    expect(IMAGE_PROFILES.food.targetBytes).toBeLessThan(2 * 1024 * 1024)
  })
})
