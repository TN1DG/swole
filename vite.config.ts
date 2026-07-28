import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Turns the production CSP header into an equivalent <meta> policy.
 *
 * `frame-ancestors` is dropped because a meta-delivered CSP ignores it (as it
 * does report-uri and sandbox) and warns in the console. It stays in the real
 * header in vercel.json, which is where it works.
 */
export function metaCspFrom(headerPolicy: string): string {
  return headerPolicy
    .split(';')
    .map((directive) => directive.trim())
    .filter((directive) => directive !== '' && !directive.startsWith('frame-ancestors'))
    .join('; ')
}

export function productionCspHeader(): string {
  const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
    headers: { headers: { key: string; value: string }[] }[]
  }
  const header = config.headers
    .flatMap((rule) => rule.headers)
    .find((h) => h.key === 'Content-Security-Policy')
  if (!header) throw new Error('No Content-Security-Policy header in vercel.json')
  return header.value
}

/**
 * Mirrors the production CSP into index.html as a <meta> tag.
 *
 * Vercel already serves the policy as an HTTP header, but this app is a PWA
 * whose service worker precaches index.html — and a navigation served from
 * the Cache API carries the headers it was cached with, forever. So a
 * header-only change reaches nobody who already has the app installed: the
 * precache entry for index.html only refreshes when index.html's *content*
 * changes. That is exactly how a CSP fix for avatars shipped to production
 * and still left every existing client on the old, broken policy.
 *
 * Putting the policy in the document makes it travel with the shell, so the
 * two can never disagree. vercel.json stays the single source of truth.
 *
 * Build-only: Vite's dev server injects an inline script for React Refresh,
 * which this policy's `script-src 'self'` would block.
 */
function cspMetaTag(): Plugin {
  return {
    name: 'swole-csp-meta-tag',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: {
            'http-equiv': 'Content-Security-Policy',
            content: metaCspFrom(productionCspHeader()),
          },
          injectTo: 'head-prepend',
        },
      ]
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    cspMetaTag(),
    VitePWA({
      // New service worker versions activate automatically on next visit.
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Swole — Workout Logger',
        short_name: 'Swole',
        description: 'Log workouts, track PRs, share your session.',
        theme_color: '#131210',
        background_color: '#131210',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
})
