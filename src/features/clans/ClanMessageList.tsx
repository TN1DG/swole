import { useEffect, useMemo, useRef, useState } from 'react'
import type { FunctionReturnType } from 'convex/server'
import { Box, Button, Link, Typography } from '@mui/material'
import type { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Avatar } from '../../components/Avatar'
import { GlassTile } from '../../components/GlassTile'
import { MessageBubble } from '../friends/MessageBubble'
import type { PendingMessage } from '../friends/useMessageQueue'
import { countUnseen, layoutThread, timeLabel } from '../friends/threadLayout'

type Entry = NonNullable<FunctionReturnType<typeof api.clanChat.getThread>>['entries'][number]
type PingEntry = Extract<Entry, { type: 'ping' }>
type MvpEntry = Extract<Entry, { type: 'mvp' }>

const AT_BOTTOM_PX = 80
const LOAD_MORE_PX = 300

// A clan's thread. Same scrolling model as friends/MessageList (column-reverse,
// "N new messages" pill, older history on scroll-up), plus what a group needs:
// who said it, and the clan's own ping and MVP cards.
export function ClanMessageList({
  entries,
  pending,
  typingNames,
  canLoadOlder,
  onLoadOlder,
  onReact,
  onOpenImage,
  onRespondToPing,
  onRetry,
  onDiscard,
}: {
  entries: Entry[] | undefined
  pending: PendingMessage[]
  typingNames: string[]
  canLoadOlder: boolean
  onLoadOlder: () => void
  onReact: (messageId: Id<'clanMessages'>, emoji: string) => void
  onOpenImage: (url: string) => void
  onRespondToPing: (pingId: Id<'clanPings'>) => void
  onRetry: (id: string) => void
  onDiscard: (id: string) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [atBottom, setAtBottom] = useState(true)
  const [seenUpTo, setSeenUpTo] = useState(0)

  // senderId keeps two different clanmates' messages from merging into a burst.
  const laidOut = useMemo(
    () =>
      layoutThread(
        (entries ?? []).map((e) => ({ ...e, senderId: e.type === 'mvp' ? undefined : e.sender.userId })),
        Date.now(),
      ),
    [entries],
  )

  const newestTs = entries?.at(-1)?.ts ?? 0
  useEffect(() => {
    if (atBottom) setSeenUpTo(newestTs)
  }, [atBottom, newestTs])
  const unseenCount = atBottom ? 0 : countUnseen(entries ?? [], seenUpTo)

  useEffect(() => {
    if (pending.length > 0) scroller.current?.scrollTo({ top: 0 })
  }, [pending.length])

  function handleScroll() {
    const el = scroller.current
    if (!el) return
    const fromBottom = Math.abs(el.scrollTop)
    setAtBottom(fromBottom < AT_BOTTOM_PX)
    if (canLoadOlder && el.scrollHeight - el.clientHeight - fromBottom < LOAD_MORE_PX) onLoadOlder()
  }

  return (
    <Box sx={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex' }}>
      <Box
        ref={scroller}
        onScroll={handleScroll}
        sx={{
          flex: 1,
          minWidth: 0,
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          display: 'flex',
          flexDirection: 'column-reverse',
          pl: 'var(--app-gutter-left)',
          pr: 'var(--app-gutter-right)',
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', py: 1.5 }}>
          {entries === undefined ? (
            <Typography sx={{ textAlign: 'center' }} color="text.secondary">
              Loading…
            </Typography>
          ) : entries.length === 0 && pending.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
              The clan chat is quiet. Say hi, or ping the clan to the gym.
            </Typography>
          ) : null}

          {laidOut.map((item, i) => {
            if (item.kind === 'day') {
              return (
                <Typography key={item.key} variant="caption" color="text.secondary" sx={{ alignSelf: 'center', my: 1.5, fontWeight: 600 }}>
                  {item.label}
                </Typography>
              )
            }
            const { entry, joinedAbove, joinedBelow } = item
            const spacing = i === 0 ? 0 : joinedAbove ? 0.25 : 1.25

            if (entry.type === 'ping') {
              return (
                <Box key={item.key} sx={{ mt: spacing }}>
                  <PingCard entry={entry} onRespond={() => onRespondToPing(entry.ping._id)} />
                </Box>
              )
            }
            if (entry.type === 'mvp') {
              return (
                <Box key={item.key} sx={{ mt: spacing }}>
                  <MvpCard entry={entry} />
                </Box>
              )
            }

            const selected = selectedKey === item.key
            const showSender = !entry.isMine && !joinedAbove
            return (
              <Box key={item.key} sx={{ mt: spacing, display: 'flex', alignItems: 'flex-end', gap: 0.75 }}>
                {!entry.isMine && (
                  // Avatar on the last bubble of a burst, a spacer on the rest,
                  // so the bubbles line up.
                  <Box sx={{ width: 28, flexShrink: 0 }}>
                    {!joinedBelow && <Avatar src={entry.sender.avatarUrl} name={entry.sender.displayName} size={28} />}
                  </Box>
                )}
                <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  {showSender && (
                    <Typography variant="caption" color="text.secondary" sx={{ px: 0.75, mb: 0.25, fontWeight: 600 }}>
                      {entry.sender.displayName}
                    </Typography>
                  )}
                  <MessageBubble
                    message={entry.message}
                    isMine={entry.isMine}
                    joinedAbove={joinedAbove}
                    joinedBelow={joinedBelow}
                    selected={selected}
                    onSelect={() => setSelectedKey(selected ? null : item.key)}
                    onReact={(emoji) => {
                      onReact(entry.message._id, emoji)
                      setSelectedKey(null)
                    }}
                    onOpenImage={onOpenImage}
                    footer={
                      selected || !joinedBelow ? (
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25, px: 0.75 }}>
                          {timeLabel(entry.ts)}
                        </Typography>
                      ) : undefined
                    }
                  />
                </Box>
              </Box>
            )
          })}

          {pending.map((message) => (
            <Box key={message.id} sx={{ mt: 1.25, display: 'flex', flexDirection: 'column' }}>
              <MessageBubble
                message={{
                  text: message.text,
                  imageUrl: message.attachment?.url ?? null,
                  imageWidth: message.attachment?.width ?? null,
                  imageHeight: message.attachment?.height ?? null,
                  reactions: [],
                }}
                isMine
                joinedAbove={false}
                joinedBelow={false}
                selected={false}
                faded={message.status === 'sending'}
                footer={
                  message.status === 'sending' ? (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25, px: 0.75 }}>
                      Sending…
                    </Typography>
                  ) : (
                    <Typography variant="caption" color="error" sx={{ mt: 0.25, px: 0.75 }}>
                      {message.error}{' '}
                      <Link component="button" type="button" variant="caption" onClick={() => onRetry(message.id)}>
                        Tap to retry
                      </Link>
                      {' · '}
                      <Link component="button" type="button" variant="caption" onClick={() => onDiscard(message.id)}>
                        Discard
                      </Link>
                    </Typography>
                  )
                }
              />
            </Box>
          ))}

          {typingNames.length > 0 && (
            <Typography variant="caption" color="text.secondary" aria-live="polite" sx={{ mt: 1, px: 0.75, fontStyle: 'italic' }}>
              {typingLabel(typingNames)}
            </Typography>
          )}
        </Box>
      </Box>

      {!atBottom && unseenCount > 0 && (
        <Button
          variant="contained"
          size="small"
          onClick={() => scroller.current?.scrollTo({ top: 0 })}
          sx={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', borderRadius: '999px' }}
        >
          ↓ {unseenCount === 1 ? 'New message' : `${unseenCount} new messages`}
        </Button>
      )}
    </Box>
  )
}

