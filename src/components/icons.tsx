// Small gym-themed SVG icons shared across stat tiles and empty states.
// Emoji (🏆 for PRs, 📸/🖼 for share) stay where they already were — these
// fill in spots that had no icon at all.

type IconProps = { className?: string }

export function BarbellIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={className}
    >
      <path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11" />
    </svg>
  )
}

// A weight plate viewed head-on: rim + center hole.
export function PlateIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={className}
    >
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

export function StopwatchIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={className}
    >
      <path d="M9 3h6M12 3v2" />
      <circle cx="12" cy="14" r="7" />
      <path d="M12 14V11" />
    </svg>
  )
}

// Reps/sets logged, as a little checklist.
export function ChecklistIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M5 6l1.5 1.5L9 5" />
      <path d="M12 6h7" />
      <path d="M5 12l1.5 1.5L9 11" />
      <path d="M12 12h7" />
      <path d="M5 18l1.5 1.5L9 17" />
      <path d="M12 18h7" />
    </svg>
  )
}

export function HeartOutlineIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 20s-7-4.35-9.5-8.5C1 8.5 2.5 5 6 5c2 0 3.5 1.2 4 2.5C10.5 6.2 12 5 14 5c3.5 0 5 3.5 3.5 6.5C19.5 15.65 12 20 12 20z" />
    </svg>
  )
}

// A training-plan sheet, for the Routines empty state.
export function ClipboardIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="6" y="4" width="12" height="17" rx="2" />
      <path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" />
      <path d="M9 11h6M9 15h4" />
    </svg>
  )
}

// Calories, for the My Stats / TDEE calculator page.
export function FlameIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 22c4 0 7-2.7 7-7 0-2.8-1.8-4.7-2.8-6.4-.7 1.4-1.7 2.4-2.7 2.4.7-3-.7-6-3.5-8 0 2.8-1 4.5-2.8 6.3C5.8 11 5 13 5 15c0 4.3 3 7 7 7Z" />
    </svg>
  )
}

// Friends / leaderboard.
export function PeopleIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
      <circle cx="17" cy="8" r="2.5" />
      <path d="M15.5 14.7c2.6.3 4.5 2.3 4.5 5.3" />
    </svg>
  )
}
