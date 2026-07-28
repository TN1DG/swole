import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { Badge, Box, Button, IconButton, TextField, Typography } from '@mui/material'
import { api } from '../../../convex/_generated/api'
import { FirstVisitTip } from '../../components/FirstVisitTip'
import { TIER_LABELS } from '../../lib/tierLabels'
import { ConsistencyRing } from '../../components/ConsistencyRing'
import { errorMessage } from '../../lib/errors'
import { GlassTile } from '../../components/GlassTile'
import { SegmentedControl } from '../../components/SegmentedControl'
import { Avatar } from '../../components/Avatar'
import { SwoleCoin } from '../../components/SwoleCoin'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { usePeriodStart, type LeaderboardPeriod } from '../../lib/period'
import { FeedTab } from '../feed/FeedTab'

type Friends = FunctionReturnType<typeof api.friends.myFriends>
type IncomingRequests = FunctionReturnType<typeof api.friends.myIncomingRequests>
type OutgoingRequests = FunctionReturnType<typeof api.friends.myOutgoingRequests>

// A username is always set by the time this page is reachable — OnboardingGate
// (src/features/onboarding/OnboardingGate.tsx) captures it during the welcome
// carousel before any route becomes available.
export function FriendsPage() {
  const incoming = useQuery(api.friends.myIncomingRequests)
  const outgoing = useQuery(api.friends.myOutgoingRequests)
  const friends = useQuery(api.friends.myFriends)

  const sendFriendRequest = useMutation(api.friends.sendFriendRequest)

  const [tab, setTab] = useState<'feed' | 'leaderboard' | 'friends'>('feed')
  const [searchTerm, setSearchTerm] = useState('')
  const [committedSearch, setCommittedSearch] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const searchResult = useQuery(
    api.friends.resolveUsername,
    committedSearch ? { username: committedSearch } : 'skip',
  )

  function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setActionError(null)
    setCommittedSearch(searchTerm.trim())
  }

  async function runAction(action: () => Promise<unknown>) {
    setActionError(null)
    try {
      await action()
    } catch (err) {
      setActionError(errorMessage(err, 'Something went wrong.'))
    }
  }

  const alreadyFriends = searchResult
    ? (friends ?? []).some((f) => f.userId === searchResult.userId)
    : false
  const alreadyPending = searchResult
    ? (outgoing ?? []).some((r) => r.to.userId === searchResult.userId)
    : false

  return (
    <Box>
      <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
        Friends
      </Typography>
      <FirstVisitTip tabKey="friends" />

      <Box component="form" onSubmit={handleSearch} sx={{ mt: 2, display: 'flex', gap: 1 }}>
        <TextField value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Add by username" fullWidth />
        <Button type="submit" variant="outlined" color="inherit" sx={{ flexShrink: 0 }}>
          Search
        </Button>
      </Box>

      {committedSearch && (
        <GlassTile sx={{ mt: 1.5, p: 1.5 }}>
          {searchResult === undefined ? (
            <Typography variant="body2" color="text.secondary">
              Searching…
            </Typography>
          ) : searchResult === null ? (
            <Typography variant="body2" color="text.secondary">
              No user with that username.
            </Typography>
          ) : searchResult.isMe ? (
            <Typography variant="body2" color="text.secondary">
              That's you!
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography noWrap sx={{ fontWeight: 500 }}>
                  {searchResult.displayName}
                </Typography>
                <Typography noWrap variant="body2" color="text.secondary">
                  @{searchResult.username}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
                <Button component={Link} to={`/friends/${searchResult.userId}`} variant="outlined" color="inherit" size="small">
                  View
                </Button>
                {alreadyFriends ? (
                  <Typography variant="body2" color="text.secondary" sx={{ px: 1.5, py: 0.75 }}>
                    Friends
                  </Typography>
                ) : alreadyPending ? (
                  <Typography variant="body2" color="text.secondary" sx={{ px: 1.5, py: 0.75 }}>
                    Pending
                  </Typography>
                ) : (
                  <Button
                    variant="contained"
                    size="small"
                    onClick={() => runAction(() => sendFriendRequest({ username: searchResult.username! }))}
                  >
                    Add Friend
                  </Button>
                )}
              </Box>
            </Box>
          )}
        </GlassTile>
      )}

      {actionError && (
        <Typography variant="body2" color="error" sx={{ mt: 1.5 }}>
          {actionError}
        </Typography>
      )}

      <Box sx={{ mt: 2 }}>
        <SegmentedControl
          value={tab}
          onChange={setTab}
          // Three short labels rather than a sixth bottom tab — five tabs
          // already ellipsize "Exercises" on a 360px phone.
          options={[
            { value: 'feed', label: 'Feed' },
            { value: 'leaderboard', label: 'Board' },
            { value: 'friends', label: 'Friends', badge: incoming?.length || undefined },
          ]}
        />
      </Box>

      {tab === 'feed' ? (
        <FeedTab />
      ) : tab === 'leaderboard' ? (
        <LeaderboardTab />
      ) : (
        <FriendsTab friends={friends} incoming={incoming} outgoing={outgoing} runAction={runAction} />
      )}
    </Box>
  )
}

