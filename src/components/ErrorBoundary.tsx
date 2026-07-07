import { Component, type ReactNode } from 'react'

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
        <div className="mx-auto flex min-h-svh max-w-lg flex-col items-center justify-center px-6 text-center">
          <p className="text-3xl">😵</p>
          <h1 className="mt-3 text-xl font-bold">Something went wrong</h1>
          <p className="mt-2 text-sm text-muted">
            Your workout data is safe on the server — this is just a display
            crash.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 rounded-xl bg-accent px-6 py-3 font-semibold text-accent-fg"
          >
            Reload App
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
