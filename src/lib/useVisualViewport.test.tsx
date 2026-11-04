import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useVisualViewport } from './useVisualViewport'

function stubViewport(height: number, offsetTop = 0) {
  const target = new EventTarget()
  const vv = Object.assign(target, { height, offsetTop })
  vi.stubGlobal('visualViewport', vv)
  return vv
}

afterEach(() => {
  vi.unstubAllGlobals()
})

// A real phone keyboard can't be reproduced here. This covers what the shell does
// with what the browser reports; the real keyboard still needs checking on a phone.
describe('useVisualViewport', () => {
  it('starts at the visible height', () => {
    stubViewport(800)
    const { result } = renderHook(() => useVisualViewport())
    expect(result.current).toEqual({ height: 800, offsetTop: 0 })
  })

  it('shrinks when the keyboard opens', () => {
    const vv = stubViewport(800)
    const { result } = renderHook(() => useVisualViewport())

    act(() => {
      vv.height = 460
      vv.dispatchEvent(new Event('resize'))
    })

    expect(result.current).toEqual({ height: 460, offsetTop: 0 })
  })

  it('follows iOS scrolling the page up on focus', () => {
    const vv = stubViewport(460)
    const { result } = renderHook(() => useVisualViewport())

    act(() => {
      vv.offsetTop = 120
      vv.dispatchEvent(new Event('scroll'))
    })

    expect(result.current).toEqual({ height: 460, offsetTop: 120 })
  })

  it('stops listening after unmount', () => {
    const vv = stubViewport(800)
    const remove = vi.spyOn(vv, 'removeEventListener')
    const { unmount } = renderHook(() => useVisualViewport())

    unmount()

    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function))
    expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function))
  })

  it('reports nothing where the browser has no visual viewport', () => {
    vi.stubGlobal('visualViewport', undefined)
    const { result } = renderHook(() => useVisualViewport())
    expect(result.current).toBeNull()
  })
})
