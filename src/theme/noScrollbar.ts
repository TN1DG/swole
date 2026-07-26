import type { SxProps, Theme } from '@mui/material/styles'

// Hides the scrollbar on an intentionally-scrollable element without
// disabling scrolling — replaces the old `no-scrollbar` Tailwind utility.
export const noScrollbarSx: SxProps<Theme> = {
  scrollbarWidth: 'none',
  msOverflowStyle: 'none',
  '&::-webkit-scrollbar': { display: 'none' },
}