function LeaderboardTab() {
  const [period, setPeriod] = useState<LeaderboardPeriod>('week')
  const periodStartMs = usePeriodStart(period)
  const leaderboard = useQuery(api.friends.leaderboard, { period, periodStartMs })

  return (
    <>
      <Box sx={{ mt: 2 }}>
        <SegmentedControl
          value={period}
          onChange={setPeriod}
          options={[
            { value: 'week', label: 'This week' },
            { value: 'month', label: 'This month' },
          ]}
        />
      </Box>
      <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
        {period === 'week' ? 'Mon–Sun · UTC' : 'Calendar month · UTC'}
      </Typography>
      {leaderboard === undefined ? (
        <Typography sx={{ mt: 1.5, textAlign: 'center' }} color="text.secondary">
          Loading…
        </Typography>
      ) : (
        <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {leaderboard.map((entry, i) => (
            <Link key={entry.userId} to={`/friends/${entry.userId}`} style={{ textDecoration: 'none', display: 'block' }}>
              {/* Five things compete for one phone-width row here (rank,
                  streak ring, avatar, name, score), so the gutters are 8px
                  and the rank column is only as wide as two digits — all of
                  it buys width for the name, the only flexible column. */}
              <GlassTile
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 1.5,
                  py: 1.5,
                  color: 'text.primary',
                  ...(entry.isMe && { borderColor: 'rgb(193 84 31 / 0.4)' }),
                }}
              >
                <Typography sx={{ width: 16, flexShrink: 0, textAlign: 'center', fontWeight: 'bold' }} variant="body2" color="text.secondary">
                  {i + 1}
                </Typography>
                <ConsistencyRing streakWeeks={entry.streakWeeks} capped={entry.streakCapped} size={36} />
                <Avatar src={entry.avatarUrl} name={entry.displayName} size={32} />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography noWrap sx={{ fontWeight: 500 }}>
                    {entry.displayName}
                    {entry.isMe && <Typography component="span" color="text.secondary"> (you)</Typography>}
                  </Typography>
                  {TIER_LABELS[entry.tier] && (
                    <Typography noWrap variant="caption" color="primary.main">
                      {TIER_LABELS[entry.tier]}
                    </Typography>
                  )}
                </Box>
                <Box sx={{ flexShrink: 0, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {/* The coin stands in for the word "pts" rather than sitting
                      beside it — this row already fits five things across a
                      360px phone (see docs/mobile-responsiveness.md). */}
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
                    <SwoleCoin size={16} title="points" />
                    <Typography sx={{ fontWeight: 'bold' }}>{entry.points}</Typography>
                  </Box>
                  {/* Days trained, not kilograms — it's what the score is
                      actually driven by now, so showing volume here would
                      point people at the wrong lever. */}
                  <Typography variant="caption" color="text.secondary">
                    {entry.daysTrained} {entry.daysTrained === 1 ? 'day' : 'days'}
                  </Typography>
                </Box>
              </GlassTile>
            </Link>
          ))}
        </Box>
      )}
    </>
  )
}

