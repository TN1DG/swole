import { useEffect, useState } from 'react'

// Mobile browsers put the keyboard over the page rather than shrinking it, so a
// composer at the bottom of a normal full-height layout would sit behind the
// keyboard. The visual viewport is the part actually left visible; sizing a
// fixed shell to it keeps the composer just above the keyboard. offsetTop covers
// iOS Safari scrolling the page up as well when an input takes focus.
export function useVisualViewport() {
  const [viewport, setViewport] = useState<{ height: number; offsetTop: number } | null>(null)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => setViewport({ height: vv.height, offsetTop: vv.offsetTop })
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  return viewport
}
