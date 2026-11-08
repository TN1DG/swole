import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from 'convex/react'
import usePresence from '@convex-dev/presence/react'
import { Box, Button, Dialog, DialogContent, DialogTitle, IconButton, Menu, MenuItem, Typography } from '@mui/material'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { clanRoomId } from '../../../convex/chatRoom'
import { LIMITS } from '../../../convex/validation'
import { Avatar } from '../../components/Avatar'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { errorMessage } from '../../lib/errors'
import { ChatFrame } from '../friends/ChatFrame'
import { Composer } from '../friends/Composer'
import { useMessageQueue } from '../friends/useMessageQueue'
import { ClanLeaderboardPanel } from './ClanLeaderboardPanel'
import { ClanMessageList } from './ClanMessageList'
import { ClanPingSheet } from './ClanPingSheet'

const THREAD_PAGE = 60

type RoomState = { onlineIds: string[]; typingIds: string[] }

// Hooks can't be conditional, and the server only hands a clan room's token to
// a member, so this mounts only once we know which clan that is.
function ClanPresenceWatcher({
  clanId,
  myId,
  onChange,
}: {
  clanId: string
  myId: string
  onChange: (state: RoomState) => void
}) {
  const state = usePresence(api.presence, clanRoomId(clanId), myId)
  const online = (state ?? []).filter((s) => s.online && s.userId !== myId)
  const onlineKey = online.map((s) => s.userId).join(',')
  const typingKey = online
    .filter((s) => (s.data as { typing?: boolean } | undefined)?.typing === true)
    .map((s) => s.userId)
    .join(',')

  useEffect(() => {
    onChange({
      onlineIds: onlineKey ? onlineKey.split(',') : [],
      typingIds: typingKey ? typingKey.split(',') : [],
    })
  }, [onlineKey, typingKey, onChange])
  return null
}

