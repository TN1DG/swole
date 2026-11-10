/**
 * The fields of convex/feed.ts:publicPost that link previews use. Declared
 * here rather than derived from convex/_generated/api: that would pull the
 * whole backend into this Node project's typecheck. convex/feed.test.ts
 * pins publicPost's shape, so a rename there fails a test, not a preview.
 */
export type PublicPost = {
  caption: string | null
  author: { displayName: string }
  photoUrl: string | null
  cardUrl: string | null
  workoutName: string | null
  durationMs: number | null
  volumeKg: number | null
  setCount: number | null
  prCount: number | null
  exerciseNames: string[]
}

export type PageMeta = {
  title: string
  description: string
  url: string
  image: string
  /** summary_large_image for a post, the small card for the generic page. */
  twitterCard: 'summary_large_image' | 'summary'
  type: 'article' | 'website'
}

const GENERIC_DESCRIPTION = 'Log workouts, chase PRs and lift with your friends.'

/** "12,340 kg" — link previews have no viewer, so they read in kilograms. */
function formatKg(kg: number) {
  return `${Math.round(kg).toLocaleString('en-US')} kg`
}

/** "Push Day · 12,340 kg · 18 sets · 2 PRs". */
export function workoutSummary(post: Pick<PublicPost, 'workoutName' | 'volumeKg' | 'setCount' | 'prCount'>) {
  const parts = [
    post.workoutName,
    post.volumeKg !== null ? formatKg(post.volumeKg) : null,
    post.setCount !== null ? `${post.setCount} sets` : null,
    post.prCount ? `${post.prCount} PR${post.prCount > 1 ? 's' : ''}` : null,
  ]
  return parts.filter(Boolean).join(' · ')
}

/**
 * What a link to /p/:id unfurls to. Like a post on X: the author as the
 * title, their caption as the text, and their photo as the picture, or the
 * workout card when they posted none (rendered by the composer; posts from
 * before that fall back to the Swole icon). Anything that isn't a public
 * post gets a plain Swole preview, so a friends-only caption never leaves.
 */
export function postMeta(post: PublicPost | null, origin: string, postId: string): PageMeta {
  const url = `${origin}/p/${encodeURIComponent(postId)}`
  if (!post) {
    return {
      title: 'Swole',
      description: GENERIC_DESCRIPTION,
      url,
      image: `${origin}/pwa-512.png`,
      twitterCard: 'summary',
      type: 'website',
    }
  }
  const picture = post.photoUrl ?? post.cardUrl
  return {
    title: `${post.author.displayName} on Swole`,
    description: post.caption ?? (workoutSummary(post) || GENERIC_DESCRIPTION),
    url,
    image: picture ?? `${origin}/pwa-512.png`,
    twitterCard: picture ? 'summary_large_image' : 'summary',
    type: 'article',
  }
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Puts the preview tags into the app's own index.html, replacing its bare
 * <title>. People get the normal app; crawlers, which never run its
 * JavaScript, read the tags.
 */
export function injectPostMeta(html: string, meta: PageMeta): string {
  const e = escapeHtml
  const tags = [
    `<title>${e(meta.title)}</title>`,
    `<meta name="description" content="${e(meta.description)}" />`,
    `<meta property="og:site_name" content="Swole" />`,
    `<meta property="og:type" content="${meta.type}" />`,
    `<meta property="og:title" content="${e(meta.title)}" />`,
    `<meta property="og:description" content="${e(meta.description)}" />`,
    `<meta property="og:url" content="${e(meta.url)}" />`,
    `<meta property="og:image" content="${e(meta.image)}" />`,
    `<meta name="twitter:card" content="${meta.twitterCard}" />`,
    `<meta name="twitter:title" content="${e(meta.title)}" />`,
    `<meta name="twitter:description" content="${e(meta.description)}" />`,
    `<meta name="twitter:image" content="${e(meta.image)}" />`,
  ].join('\n    ')

  const titled = /<title>[^<]*<\/title>/
  return titled.test(html) ? html.replace(titled, () => tags) : html.replace('</head>', () => `    ${tags}\n  </head>`)
}
