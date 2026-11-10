import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

function Throws({ error }: { error: Error }): never {
  throw error
}

const STALE = new TypeError('Failed to fetch dynamically imported module: https://swole.day/assets/WorkoutsPage-old.js')
const reload = vi.fn()

beforeEach(() => {
  sessionStorage.clear()
  reload.mockClear()
  vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, reload })
  // React logs caught render errors; they're expected here.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => vi.restoreAllMocks())

describe('ErrorBoundary', () => {
  it('reloads onto the new version when the page is running an old deploy', async () => {
    render(
      <ErrorBoundary>
        <Throws error={STALE} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Updating Swole…')).toBeInTheDocument()
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
    await waitFor(() => expect(reload).toHaveBeenCalledOnce())
  })

  it('shows the crash screen if it already reloaded moments ago and it failed again', async () => {
    sessionStorage.setItem('swole:staleChunkReloadAt', String(Date.now()))
    render(
      <ErrorBoundary>
        <Throws error={STALE} />
      </ErrorBoundary>,
    )
    expect(await screen.findByText('Something went wrong')).toBeInTheDocument()
    expect(reload).not.toHaveBeenCalled()
  })

  it('shows the crash screen straight away for an ordinary crash', () => {
    render(
      <ErrorBoundary>
        <Throws error={new TypeError("Cannot read properties of undefined (reading 'name')")} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(reload).not.toHaveBeenCalled()
  })
})
