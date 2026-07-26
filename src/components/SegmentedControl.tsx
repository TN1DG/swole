import { Badge, ToggleButton, ToggleButtonGroup } from '@mui/material'
import { tokens } from '../theme/tokens'

// Full-width, equal-split pill row — replaces the `grid grid-cols-N
// glass-tile p-1` segmented-tab pattern previously duplicated across
// HistoryPage/FriendsPage/StatsPage, and the male/female toggle previously
// hand-duplicated in StatsPage and WelcomeCarousel. Closer visual match to
// the original than MUI Tabs' underline idiom. `badge` on an option (e.g.
// pending friend-request count) renders a small count pill in its corner.
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string; badge?: number }[]
}) {
  return (
    <ToggleButtonGroup
      exclusive
      fullWidth
      value={value}
      onChange={(_, next: T | null) => next !== null && onChange(next)}
      sx={{
        backgroundColor: tokens.surface2Glass,
        border: '1px solid rgb(69 61 53 / 0.3)',
        borderRadius: '12px',
        p: 0.5,
        gap: 0.5,
        '& .MuiToggleButtonGroup-grouped': {
          border: 0,
          borderRadius: '8px !important',
          textTransform: 'capitalize',
          fontWeight: 600,
          fontSize: '0.875rem',
          color: 'text.secondary',
          py: 1,
          '&.Mui-selected': {
            backgroundColor: 'primary.main',
            color: 'primary.contrastText',
          },
          '&.Mui-selected:hover': {
            backgroundColor: 'primary.main',
          },
        },
      }}
    >
      {options.map((opt) =>
        opt.badge ? (
          <ToggleButton key={opt.value} value={opt.value}>
            <Badge
              badgeContent={opt.badge}
              color="error"
              sx={{ '& .MuiBadge-badge': { right: -10, top: -2 } }}
            >
              {opt.label}
            </Badge>
          </ToggleButton>
        ) : (
          <ToggleButton key={opt.value} value={opt.value}>
            {opt.label}
          </ToggleButton>
        ),
      )}
    </ToggleButtonGroup>
  )
}
