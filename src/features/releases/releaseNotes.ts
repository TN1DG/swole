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
    version: '1.3.0',
    releasedAt: Date.UTC(2026, 6, 28),
    summary:
      'Points are rebuilt around how often you train, not how much you lift. Your number will look very different — that is the change, not a bug.',
    changes: [
      'You now earn points for each DAY you train, not each workout. Three sessions on a Tuesday counts once. The third day of the week is worth the most, so getting from two days to three is the big jump.',
      'Lifting heavy still helps, but it is capped. Volume and PRs together can add at most 50 points against a possible 80 from turning up — so nobody out-lifts a more consistent friend any more.',
      'Weeks now run Monday to Sunday, and the leaderboard has a This week / This month toggle. There is a real deadline instead of a window that slid around with you.',
      'Points and your coin balance are the same thing now. Spending on a challenge no longer changes your leaderboard place — the board ranks what you earned, not what you have left.',
      'Your scores will drop from the thousands to the tens. Old points were raw kilograms; these are actual points, and roughly 195 is a perfect week.',
      'Your existing coin balance is untouched.',
    ],
  },
  // 1.1.0 was folded into this entry a couple of hours after it shipped,
  // rather than left as its own release — almost nobody had seen the popup
  // yet, and two notices back to back reads worse than one combined list.
  {
    version: '1.2.0',
    releasedAt: Date.UTC(2026, 6, 28),
    summary:
      'Share your workout with no background, a proper Swole coin, and a batch of phone fixes.',
    changes: [
      'Share images can now be transparent. Pick "Transparent" on the share screen and you get just the stats with no card behind them — drop it straight onto any photo.',
      'The points coin is now an actual coin: a horse at full gallop with a gold mane and tail, and "Hustlers don\'t stop they keep goooooooing" around the rim. It replaces the emoji that looked different on every phone.',
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
