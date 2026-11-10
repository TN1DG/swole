import { describe, expect, it } from 'vitest'
import { claimReload, isStaleChunkError, RELOAD_GUARD_MS } from './staleChunk'

function memoryStorage() {
  const data = new Map<string, string>()
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  }
}

describe('isStaleChunkError', () => {
  it('recognises every browser’s wording of a chunk that failed to load', () => {
    for (const message of [
      'Failed to fetch dynamically imported module: https://swole.day/assets/WorkoutsPage-CjUrk36O.js',
      'Importing a module script failed.',
      'error loading dynamically imported module: https://swole.day/assets/x.js',
      'Unable to preload CSS for /assets/x.css',
      "Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of \"text/html\". Strict MIME type checking is enforced for module scripts per HTML spec. 'text/html' is not a valid JavaScript MIME type.",
    ]) {
      expect(isStaleChunkError(new TypeError(message)), message).toBe(true)
    }
  })

  it('leaves real crashes alone', () => {
    expect(isStaleChunkError(new TypeError("Cannot read properties of undefined (reading 'name')"))).toBe(false)
    expect(isStaleChunkError(null)).toBe(false)
  })
})

describe('claimReload', () => {
  it('allows one reload, then refuses another inside the guard window', () => {
    const storage = memoryStorage()
    expect(claimReload(storage, 1_000)).toBe(true)
    expect(claimReload(storage, 1_000 + RELOAD_GUARD_MS - 1)).toBe(false)
    expect(claimReload(storage, 1_000 + RELOAD_GUARD_MS)).toBe(true)
  })

  it('won’t reload when storage is unavailable, since it couldn’t stop a loop', () => {
    const blocked = {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {},
    }
    expect(claimReload(blocked)).toBe(false)
  })
})
