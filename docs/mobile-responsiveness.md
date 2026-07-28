# Mobile responsiveness pass — 2026-07-28

Swole was already mobile-first (max-width shell, bottom tab bar, safe-area
padding, `svh` units, 16px inputs so iOS doesn't zoom on focus). This pass
fixed the things that were still wrong on a real phone, and set up two
conventions so the same bugs don't come back.

Verified by `tsc -b`, `tsc --noEmit -p convex`, `oxlint`, 217 vitest tests and
`npm run build` — **not yet on a physical device.**

---

## Two conventions to follow in new code

### 1. Never hardcode the app chrome's height

`AppLayout` measures the sticky header and the fixed tab bar with a
`ResizeObserver` and publishes them on `<html>` as `--app-header-h` and
`--app-nav-h` (see `useChromeHeights` in `src/components/AppLayout.tsx`).
Fallback values live in `src/theme/globalStyles.ts` for the first paint.

Anything that sticks below the header or above the tab bar reads those:

```ts
sx={{ position: 'sticky', top: 'var(--app-header-h)' }}    // below the header
sx={{ position: 'sticky', bottom: 'var(--app-nav-h)' }}    // above the tab bar
```

They're measured rather than constants because both heights genuinely vary per
device — the header grows by the status-bar safe-area inset (0 on Android, 47px+
on a notched iPhone) and both grow with the OS font-size setting. Any magic
number would be wrong on most real phones.

### 2. A flexible text column needs `minWidth: 0`

A flex item defaults to `min-width: auto`, meaning it refuses to shrink below
its content. So `<Typography sx={{ flex: 1 }}>{userSuppliedName}</Typography>`
does not truncate on a narrow screen — it pushes the entire row past the screen
edge and gives the whole page a horizontal scrollbar. Always pair `flex: 1`
with `minWidth: 0`, then choose `noWrap` (truncate) or
`whiteSpace: 'normal'` (wrap).

Page gutters follow the same idea: `--app-gutter-left` / `--app-gutter-right`
(in `globalStyles.ts`) are `max(1rem, env(safe-area-inset-*))`, so content
clears the notch in landscape. Full-bleed elements cancel them with
`ml: 'calc(-1 * var(--app-gutter-left))'` rather than a hardcoded `-16px`.

---

## What was broken, and what changed

### Real bugs

**The chat composer was hidden behind the tab bar.** It was
`position: sticky; bottom: 0`, so while the thread was scrolled mid-way it
pinned to the viewport bottom — underneath the fixed tab bar. Now
`bottom: var(--app-nav-h)`. `src/features/friends/FriendChatPage.tsx`.

**The chat page's own header slid under the app bar.** It was
`position: sticky; top: 0; zIndex: 10` while the app header is also `top: 0`
at `zIndex.appBar` (1100), so it disappeared the moment you scrolled. Now
`top: var(--app-header-h)` at `zIndex.appBar - 1`.

**Long exercise names forced horizontal page scroll.** Both
`RoutineEditor.tsx` and `ActiveWorkout.tsx` had the exercise name on `flex: 1`
with no `minWidth: 0` — see convention 2. The active-workout name now wraps;
the routine-editor row was restructured into two lines (name on top, sets
stepper beneath) because its controls needed ~210px of the ~296px available,
leaving ~85px for the name.

**The PR trophy overflowed the set-number column.** `2.5rem` wide with
`px: 1`, but "12 🏆" doesn't fit in that — it spilled over the weight field
next to it. Padding reduced to `px: 0.25`.

**The app header had top padding but no bottom padding**, leaving the logo and
avatar flush against its bottom border. Added `pb: 1`.

### Squeezed layouts

**Active-workout number fields.** Everything but weight/reps is a fixed width,
so gaps came straight out of the two fields that matter. Row gap 8px → 4px and
MUI's default 14px of input padding → 6px (`NUMBER_FIELD_SX`). On a 360px
phone each field went from ~48px of usable width to ~72px — "102.5" now fits.

**Friends list rows.** "Chat 💬" and "Remove" as text buttons left roughly
80px for the name; most display names truncated to a few characters. Both are
icon buttons now (`FriendRow` in `FriendsPage.tsx`), which roughly doubles the
name's width. Because Remove is destructive and previously fired with **no
confirmation at all**, shrinking its hit area required adding a
`ConfirmDialog` — a bare ✕ turning a mis-tap into a silently deleted
friendship would have been strictly worse than the layout problem.

**Leaderboard rows** fit five things across one phone width (rank, streak
ring, avatar, name, score). Gaps 12px → 8px, rank column 20px → 16px.

**Fixed-column grids** that couldn't reflow: the 4-across macro grid
(`CalorieBreakdown.tsx`, clipped "Protein" below ~360px) and the 3-across
profile stat tiles are now `repeat(auto-fit, minmax(…, 1fr))`, so they stay on
one row where there's room and wrap where there isn't.

### Polish

- `-webkit-text-size-adjust: 100%` — stops iOS Safari inflating body text on
  rotation to landscape, which reflowed every list row mid-workout.
- `-webkit-tap-highlight-color: transparent` — removes the grey flash Android
  paints over every tapped button, on top of MUI's own ripple.
- `main`'s bottom padding was a hardcoded `6rem`; it's now
  `calc(var(--app-nav-h) + 1rem)`, which is both correct and about 30px less
  dead space at the bottom of every page.
- Chat thread `minHeight` `50vh` → `50svh` (`vh` is the *largest* viewport
  height on mobile Safari, so it over-reserved).

---

## Also changed, deliberately

Removing a friend now asks for confirmation. That's a behaviour change, not
just a layout one — see the reasoning under "Friends list rows" above.

## Still open

- **Not tested on a physical phone.** Everything here is verified by build and
  test suite plus layout reasoning at 320/360/375px widths. The chat composer
  and header stickiness in particular deserve a real scroll on a real device.
- **320px is workable but tight** in the active-workout set row. That's iPhone
  SE 1st-gen territory; the realistic floor today is 360px.
- **Tap targets in `RoutineEditor`'s sets stepper are 32px**, under the 44px
  guideline. Left alone — they sit in a dense editor and are non-destructive.
- The lb/ft display gap (backlog P3 #4) is untouched — the active workout,
  workout detail and leaderboard still show raw kg.
