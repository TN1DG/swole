import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('modern-screenshot', () => ({
  domToBlob: vi.fn(() => Promise.resolve(new Blob(['png'], { type: 'image/png' }))),
}))

const { useCardExport, isAppleMobile } = await import('./useCardExport')

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36'

let anchorClicks: string[]
const share = vi.fn<(data: ShareData) => Promise<void>>()

function setDevice(userAgent: string, { platform = 'Linux', touch = 5, canShareFiles = true } = {}) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent)
  vi.spyOn(navigator, 'platform', 'get').mockReturnValue(platform)
  // jsdom doesn't implement maxTouchPoints, so there's no getter to spy on.
  Object.defineProperty(navigator, 'maxTouchPoints', { value: touch, configurable: true })
  Object.assign(navigator, { share, canShare: () => canShareFiles })
}

function renderExport() {
  const hook = renderHook(() => useCardExport('swole-push-story.png'))
  // The hook only needs a node with a width to scale from.
  Object.assign(hook.result.current.frameRef, { current: { clientWidth: 360 } })
  return hook
}

beforeEach(() => {
  anchorClicks = []
  share.mockReset().mockResolvedValue(undefined)
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    anchorClicks.push(this.download)
  })
  URL.createObjectURL = vi.fn(() => 'blob:card')
  URL.revokeObjectURL = vi.fn()
})

afterEach(() => vi.restoreAllMocks())

describe('isAppleMobile', () => {
  it('spots iPhones and iPads, including iPadOS posing as a Mac', () => {
    expect(isAppleMobile({ userAgent: IPHONE, platform: 'iPhone', maxTouchPoints: 5 })).toBe(true)
    expect(isAppleMobile({ userAgent: 'Macintosh', platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true)
    expect(isAppleMobile({ userAgent: 'Macintosh', platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false)
    expect(isAppleMobile({ userAgent: ANDROID, platform: 'Linux', maxTouchPoints: 5 })).toBe(false)
  })
})

describe('useCardExport save', () => {
  it('on iPhone opens the share sheet, the only way into Photos', async () => {
    setDevice(IPHONE, { platform: 'iPhone' })
    const { result } = renderExport()
    await act(() => result.current.save())

    expect(share).toHaveBeenCalledOnce()
    const file = (share.mock.calls[0]![0].files ?? [])[0]!
    expect(file.name).toBe('swole-push-story.png')
    expect(file.type).toBe('image/png')
    expect(anchorClicks).toEqual([])
  })

  it('on Android downloads straight to the gallery, with no share sheet', async () => {
    setDevice(ANDROID)
    const { result } = renderExport()
    await act(() => result.current.save())

    expect(share).not.toHaveBeenCalled()
    expect(anchorClicks).toEqual(['swole-push-story.png'])
  })

  it('stays quiet when the share sheet is dismissed', async () => {
    setDevice(IPHONE, { platform: 'iPhone' })
    share.mockRejectedValue(new DOMException('cancelled', 'AbortError'))
    const { result } = renderExport()
    await act(() => result.current.save())

    expect(anchorClicks).toEqual([])
    expect(result.current.busy).toBe(false)
  })
})

describe('useCardExport share', () => {
  it('opens the share sheet on any device that can share files', async () => {
    setDevice(ANDROID)
    const { result } = renderExport()
    await act(() => result.current.share())
    expect(share).toHaveBeenCalledOnce()
    expect(anchorClicks).toEqual([])
  })

  it('falls back to a download where files can’t be shared', async () => {
    setDevice('Mozilla/5.0 (Windows NT 10.0) Firefox/140', { touch: 0, canShareFiles: false })
    const { result } = renderExport()
    await act(() => result.current.share())
    expect(share).not.toHaveBeenCalled()
    expect(anchorClicks).toEqual(['swole-push-story.png'])
  })
})