function typingLabel(names: string[]): string {
  if (names.length === 1) return `${names[0]} is typing…`
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`
  return 'Several people are typing…'
}

function PingCard({ entry, onRespond }: { entry: PingEntry; onRespond: () => void }) {
  const { ping, sender, isMine } = entry
  const who = isMine ? 'You' : sender.displayName
  const to = ping.targets === null ? 'the clan' : ping.targets.join(', ')
  return (
    <GlassTile sx={{ p: 1.5, mx: 'auto', maxWidth: 360, width: '100%', textAlign: 'center' }}>
      <Typography sx={{ fontWeight: 600 }}>
        💪 {who} pinged {to}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        Heading to the gym · {timeLabel(entry.ts)}
      </Typography>

      {ping.going.length > 0 && (
        <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75 }}>
          <Box sx={{ display: 'flex' }}>
            {ping.going.slice(0, 5).map((g, i) => (
              <Box key={g.userId} sx={{ ml: i === 0 ? 0 : -0.75 }}>
                <Avatar src={g.avatarUrl} name={g.displayName} size={22} />
              </Box>
            ))}
          </Box>
          <Typography variant="caption" color="text.secondary">
            {ping.going.length === 1 ? `${ping.going[0]!.displayName} is going` : `${ping.going.length} going`}
          </Typography>
        </Box>
      )}

      <Box sx={{ mt: 1 }}>
        {ping.canRespond ? (
          <Button size="small" variant="contained" onClick={onRespond}>
            I'm going 🙋
          </Button>
        ) : ping.iAmGoing ? (
          <Typography variant="caption" color="primary.main" sx={{ fontWeight: 600 }}>
            You're going ✓
          </Typography>
        ) : !ping.open && !isMine ? (
          <Typography variant="caption" color="text.secondary">
            Closed
          </Typography>
        ) : null}
      </Box>
    </GlassTile>
  )
}

function MvpCard({ entry }: { entry: MvpEntry }) {
  const weekOf = new Date(entry.mvp.weekStart).toLocaleDateString([], { day: 'numeric', month: 'short', timeZone: 'UTC' })
  return (
    <GlassTile
      sx={{
        p: 1.5,
        mx: 'auto',
        maxWidth: 360,
        width: '100%',
        textAlign: 'center',
        borderColor: 'rgb(var(--color-accent-rgb) / 0.5)',
      }}
    >
      <Typography sx={{ fontSize: 28, lineHeight: 1 }}>🏆</Typography>
      <Box sx={{ mt: 0.75, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
        <Avatar src={entry.winner.avatarUrl} name={entry.winner.displayName} size={28} />
        <Typography sx={{ fontWeight: 700 }}>
          {entry.winnerIsMe ? 'You are' : `${entry.winner.displayName} is`} the week's MVP
        </Typography>
      </Box>
      <Typography variant="caption" color="text.secondary">
        Week of {weekOf} · {entry.mvp.points} points · {entry.mvp.daysTrained}{' '}
        {entry.mvp.daysTrained === 1 ? 'day' : 'days'}
      </Typography>
    </GlassTile>
  )
}
