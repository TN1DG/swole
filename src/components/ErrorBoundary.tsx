import { Component, type ReactNode } from 'react'
import { Box, Button, Typography } from '@mui/material'
import { isStaleChunkError, reloadForStaleChunk } from '../lib/staleChunk'

// Catches render-time crashes anywhere in the tree so users get a reload
// button instead of a blank white screen. (Class component because React
// only supports error boundaries as classes.)
//
// One crash isn't a bug at all: a page still running an older deploy can't
// load the current deploy's code (see src/lib/staleChunk.ts). That one
// reloads itself onto the new version instead of showing the crash screen.
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null; updating: boolean }
> {
  state = { error: null as Error | null, updating: false }

  static getDerivedStateFromError(error: Error) {
    return { error, updating: isStaleChunkError(error) }
  }

  componentDidCatch(error: Error) {
    if (isStaleChunkError(error)) {
      void reloadForStaleChunk().then((reloading) => {
        // Already reloaded moments ago and still failing: a real problem.
        if (!reloading) {
          console.error('App crashed:', error)
          this.setState({ updating: false })
        }
      })
      return
    }
    // Log for debugging; a crash-reporting service could hook in here later.
    console.error('App crashed:', error)
  }

  render() {
    if (this.state.error && this.state.updating) {
      return (
        <Box sx={{ display: 'flex', minHeight: '100svh', alignItems: 'center', justifyContent: 'center', color: 'text.secondary' }}>
          Updating Swole…
        </Box>
      )
    }
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
