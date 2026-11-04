import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery } from 'convex/react'
import usePresence from '@convex-dev/presence/react'
import { Box, Dialog, Typography } from '@mui/material'
import type { Id } from '../../../convex/_generated/dataModel'
import { api } from '../../../convex/_generated/api'
import { chatRoomId } from '../../../convex/chatRoom'
import { LIMITS } from '../../../convex/validation'
import { errorMessage } from '../../lib/errors'
import { ChallengeComposeDialog } from './ChallengeComposeDialog'
import { ChatShell } from './ChatShell'
import { Composer } from './Composer'
import { MessageList } from './MessageList'
import { useMessageQueue } from './useMessageQueue'

const THREAD_PAGE = 60

type FriendPresence = { online: boolean; typing: boolean }
const OFFLINE: FriendPresence = { online: false, typing: false }

// A component rather than a hook call in the page because hooks can't be
// conditional, and it must only run for an actual friend: the server refuses
// anyone else's heartbeat.
function PresenceWatcher({
  myId,
  friendId,
  onChange,
}: {
  myId: string
  friendId: string
  onChange: (presence: FriendPresence) => void
}) {
  const state = usePresence(api.presence, chatRoomId(myId, friendId), myId)
  const friend = state?.find((s) => s.userId === friendId)
  const online = friend?.online ?? false
  const typing = online && (friend?.data as { typing?: boolean } | undefined)?.typing === true

  useEffect(() => {
    onChange({ online, typing })
  }, [online, typing, onChange])

  return null
}

export function FriendChatPage() {
  const { userId } = useParams<{ userId: string }>()
  const friendId = userId as Id<'users'>
  const navigate = useNavigate()

  const [limit, setLimit] = useState(THREAD_PAGE)
  const liveThread = useQuery(api.friendThread.getThread, { friendUserId: friendId, limit })
  const me = useQuery(api.profiles.getMine)
  const friends = useQuery(api.friends.myFriends)
  const friendReadAt = useQuery(api.friendThread.friendReadAt, { friendUserId: friendId })
  const sendPing = useMutation(api.pings.send)
  const markRead = useMutation(api.friendThread.markRead)
  const toggleReaction = useMutation(api.messages.toggleReaction)
  const setTyping = useMutation(api.presence.setTyping)
  const { pending, send, retry, discard } = useMessageQueue(friendId)

  // Raising `limit` makes useQuery return undefined until the larger result
  // lands. Showing the last result meanwhile is what stops the whole conversation
  // blinking out each time older messages load. Tagged with the friend, so
  // switching chats can't show the previous person's messages.
  const lastThread = useRef<{ friendId: string; thread: NonNullable<typeof liveThread> } | null>(null)
  if (liveThread !== undefined) lastThread.current = { friendId, thread: liveThread }
  const thread =
    liveThread ?? (lastThread.current?.friendId === friendId ? lastThread.current.thread : undefined)

  const friend = friends?.find((f) => f.userId === friendId)
  const friendName = friend?.displayName ?? 'them'
  const notFriends = friends !== undefined && friend === undefined

  const [presence, setPresence] = useState<FriendPresence>(OFFLINE)
  const [composingChallenge, setComposingChallenge] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pingFlareKey, setPingFlareKey] = useState(0)
  const [viewingImage, setViewingImage] = useState<string | null>(null)

  const hasPendingOutgoingPing =
    thread?.some((e) => e.type === 'ping' && e.isMine && e.ping.acknowledgedAt === null) ?? false

  const canLoadOlder =
    thread !== undefined && thread.length >= limit && limit < LIMITS.threadEntriesMax

  // Only marks read while actually on screen: a chat left open in a background
  // tab must not tell the friend their message was read. Skipped when nothing new
  // has come in, so your own sends don't each cost a write.
  const markedUpTo = useRef(0)
  useEffect(() => {
    markedUpTo.current = 0
  }, [friendId])
  useEffect(() => {
    if (!thread) return
    const latestIncoming = thread.reduce((latest, e) => (e.isMine ? latest : Math.max(latest, e.ts)), 0)
    function markIfVisible() {
      if (document.visibilityState !== 'visible') return
      if (latestIncoming === 0 || latestIncoming <= markedUpTo.current) return
      markedUpTo.current = latestIncoming
      void markRead({ friendUserId: friendId })
    }
    markIfVisible()
    document.addEventListener('visibilitychange', markIfVisible)
    return () => document.removeEventListener('visibilitychange', markIfVisible)
  }, [thread, friendId, markRead])

  async function run(action: () => Promise<unknown>) {
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(errorMessage(err, 'Something went wrong.'))
    }
  }

  return (
    <ChatShell
      friendId={friendId}
      friendName={friend?.displayName ?? '…'}
      avatarUrl={friend?.avatarUrl}
      isFriend={friend !== undefined}
      status={presence.typing ? 'typing…' : presence.online ? 'Active now' : null}
      onLeave={() => navigate('/friends?tab=chats')}
    >
      {friend && me && (
        <PresenceWatcher key={friendId} myId={me.userId} friendId={friendId} onChange={setPresence} />
      )}

      <MessageList
        thread={thread}
        pending={pending}
        friendName={friendName}
        friendReadAt={friendReadAt ?? null}
        friendTyping={presence.typing}
        canLoadOlder={canLoadOlder}
        onLoadOlder={() => setLimit((l) => Math.min(l + THREAD_PAGE, LIMITS.threadEntriesMax))}
        onReact={(messageId, emoji) => void run(() => toggleReaction({ messageId, emoji }))}
        onOpenImage={setViewingImage}
        onRetry={retry}
        onDiscard={discard}
      />

      {error && (
        <Typography
          variant="body2"
          color="error"
          sx={{ flexShrink: 0, pl: 'var(--app-gutter-left)', pr: 'var(--app-gutter-right)', pb: 0.5 }}
        >
          {error}
        </Typography>
      )}

      {notFriends ? (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ flexShrink: 0, textAlign: 'center', pt: 2, pb: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          You're no longer friends, so you can't send messages here.
        </Typography>
      ) : (
        <Composer
          disabled={friend === undefined}
          canPing={!hasPendingOutgoingPing}
          pingFlareKey={pingFlareKey}
          onSend={send}
          onPing={() =>
            void run(async () => {
              await sendPing({ toUserId: friendId })
              setPingFlareKey((k) => k + 1)
            })
          }
          onChallenge={() => setComposingChallenge(true)}
          onTypingChange={(typing) => void setTyping({ friendUserId: friendId, typing })}
        />
      )}

      {composingChallenge && (
        <ChallengeComposeDialog
          friendId={friendId}
          friendName={friendName}
          onClose={() => setComposingChallenge(false)}
        />
      )}

      <Dialog fullScreen open={viewingImage !== null} onClose={() => setViewingImage(null)}>
        <Box
          role="button"
          aria-label="Close photo"
          onClick={() => setViewingImage(null)}
          sx={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: '#000',
          }}
        >
          {viewingImage && (
            <Box
              component="img"
              src={viewingImage}
              alt="Photo"
              sx={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
            />
          )}
        </Box>
      </Dialog>
    </ChatShell>
  )
}
