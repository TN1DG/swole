// Pure decisions about how a chat thread reads: what groups together, where the
// day dividers and timestamps go, and which messages render as big emoji.

// Consecutive messages from one person inside this window read as one burst.
const GROUP_WINDOW_MS = 3 * 60 * 1000
const BIG_EMOJI_MAX = 3

type LayoutEntry = { key: string; type: string; ts: number; isMine: boolean }

export type ThreadItem<E extends LayoutEntry> =
  | { kind: 'day'; key: string; label: string }
  | {
      kind: 'entry'
      key: string
      entry: E
      // Joined to the message above/below it: same sender, same burst.
      joinedAbove: boolean
      joinedBelow: boolean
    }

function startOfDay(ts: number): number {
  const d = new Date(ts)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

export function dayLabel(ts: number, now: number): string {
  const d = new Date(ts)
  const days = Math.round((startOfDay(now) - startOfDay(ts)) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return d.toLocaleDateString([], { weekday: 'long' })
  return d.toLocaleDateString([], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(d.getFullYear() !== new Date(now).getFullYear() ? { year: 'numeric' } : {}),
  })
}

export function timeLabel(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// For the conversation list: a time today, a weekday this week, otherwise a date.
export function conversationTimeLabel(ts: number, now: number): string {
  const days = Math.round((startOfDay(now) - startOfDay(ts)) / 86_400_000)
  if (days === 0) return timeLabel(ts)
  if (days === 1) return 'Yesterday'
  const d = new Date(ts)
  if (days < 7) return d.toLocaleDateString([], { weekday: 'short' })
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' })
}

function joins(a: LayoutEntry | undefined, b: LayoutEntry | undefined): boolean {
  if (!a || !b) return false
  // Pings and challenges are events in their own right, not part of a burst.
  if (a.type !== 'message' || b.type !== 'message') return false
  return (
    a.isMine === b.isMine &&
    b.ts - a.ts <= GROUP_WINDOW_MS &&
    startOfDay(a.ts) === startOfDay(b.ts)
  )
}

export function layoutThread<E extends LayoutEntry>(entries: E[], now: number): ThreadItem<E>[] {
  const items: ThreadItem<E>[] = []
  entries.forEach((entry, i) => {
    const previous = entries[i - 1]
    if (!previous || startOfDay(previous.ts) !== startOfDay(entry.ts)) {
      items.push({ kind: 'day', key: `day-${entry.key}`, label: dayLabel(entry.ts, now) })
    }
    items.push({
      kind: 'entry',
      key: entry.key,
      entry,
      joinedAbove: joins(previous, entry),
      joinedBelow: joins(entry, entries[i + 1]),
    })
  })
  return items
}

// Whether the text is nothing but a few emoji, which texting apps show large.
// Not just \p{Emoji}, which also matches plain digits, '#' and '*'.
const EMOJI_ONLY =
  /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|‍|️|\s)+$/u

export function isBigEmoji(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed || !EMOJI_ONLY.test(trimmed)) return false
  const graphemes = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(trimmed)]
  return graphemes.filter((g) => g.segment.trim()).length <= BIG_EMOJI_MAX
}
