import { Avatar as MuiAvatar } from '@mui/material'
import type { SxProps, Theme } from '@mui/material'

// Falls back to the first letter of the name, so a friend without a photo
// still reads as a distinct person rather than a generic silhouette.
function initial(name: string | null | undefined): string {
  // charAt rather than [0]: it returns '' for an empty string instead of
  // undefined, so the fallback below is the only branch that has to exist.
  return (name ?? '').trim().charAt(0).toUpperCase() || '?'
}

export function Avatar({
  src,
  name,
  size = 40,
  sx,
}: {
  src?: string | null
  name?: string | null
  size?: number
  sx?: SxProps<Theme>
}) {
  return (
    <MuiAvatar
      src={src ?? undefined}
      alt={name ?? ''}
      sx={{
        width: size,
        height: size,
        flexShrink: 0,
        bgcolor: 'surface2.main',
        color: 'text.secondary',
        fontSize: size * 0.42,
        fontWeight: 700,
        border: '1px solid',
        borderColor: 'divider',
        ...sx,
      }}
    >
      {initial(name)}
    </MuiAvatar>
  )
}
