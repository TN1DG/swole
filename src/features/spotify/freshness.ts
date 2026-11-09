// The poll loop rewrites a now-playing row every 30 seconds. One that hasn't
// been touched for a few minutes means the loop died without cleaning up, so
// the track is no longer trustworthy. Checked on the client because a Convex
// query can't read the clock.
export const NOW_PLAYING_STALE_MS = 3 * 60 * 1000

export function isFreshNowPlaying(updatedAt: number, now: number): boolean {
  return now - updatedAt < NOW_PLAYING_STALE_MS
}
