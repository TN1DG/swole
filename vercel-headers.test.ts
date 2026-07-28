import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Guards the production Content-Security-Policy in vercel.json.
 *
 * This exists because of a real bug: avatars are served from the Convex
 * deployment's own origin (`https://<deployment>.convex.cloud/api/storage/…`),
 * but `img-src` only allowed `'self' blob: data:`. Uploading worked, the
 * storage row was written, and getMine returned a valid URL — the browser
 * just refused to load it, so every <Avatar> silently fell back to rendering
 * the user's initial.
 *
 * It went unnoticed because vercel.json's headers are applied by Vercel in
 * production only; the Vite dev server serves no CSP at all, so the feature
 * looked correct the whole time it was being built.
 */

function csp(): string {
  const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
    headers: { headers: { key: string; value: string }[] }[]
  }
  const header = config.headers
    .flatMap((rule) => rule.headers)
    .find((h) => h.key === 'Content-Security-Policy')
  if (!header) throw new Error('No Content-Security-Policy header in vercel.json')
  return header.value
}

function directive(name: string): string[] {
  const found = csp()
    .split(';')
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `))
  if (found === undefined) throw new Error(`CSP has no ${name} directive`)
  return found.split(/\s+/).slice(1)
}

describe('production CSP', () => {
  it('lets images load from Convex file storage', () => {
    // Without this, profile pictures render as the fallback initial.
    expect(directive('img-src')).toContain('https://*.convex.cloud')
  })

  it('still allows the local and in-memory image sources', () => {
    // blob:/data: carry the share-photo export pipeline; 'self' carries the
    // PWA icons and favicon.
    expect(directive('img-src')).toEqual(
      expect.arrayContaining(["'self'", 'blob:', 'data:']),
    )
  })

  it('lets the Convex client reach its backend over https and websockets', () => {
    expect(directive('connect-src')).toEqual(
      expect.arrayContaining(['https://*.convex.cloud', 'wss://*.convex.cloud']),
    )
  })

  it('keeps the directives that make the policy worth having', () => {
    // A regression here would mean the policy stopped constraining scripts —
    // the part that actually mitigates XSS.
    expect(directive('script-src')).toEqual(["'self'"])
    expect(directive('default-src')).toEqual(["'self'"])
    expect(directive('frame-ancestors')).toEqual(["'none'"])
    expect(directive('base-uri')).toEqual(["'self'"])
  })
})
