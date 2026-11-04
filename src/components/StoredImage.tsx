import { useState } from 'react'
import { Box } from '@mui/material'
import type { SxProps, Theme } from '@mui/material'

// A user photo served from storage. Stored dimensions reserve the exact space
// before a single byte arrives, so nothing jumps as photos load, which matters
// most in a chat thread pinned to its bottom edge. Older uploads have no stored
// dimensions and just take their natural height, as they always did.
export function StoredImage({
  src,
  width,
  height,
  alt = '',
  radius = '12px',
  sx,
  onClick,
}: {
  src: string
  width?: number | null
  height?: number | null
  alt?: string
  radius?: string
  sx?: SxProps<Theme>
  onClick?: () => void
}) {
  const [loaded, setLoaded] = useState(false)

  return (
    <Box
      sx={[
        {
          display: 'block',
          width: '100%',
          overflow: 'hidden',
          borderRadius: radius,
          bgcolor: 'surface2.main',
          ...(width && height ? { aspectRatio: `${width} / ${height}` } : {}),
          ...(onClick ? { cursor: 'zoom-in' } : {}),
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Box
        component="img"
        src={src}
        alt={alt}
        width={width ?? undefined}
        height={height ?? undefined}
        loading="lazy"
        decoding="async"
        onClick={onClick}
        // `complete` covers a photo already in the HTTP cache, whose load event
        // can fire before React has attached the handler.
        ref={(img: HTMLImageElement | null) => {
          if (img?.complete) setLoaded(true)
        }}
        onLoad={() => setLoaded(true)}
        // Broken image icon beats an invisible element nobody can diagnose.
        onError={() => setLoaded(true)}
        sx={{
          display: 'block',
          width: '100%',
          height: width && height ? '100%' : 'auto',
          objectFit: 'cover',
          opacity: loaded ? 1 : 0,
          transition: 'opacity 0.2s ease',
        }}
      />
    </Box>
  )
}