export function ClanChatPage() {
  const navigate = useNavigate()
  const [limit, setLimit] = useState(THREAD_PAGE)
  const liveThread = useQuery(api.clanChat.getThread, { limit })
  const me = useQuery(api.profiles.getMine)
  const members = useQuery(api.clanChat.members)
  const ping = useMutation(api.clanChat.ping)
  const respondToPing = useMutation(api.clanChat.respondToPing)
  const toggleReaction = useMutation(api.clanChat.toggleReaction)
  const markRead = useMutation(api.clanChat.markRead)
  const setTyping = useMutation(api.presence.setClanTyping)
  const kick = useMutation(api.clans.kick)
  const leave = useMutation(api.clans.leave)
  const { pending, send, retry, discard } = useMessageQueue('clan')

  // Keep showing the last result while a bigger page loads (see FriendChatPage).
  const lastThread = useRef<NonNullable<typeof liveThread> | null>(null)
  if (liveThread) lastThread.current = liveThread
  const thread = liveThread === undefined ? (lastThread.current ?? undefined) : liveThread

  const [room, setRoom] = useState<RoomState>({ onlineIds: [], typingIds: [] })
  const [pinging, setPinging] = useState(false)
  const [pingFlareKey, setPingFlareKey] = useState(0)
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const [showMembers, setShowMembers] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [viewingImage, setViewingImage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(action: () => Promise<unknown>) {
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(errorMessage(err, 'Something went wrong.'))
    }
  }

  // Mark read only while the chat is actually on screen, and only when
  // something new came in from someone else (same rule as FriendChatPage).
  const markedUpTo = useRef(0)
  useEffect(() => {
    if (!thread) return
    const latestIncoming = thread.entries.reduce((latest, e) => (e.isMine ? latest : Math.max(latest, e.ts)), 0)
    function markIfVisible() {
      if (document.visibilityState !== 'visible') return
      if (latestIncoming === 0 || latestIncoming <= markedUpTo.current) return
      markedUpTo.current = latestIncoming
      void markRead({})
    }
    markIfVisible()
    document.addEventListener('visibilitychange', markIfVisible)
    return () => document.removeEventListener('visibilitychange', markIfVisible)
  }, [thread, markRead])

  const nameOf = (id: string) => members?.find((m) => m.userId === id)?.displayName ?? 'Someone'
  const typingNames = room.typingIds.map(nameOf)
  const status =
    typingNames.length === 1
      ? `${typingNames[0]} is typing…`
      : typingNames.length > 1
        ? 'Several people are typing…'
        : room.onlineIds.length > 0
          ? `${room.onlineIds.length} online`
          : thread
            ? `${thread.memberCount} ${thread.memberCount === 1 ? 'member' : 'members'}`
            : null

  const canLoadOlder =
    thread != null && thread.entries.length >= limit && limit < LIMITS.threadEntriesMax

  const header = (
    <>
      <IconButton component={Link} to="/friends?tab=chats" aria-label="Back to chats" sx={{ color: 'text.secondary' }}>
        ←
      </IconButton>
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Avatar src={null} name={thread?.name ?? 'Clan'} size={36} />
        <Box sx={{ minWidth: 0 }}>
          <Typography noWrap sx={{ fontWeight: 600, lineHeight: 1.25 }}>
            {thread?.name ?? 'Clan chat'}
          </Typography>
          {status && (
            <Typography noWrap variant="caption" color="primary.main" sx={{ display: 'block', lineHeight: 1.2 }}>
              {status}
            </Typography>
          )}
        </Box>
      </Box>
      {thread && (
        <IconButton aria-label="Clan options" sx={{ color: 'text.secondary' }} onClick={(e) => setMenuAnchor(e.currentTarget)}>
          ⋮
        </IconButton>
      )}
    </>
  )

  if (thread === null) {
    return (
      <ChatFrame header={header}>
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="text.secondary">You're not in a clan, so there's no clan chat.</Typography>
          <Button component={Link} to="/friends?tab=clans" variant="contained" sx={{ mt: 2 }}>
            Find or create a clan
          </Button>
        </Box>
      </ChatFrame>
    )
  }

  return (
    <ChatFrame header={header}>
      {thread && me && (
        <ClanPresenceWatcher key={thread.clanId} clanId={thread.clanId} myId={me.userId} onChange={setRoom} />
      )}

      <ClanLeaderboardPanel />

      <ClanMessageList
        entries={thread?.entries}
        pending={pending}
        typingNames={typingNames}
        canLoadOlder={canLoadOlder}
        onLoadOlder={() => setLimit((l) => Math.min(l + THREAD_PAGE, LIMITS.threadEntriesMax))}
        onReact={(messageId, emoji) => void run(() => toggleReaction({ messageId, emoji }))}
        onOpenImage={setViewingImage}
        onRespondToPing={(pingId) => void run(() => respondToPing({ pingId }))}
        onRetry={retry}
        onDiscard={discard}
      />

      {error && (
        <Typography variant="body2" color="error" sx={{ flexShrink: 0, pl: 'var(--app-gutter-left)', pr: 'var(--app-gutter-right)', pb: 0.5 }}>
          {error}
        </Typography>
      )}

      <Composer
        disabled={!thread}
        canPing
        pingFlareKey={pingFlareKey}
        onSend={send}
        onPing={() => setPinging(true)}
        onTypingChange={(typing) => void setTyping({ typing })}
      />

      {pinging && (
        <ClanPingSheet
          onClose={() => setPinging(false)}
          onPing={(targetUserIds: Id<'users'>[] | undefined) => {
            setPinging(false)
            void run(async () => {
              await ping(targetUserIds ? { targetUserIds } : {})
              setPingFlareKey((k) => k + 1)
            })
          }}
        />
      )}

      <Menu anchorEl={menuAnchor} open={menuAnchor !== null} onClose={() => setMenuAnchor(null)}>
        <MenuItem
          onClick={() => {
            setMenuAnchor(null)
            setShowMembers(true)
          }}
        >
          Members
        </MenuItem>
        <MenuItem component={Link} to="/friends?tab=clans">
          Clan rankings
        </MenuItem>
        <MenuItem
          sx={{ color: 'error.main' }}
          onClick={() => {
            setMenuAnchor(null)
            setConfirmLeave(true)
          }}
        >
          Leave clan
        </MenuItem>
      </Menu>

      <Dialog open={showMembers} onClose={() => setShowMembers(false)} fullWidth maxWidth="xs">
        <DialogTitle>Members</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {(members ?? []).map((m) => (
              <Box key={m.userId} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Avatar src={m.avatarUrl} name={m.displayName} size={32} />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography noWrap sx={{ fontWeight: 500 }}>
                    {m.displayName}
                    {m.isMe && (
                      <Typography component="span" color="text.secondary">
                        {' '}
                        (you)
                      </Typography>
                    )}
                  </Typography>
                  {m.isLeader && (
                    <Typography variant="caption" color="primary.main">
                      Leader
                    </Typography>
                  )}
                </Box>
                {thread?.isLeader && !m.isMe && (
                  <Button size="small" color="inherit" onClick={() => void run(() => kick({ userId: m.userId }))}>
                    Kick
                  </Button>
                )}
              </Box>
            ))}
          </Box>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        title={`Leave ${thread?.name ?? 'the clan'}?`}
        description="Your points this month leave with you, and you can't join another clan until next month."
        confirmLabel="Leave"
        destructive
        onConfirm={() =>
          void run(async () => {
            await leave({})
            navigate('/friends?tab=clans', { replace: true })
          })
        }
      />

      <Dialog fullScreen open={viewingImage !== null} onClose={() => setViewingImage(null)}>
        <Box
          role="button"
          aria-label="Close photo"
          onClick={() => setViewingImage(null)}
          sx={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#000' }}
        >
          {viewingImage && (
            <Box component="img" src={viewingImage} alt="Photo" sx={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          )}
        </Box>
      </Dialog>
    </ChatFrame>
  )
}
