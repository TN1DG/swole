import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ConvexAuthProvider } from '@convex-dev/auth/react'
import { ConvexReactClient } from 'convex/react'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { AppThemeProvider } from './theme/AppThemeProvider'
import { reloadForStaleChunk } from './lib/staleChunk'

// Vite reports a chunk it couldn't preload here, often before React sees
// anything. Same cause and cure as the ErrorBoundary's stale-chunk case:
// reload onto the current deploy. preventDefault stops Vite rethrowing it,
// unless a reload was already tried, in which case the error surfaces.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  void reloadForStaleChunk().then((reloading) => {
    if (!reloading) console.error('Could not load part of the app', (event as Event & { payload?: unknown }).payload)
  })
})

// One client for the whole app. The URL comes from .env.local, which the
// Convex CLI writes when the project is created.
const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppThemeProvider>
      <ErrorBoundary>
        <ConvexAuthProvider client={convex}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ConvexAuthProvider>
      </ErrorBoundary>
    </AppThemeProvider>
  </StrictMode>,
)
