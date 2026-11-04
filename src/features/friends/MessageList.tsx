import { useEffect, useMemo, useRef, useState } from 'react'
import type { FunctionReturnType } from 'convex/server'
import { Box, Button, Link, Typography } from '@mui/material'
import type { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { ChallengeCard } from './ChallengeCard'
import { MessageBubble } from './MessageBubble'
import { PingBubble } from './PingBubble'
import type { PendingMessage } from './useMessageQueue'
import { countUnseen, layoutThread, timeLabel } from './threadLayout'

type ThreadEntry = FunctionReturnType<typeof api.friendThread.getThread>[number]

// Past this from the bottom you're reading history, not following along.
const AT_BOTTOM_PX = 80
// How close to the top of what's loaded before fetching more.
const LOAD_MORE_PX = 300

export function MessageList({
  thread,
  pending,
  friendName,
  friendAvatarUrl,
  friendReadAt,
  friendTyping,
  canLoadOlder,
  onLoadOlder,
  onReact,
  onOpenImage,
  onRetry,
  onDiscard,
}: {
  thread: ThreadEntry[] | undefined
  pending: PendingMessage[]
  friendName: string
  friendAvatarUrl?: string | null
  friendReadAt: number | null
  friendTyping: boolean
  canLoadOlder: boolean
  onLoadOlder: () => void
  onReact: (messageId: Id<'messages'>, emoji: string) => void
  onOpenImage: (url: string) => void
  onRetry: (id: string) => void
  onDiscard: (id: string) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [atBottom, setAtBottom] = useState(true)
  // How far you'd caught up when you were last at the bottom. While you're
  // reading older messages, new ones don't yank you down; the pill counts them.
  const [seenUpTo, setSeenUpTo] = useState(0)

  const items = useMemo(() => layoutThread(thread ?? [], Date.now()), [thread])

  const lastRead = useMemo(() => {
    if (friendReadAt === null || !thread) return null
    for (let i = thread.length - 1; i >= 0; i--) {
      const entry = thread[i]!
      if (entry.type === 'message' && entry.isMine && entry.ts <= friendReadAt) return entry.key
    }
    return null
  }, [thread, friendReadAt])

  const newestTs = thread?.at(-1)?.ts ?? 0
  useEffect(() => {
    if (atBottom) setSeenUpTo(newestTs)
  }, [atBottom, newestTs])
  const unseenCount = atBottom ? 0 : countUnseen(thread ?? [], seenUpTo)

  // Sending is a clear "I'm back in the conversation", wherever you'd scrolled.
  useEffect(() => {
    if (pending.length > 0) scroller.current?.scrollTo({ top: 0 })
  }, [pending.length])

  function handleScroll() {
    const el = scroller.current
    if (!el) return
    // column-reverse: scrollTop is 0 at the bottom and goes negative going up.
    const fromBottom = Math.abs(el.scrollTop)
    const nowAtBottom = fromBottom < AT_BOTTOM_PX
    setAtBottom(nowAtBottom)
    if (canLoadOlder && el.scrollHeight - el.clientHeight - fromBottom < LOAD_MORE_PX) {
      onLoadOlder()
    }
  }

  return (
    <Box sx={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex' }}>
      {/* column-reverse pins the list to its bottom edge with no scroll code at
          all: the browser holds that position through new messages, older
          history arriving above, images loading, and the keyboard opening. */}
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
          {thread === undefined ? (
            <Typography sx={{ textAlign: 'center' }} color="text.secondary">
              Loading…
            </Typography>
          ) : thread.length === 0 && pending.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
              Nothing here yet. Say hi, send a ping, or start a challenge.
            </Typography>
          ) : null}

          {items.map((item, i) => {
            if (item.kind === 'day') {
              return (
                <Typography
                  key={item.key}
                  variant="caption"
                  color="text.secondary"
                  sx={{ alignSelf: 'center', my: 1.5, fontWeight: 600 }}
                >
                  {item.label}
                </Typography>
              )
            }

            const { entry, joinedAbove, joinedBelow } = item
            const spacing = i === 0 ? 0 : joinedAbove ? 0.25 : 1.25

            if (entry.type === 'challenge') {
              return (
                <Box key={item.key} sx={{ mt: spacing }}>
                  <ChallengeCard
                    challenge={entry.challenge}
                    friendName={friendName}
                    friendAvatarUrl={friendAvatarUrl}
                  />
                </Box>
              )
            }
            if (entry.type === 'ping') {
              return (
                <Box key={item.key} sx={{ mt: spacing, display: 'flex', flexDirection: 'column' }}>
                  <PingBubble ping={entry.ping} />
                </Box>
              )
            }

            const selected = selectedKey === item.key
            const showRead = lastRead === item.key
            const showTime = selected || !joinedBelow
            return (
              <Box key={item.key} sx={{ mt: spacing, display: 'flex', flexDirection: 'column' }}>
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
                    showTime || showRead ? (
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25, px: 0.75 }}>
                        {timeLabel(entry.ts)}
                        {showRead && ' · Read'}
                      </Typography>
                    ) : undefined
                  }
                />
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

          {friendTyping && (
            <Typography
              variant="caption"
              color="text.secondary"
              aria-live="polite"
              sx={{ mt: 1, px: 0.75, fontStyle: 'italic' }}
            >
              {friendName} is typing…
            </Typography>
          )}
        </Box>
      </Box>

      {!atBottom && unseenCount > 0 && (
        <Button
          variant="contained"
          size="small"
          onClick={() => {
            scroller.current?.scrollTo({ top: 0 })
          }}
          sx={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', borderRadius: '999px' }}
        >
          ↓ {unseenCount === 1 ? 'New message' : `${unseenCount} new messages`}
        </Button>
      )}
    </Box>
  )
}
