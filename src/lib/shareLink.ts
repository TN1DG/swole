/**
 * Shares a link through the OS share sheet, or copies it where there isn't
 * one (most desktop browsers). Returns what happened so the caller can say
 * "Link copied"; a dismissed sheet or a blocked clipboard is 'none', since
 * the person chose not to, or the link is on screen anyway.
 */
export async function shareLink(data: { url: string; title?: string; text?: string }): Promise<'shared' | 'copied' | 'none'> {
  try {
    if (navigator.share) {
      await navigator.share(data)
      return 'shared'
    }
    await navigator.clipboard.writeText(data.url)
    return 'copied'
  } catch {
    return 'none'
  }
}

/** The public, previewable address of a feed post (see api/post-page.ts). */
export function postLink(postId: string, origin = window.location.origin): string {
  return `${origin}/p/${postId}`
}
