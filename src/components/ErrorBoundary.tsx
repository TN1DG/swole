import { Component, type ReactNode } from 'react'
import { Box, Button, Typography } from '@mui/material'

// Catches render-time crashes anywhere in the tree so users get a reload
// button instead of a blank white screen. (Class component because React
// only supports error boundaries as classes.)
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    // Log for debugging; a crash-reporting service could hook in here later.
    console.error('App crashed:', error)
  }

  render() {
    if (this.state.error) {
      return (
        <Box
          sx={{
            mx: 'auto',
            display: 'flex',
            minHeight: '100svh',
            maxWidth: '32rem',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            px: 3,
            textAlign: 'center',
          }}
        >
          <Typography sx={{ fontSize: '1.875rem' }}>😵</Typography>
          <Typography variant="h6" sx={{ mt: 1.5, fontWeight: 'bold' }}>
            Something went wrong
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Your workout data is safe on the server — this is just a display
            crash.
          </Typography>
          <Button
            variant="contained"
            onClick={() => window.location.reload()}
            sx={{ mt: 3 }}
          >
            Reload App
          </Button>
        </Box>
      )
    }
    return this.props.children
  }
}
