import { Avatar as MuiAvatar } from '@mui/material'
import type { SxProps, Theme } from '@mui/material'

// Falls back to the first letter of the name, so a friend without a photo
// still reads as a distinct person rather than a generic silhouette.
function initial(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim()
  return trimmed ? trimmed[0].toUpperCase() : '?'
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