// One row in My Friends. Chat and Remove used to be full-width text buttons,
// which together with the avatar left roughly 80px for the name on a 360px
// phone — most display names were truncated to a few characters. As icon
// buttons they cost about a third of that.
//
// Remove is destructive and previously fired with no confirmation at all;
// shrinking its hit area without adding one would have turned a mis-tap into
// a silently deleted friendship.
function FriendRow({
  friend,
  hasUnread,
  onRemove,
}: {
  friend: Friends[number]
  hasUnread: boolean
  onRemove: () => void
}) {
  const [confirmOpen, setConfirmOpen] = useState(false)

  return (
    <GlassTile sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1 }}>
      <Avatar src={friend.avatarUrl} name={friend.displayName} size={36} />
      <Typography
        component={Link}
        to={`/friends/${friend.userId}`}
        noWrap
        sx={{ minWidth: 0, flex: 1, fontWeight: 500, color: 'text.primary', textDecoration: 'none' }}
      >
        {friend.displayName}
      </Typography>
      <Badge color="error" variant="dot" invisible={!hasUnread} sx={{ flexShrink: 0 }}>
        <IconButton
          component={Link}
          to={`/friends/${friend.userId}/chat`}
          aria-label={`Chat with ${friend.displayName}`}
          sx={{ border: '1px solid', borderColor: 'divider', fontSize: '1.125rem' }}
        >
          💬
        </IconButton>
      </Badge>
      <IconButton
        aria-label={`Remove ${friend.displayName}`}
        size="small"
        sx={{ flexShrink: 0, color: 'text.secondary' }}
        onClick={() => setConfirmOpen(true)}
      >
        ✕
      </IconButton>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={`Remove ${friend.displayName}?`}
        description="You'll disappear from each other's friends list and leaderboard. You can send a new request any time."
        confirmLabel="Remove"
        destructive
        onConfirm={onRemove}
      />
    </GlassTile>
  )
}

function FriendsTab({
  friends,
  incoming,
  outgoing,
  runAction,
}: {
  friends: Friends | undefined
  incoming: IncomingRequests | undefined
  outgoing: OutgoingRequests | undefined
  runAction: (action: () => Promise<unknown>) => Promise<void>
}) {
  const acceptFriendRequest = useMutation(api.friends.acceptFriendRequest)
  const declineFriendRequest = useMutation(api.friends.declineFriendRequest)
  const removeFriend = useMutation(api.friends.removeFriend)
  // Separate from myFriends so the chat page (which also loads myFriends)
  // doesn't pay for unread computation it never shows.
  const unreadIds = useQuery(api.friendThread.unreadFriendIds)
  const unread = new Set(unreadIds ?? [])

  return (
    <>
      {incoming !== undefined && incoming.length > 0 && (
        <>
          <Typography variant="overline" color="text.secondary" component="h2" sx={{ display: 'block', mt: 2 }}>
            Requests
          </Typography>
          <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
            {incoming.map((r) => (
              <GlassTile key={r.requestId} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, px: 2, py: 1.5 }}>
                <Typography noWrap sx={{ minWidth: 0, fontWeight: 500 }}>
                  {r.from.displayName}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
                  <Button variant="contained" size="small" onClick={() => runAction(() => acceptFriendRequest({ requestId: r.requestId }))}>
                    Accept
                  </Button>
                  <Button
                    variant="outlined"
                    color="inherit"
                    size="small"
                    onClick={() => runAction(() => declineFriendRequest({ requestId: r.requestId }))}
                  >
                    Decline
                  </Button>
                </Box>
              </GlassTile>
            ))}
          </Box>
        </>
      )}

      {outgoing !== undefined && outgoing.length > 0 && (
        <>
          <Typography variant="overline" color="text.secondary" component="h2" sx={{ display: 'block', mt: 2 }}>
            Pending
          </Typography>
          <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
            {outgoing.map((r) => (
              <GlassTile key={r.requestId} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, px: 2, py: 1.5 }}>
                <Typography noWrap sx={{ minWidth: 0, fontWeight: 500 }}>
                  {r.to.displayName}
                </Typography>
                <Button
                  variant="outlined"
                  color="inherit"
                  size="small"
                  sx={{ flexShrink: 0 }}
                  onClick={() => runAction(() => declineFriendRequest({ requestId: r.requestId }))}
                >
                  Cancel
                </Button>
              </GlassTile>
            ))}
          </Box>
        </>
      )}

      <Typography variant="overline" color="text.secondary" component="h2" sx={{ display: 'block', mt: 2 }}>
        My Friends
      </Typography>
      {friends === undefined ? (
        <Typography sx={{ mt: 1.5, textAlign: 'center' }} color="text.secondary">
          Loading…
        </Typography>
      ) : friends.length === 0 ? (
        <Typography variant="body2" sx={{ mt: 1.5, textAlign: 'center' }} color="text.secondary">
          No friends yet — search a username above to send a request.
        </Typography>
      ) : (
        <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {friends.map((f) => (
            <FriendRow
              key={f.userId}
              friend={f}
              hasUnread={unread.has(f.userId)}
              onRemove={() => runAction(() => removeFriend({ friendId: f.userId }))}
            />
          ))}
        </Box>
      )}
    </>
  )
}
