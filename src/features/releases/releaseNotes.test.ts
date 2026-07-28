import { describe, expect, it } from 'vitest'
import { CURRENT_RELEASE, RELEASES, shouldShowRelease, type Release } from './releaseNotes'

const release: Release = {
  version: '2.0.0',
  releasedAt: Date.UTC(2026, 6, 28),
  summary: 'Test release.',
  changes: ['Something changed.'],
}

const beforeRelease = Date.UTC(2026, 5, 1)
const afterRelease = Date.UTC(2026, 7, 1)

describe('shouldShowRelease', () => {
  it('shows to an existing user who has never seen a release popup', () => {
    expect(
      shouldShowRelease({ release, lastSeenRelease: null, memberSince: beforeRelease }),
    ).toBe(true)
  })

  it('shows to an existing user whose last seen release is an older one', () => {
    expect(
      shouldShowRelease({ release, lastSeenRelease: '1.0.0', memberSince: beforeRelease }),
    ).toBe(true)
  })

  it('does not show twice', () => {
    expect(
      shouldShowRelease({ release, lastSeenRelease: '2.0.0', memberSince: beforeRelease }),
    ).toBe(false)
  })

  it('does not show to an account created after the release shipped', () => {
    // They never used the version being described — the welcome carousel is
    // their introduction, not a changelog.
    expect(
      shouldShowRelease({ release, lastSeenRelease: null, memberSince: afterRelease }),
    ).toBe(false)
  })
})

describe('RELEASES', () => {
  it('is ordered newest first', () => {
    const dates = RELEASES.map((r) => r.releasedAt)
    expect(dates).toEqual([...dates].sort((a, b) => b - a))
  })

  it('has a unique version per release', () => {
    // A duplicate would mean anyone who dismissed the earlier entry silently
    // never sees the newer one.
    const versions = RELEASES.map((r) => r.version)
    expect(new Set(versions).size).toBe(versions.length)
  })

  it('exposes the newest release as CURRENT_RELEASE', () => {
    expect(CURRENT_RELEASE).toBe(RELEASES[0])
  })

  it('gives every release a summary and at least one change', () => {
    for (const r of RELEASES) {
      expect(r.summary.trim()).not.toBe('')
      expect(r.changes.length).toBeGreaterThan(0)
    }
  })
})
