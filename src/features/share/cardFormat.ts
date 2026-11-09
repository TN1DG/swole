/**
 * The shape of an exported card. Both are exported 1080px wide (see
 * useCardExport), so these give 1080×1920 and 1080×1080 PNGs.
 *
 * 'story'  — 9:16, the size Instagram and Snapchat Stories both use.
 * 'square' — 1:1, for feed posts and chats.
 */
export type CardFormat = 'story' | 'square'

export const FORMAT_ASPECT: Record<CardFormat, string> = {
  story: '9 / 16',
  square: '1 / 1',
}

export const FORMAT_OPTIONS: { value: CardFormat; label: string }[] = [
  { value: 'story', label: 'Story' },
  { value: 'square', label: 'Square' },
]

export const FORMAT_HINTS: Record<CardFormat, string> = {
  story: 'Instagram & Snapchat Stories.',
  square: 'Feed posts and chats.',
}

/**
 * Where the card's content may sit, as top/bottom offsets of the frame's
 * HEIGHT (applied as `top`/`bottom` on an absolutely-positioned box — padding
 * percentages would be relative to the width instead).
 *
 * Stories put the profile row and close button over the top ~14% and the
 * reply bar over the bottom ~20%, on both Instagram and Snapchat, so a story
 * card keeps its stats out of those bands. A square card has no overlays.
 */
export const FORMAT_SAFE_AREA: Record<CardFormat, { top: string; bottom: string }> = {
  story: { top: '14%', bottom: '20%' },
  square: { top: '12px', bottom: '12px' },
}

/** How many exercise lines fit under the stats before "+ N more". */
export const FORMAT_MAX_LINES: Record<CardFormat, number> = {
  story: 6,
  square: 3,
}

/** e.g. "swole-push-day-story.png". */
export function cardFileName(name: string, format: CardFormat): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `swole-${slug || 'workout'}-${format}.png`
}
