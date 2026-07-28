// What the "What's new" popup shows after an update.
//
// The notes live in the bundle, not the database, so they ship in the same
// deploy as the changes they describe — there's no way to release code and
// forget to publish its notes, or vice versa.
//
// To add a release: put a new entry at the TOP of RELEASES with a version
// nobody has seen before. That's all — every user whose account predates
// `releasedAt` gets the popup once, then never again.

export type Release = {
  /** Stored per-user once dismissed, so it must be unique per release. */
  version: string
  /** Month is 0-indexed: Date.UTC(2026, 6, 28) is 28 July 2026. */
  releasedAt: number
  /** One or two plain sentences — what this update is *for*. */
  summary: string
  /** The list. User-facing language, not commit subjects. */
  changes: string[]
}

// Newest first.
export const RELEASES: Release[] = [
  {
    version: '1.1.0',
    releasedAt: Date.UTC(2026, 6, 28),
    summary:
      'Mostly a phone-comfort update — plus profile pictures actually show up now.',
    changes: [
      'Profile pictures work. If you uploaded one and only ever saw your initial, it should appear now — no need to upload it again.',
      'In chat, Ping and Challenge moved above the message box, and the message box no longer hides behind the tab bar when you scroll.',
      'Logging sets on a phone is less fiddly: the weight and reps boxes are wider, and long exercise names no longer push the screen sideways.',
      'Friends list shows more of everyone’s name, and removing a friend now asks you to confirm first.',
    ],
  },
]

export const CURRENT_RELEASE = RELEASES[0]

/**
 * Whether to show `release` to this user.
 *
 * The `memberSince` check is the non-obvious half: someone who signed up
 * after a release shipped never used the version before it, so "what's new"
 * would be their first-ever look at the app described as a change. New users
 * get the welcome carousel instead.
 */
export function shouldShowRelease({
  release,
  lastSeenRelease,
  memberSince,
}: {
  release: Release
  lastSeenRelease: string | null
  memberSince: number
}): boolean {
  if (lastSeenRelease === release.version) return false
  return memberSince < release.releasedAt
}
