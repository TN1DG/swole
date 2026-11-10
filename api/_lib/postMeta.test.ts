import { describe, expect, it } from 'vitest'
import { escapeHtml, injectPostMeta, postMeta, workoutSummary, type PublicPost } from './postMeta.js'

const ORIGIN = 'https://swole.day'
const SHELL = '<!doctype html>\n<html>\n  <head>\n    <meta charset="UTF-8" />\n    <title>Swole</title>\n  </head>\n  <body><div id="root"></div></body>\n</html>'

const POST: PublicPost = {
  caption: 'New bench PB',
  author: { displayName: 'Sam' },
  photoUrl: null,
  cardUrl: 'https://x.convex.cloud/api/storage/card',
  workoutName: 'Push Day',
  durationMs: 3_600_000,
  volumeKg: 12340.4,
  setCount: 18,
  prCount: 2,
  exerciseNames: ['Bench Press'],
}

const tag = (html: string, attr: string, name: string) =>
  html.match(new RegExp(`<meta ${attr}="${name}" content="([^"]*)"`))?.[1]

describe('postMeta', () => {
  it('reads like a post on X: author, caption, picture', () => {
    const meta = postMeta({ ...POST, photoUrl: 'https://x.convex.cloud/api/storage/abc' }, ORIGIN, 'p1')
    expect(meta).toEqual({
      title: 'Sam on Swole',
      description: 'New bench PB',
      url: 'https://swole.day/p/p1',
      image: 'https://x.convex.cloud/api/storage/abc',
      twitterCard: 'summary_large_image',
      type: 'article',
    })
  })

  it('uses the workout card when there is no photo, and the stats when there is no caption', () => {
    const meta = postMeta({ ...POST, caption: null }, ORIGIN, 'p1')
    expect(meta.image).toBe('https://x.convex.cloud/api/storage/card')
    expect(meta.twitterCard).toBe('summary_large_image')
    expect(meta.description).toBe('Push Day · 12,340 kg · 18 sets · 2 PRs')
  })

  it('falls back to the small Swole card for an older post with no picture', () => {
    const meta = postMeta({ ...POST, cardUrl: null }, ORIGIN, 'p1')
    expect(meta.image).toBe('https://swole.day/pwa-512.png')
    expect(meta.twitterCard).toBe('summary')
    expect(meta.title).toBe('Sam on Swole')
  })

  it('gives anything that isn’t a public post a plain Swole preview', () => {
    const meta = postMeta(null, ORIGIN, 'secret')
    expect(meta.title).toBe('Swole')
    expect(meta.twitterCard).toBe('summary')
    expect(meta.image).toBe('https://swole.day/pwa-512.png')
  })
})

describe('workoutSummary', () => {
  it('skips what a post doesn’t have', () => {
    expect(workoutSummary({ workoutName: 'Legs', volumeKg: null, setCount: 4, prCount: 0 })).toBe('Legs · 4 sets')
    expect(workoutSummary({ workoutName: 'Legs', volumeKg: 100, setCount: 1, prCount: 1 })).toBe('Legs · 100 kg · 1 sets · 1 PR')
  })
})

describe('injectPostMeta', () => {
  it('replaces the bare title with the preview tags', () => {
    const html = injectPostMeta(SHELL, postMeta(POST, ORIGIN, 'p1'))
    expect(html).toContain('<title>Sam on Swole</title>')
    expect(html).not.toContain('<title>Swole</title>')
    expect(tag(html, 'property', 'og:description')).toBe('New bench PB')
    expect(tag(html, 'name', 'twitter:card')).toBe('summary_large_image')
    expect(tag(html, 'property', 'og:image')).toBe('https://x.convex.cloud/api/storage/card')
    expect(html).toContain('<div id="root"></div>')
  })

  it('escapes a caption so it can never become markup', () => {
    const caption = `"><script>alert('x')</script> & more`
    const html = injectPostMeta(SHELL, postMeta({ ...POST, caption }, ORIGIN, 'p1'))
    expect(html).not.toContain('<script>')
    expect(tag(html, 'property', 'og:description')).toBe(escapeHtml(caption))
    expect(escapeHtml(caption)).toBe('&quot;&gt;&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt; &amp; more')
  })

  it('treats $ patterns in a caption literally', () => {
    const html = injectPostMeta(SHELL, postMeta({ ...POST, caption: "$& $' $1" }, ORIGIN, 'p1'))
    expect(tag(html, 'property', 'og:description')).toBe('$&amp; $&#39; $1')
  })

  it('adds the tags to the head when the shell has no title', () => {
    const html = injectPostMeta(SHELL.replace('    <title>Swole</title>\n', ''), postMeta(POST, ORIGIN, 'p1'))
    expect(html).toMatch(/<title>Sam on Swole<\/title>[\s\S]*<\/head>/)
  })

  it('URL-encodes the id it puts in links', () => {
    expect(postMeta(null, ORIGIN, 'a"b').url).toBe('https://swole.day/p/a%22b')
  })
})
