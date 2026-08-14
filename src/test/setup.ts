import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// jsdom is reused across tests in a file, so a component left mounted by one
// test is still in the document for the next — which makes `getByText` throw
// "found multiple elements" in a way that points at the wrong test.
afterEach(cleanup)
