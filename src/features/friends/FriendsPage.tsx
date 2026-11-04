import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { Box, Button, TextField, Typography } from '@mui/material'
import { api } from '../../../convex/_generated/api'
import { FirstVisitTip } from '../../components/FirstVisitTip'
import { TIER_LABELS } from '../../lib/tierLabels'
import { ConsistencyRing } from '../../components/ConsistencyRing'
import { errorMessage } from '../../lib/errors'
import { GlassTile } from '../../components/GlassTile'
import { SegmentedControl } from '../../components/SegmentedControl'
import { Avatar } from '../../components/Avatar'
import { SwoleCoin } from '../../components/SwoleCoin'
import { usePeriodStart, type LeaderboardPeriod } from '../../lib/period'
import { FeedTab } from '../feed/FeedTab'
import { formatLastActivity } from './activityLabel'
import { conversationTimeLabel } from './threadLayout'

type LastActivity = FunctionReturnType<typeof api.friendThread.lastActivity>[number]

type Friends = FunctionReturnType<typeof api.friends.myFriends>
type IncomingRequests = FunctionReturnType<typeof api.friends.myIncomingRequests>
type OutgoingRequests = FunctionReturnType<typeof api.friends.myOutgoingRequests>
type SearchResult = FunctionReturnType<typeof api.friends.resolveUsername>

// A username is always set by the time this page is reachable — OnboardingGate
// (src/features/onboarding/OnboardingGate.tsx) captures it during the welcome
// carousel before any route becomes available.
export function FriendsPage() {
  const incoming = useQuery(api.friends.myIncomingRequests)
  const outgoing = useQuery(api.friends.myOutgoingRequests)
  const friends = useQuery(api.friends.myFriends)
  const unreadIds = useQuery(api.friendThread.unreadFriendIds)

  const sendFriendRequest = useMutation(api.friends.sendFriendRequest)
  const resolveUsername = useMutation(api.friends.resolveUsername)

  // Coming back from a conversation lands on Chats, not wherever the default is.
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState<'feed' | 'leaderboard' | 'friends'>(
    searchParams.get('tab') === 'chats' ? 'friends' : 'feed',
  )
  const [searchTerm, setSearchTerm] = useState('')
  const [committedSearch, setCommittedSearch] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  // Held in state rather than subscribed: resolveUsername is a mutation so it
  // can consume a rate limit (see convex/friends.ts). `undefined` keeps its
  // useQuery meaning of "in flight", so the three-state render below is
  // unchanged.
  const [searchResult, setSearchResult] = useState<SearchResult | undefined>(undefined)

  async function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setActionError(null)
    const username = searchTerm.trim()
    if (!username) return

    setCommittedSearch(username)
    setSearchResult(undefined)
    try {
      setSearchResult(await resolveUsername({ username }))
    } catch (err) {
      // Includes being throttled. Drop the result tile so a stale hit from an
      // earlier search can't sit there looking like the answer to this one.
      setCommittedSearch(null)
      setActionError(errorMessage(err, 'Could not search for that username.'))
    }
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
            {
              value: 'friends',
              label: 'Chats',
              badge: (incoming?.length ?? 0) + (unreadIds?.length ?? 0) || undefined,
            },
          ]}
        />
      </Box>

      {tab === 'feed' ? (
        <FeedTab />
      ) : tab === 'leaderboard' ? (
        <LeaderboardTab />
      ) : (
        <FriendsTab
          friends={friends}
          unreadIds={unreadIds}
          incoming={incoming}
          outgoing={outgoing}
          runAction={runAction}
        />
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
                  ...(entry.isMe && { borderColor: 'rgb(var(--color-accent-rgb) / 0.4)' }),
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

// One conversation. The whole row opens the chat, because that's what a row in
// a list of conversations is for; the avatar goes to their profile. Remove and
// Block live behind the chat's own menu, so a stray tap here can't reach them.
function ConversationRow({
  friend,
  hasUnread,
  activity,
  now,
}: {
  friend: Friends[number]
  hasUnread: boolean
  activity: LastActivity | undefined
  now: number
}) {
  const preview = activity ? formatLastActivity(activity) : null

  return (
    <GlassTile sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1 }}>
      <Link
        to={`/friends/${friend.userId}`}
        aria-label={`${friend.displayName}'s profile`}
        style={{ display: 'flex', flexShrink: 0 }}
      >
        <Avatar src={friend.avatarUrl} name={friend.displayName} size={44} />
      </Link>
      <Box
        component={Link}
        to={`/friends/${friend.userId}/chat`}
        aria-label={`Chat with ${friend.displayName}${hasUnread ? ', unread messages' : ''}`}
        sx={{ flex: 1, minWidth: 0, color: 'inherit', textDecoration: 'none' }}
      >
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
          <Typography noWrap sx={{ flex: 1, minWidth: 0, fontWeight: hasUnread ? 700 : 500 }}>
            {friend.displayName}
          </Typography>
          {activity && (
            <Typography
              variant="caption"
              color={hasUnread ? 'primary.main' : 'text.secondary'}
              sx={{ flexShrink: 0, fontWeight: hasUnread ? 600 : 400 }}
            >
              {conversationTimeLabel(activity.ts, now)}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography
            noWrap
            variant="body2"
            color={hasUnread ? 'text.primary' : 'text.secondary'}
            sx={{ flex: 1, minWidth: 0, fontWeight: hasUnread ? 600 : 400 }}
          >
            {preview
              ? `${preview.icon ? `${preview.icon} ` : ''}${preview.text}`
              : `Say hi to ${friend.displayName}`}
          </Typography>
          {hasUnread && (
            <Box sx={{ flexShrink: 0, width: 10, height: 10, borderRadius: '50%', bgcolor: 'primary.main' }} />
          )}
        </Box>
      </Box>
    </GlassTile>
  )
}

function FriendsTab({
  friends,
  unreadIds,
  incoming,
  outgoing,
  runAction,
}: {
  friends: Friends | undefined
  unreadIds: FunctionReturnType<typeof api.friendThread.unreadFriendIds> | undefined
  incoming: IncomingRequests | undefined
  outgoing: OutgoingRequests | undefined
  runAction: (action: () => Promise<unknown>) => Promise<void>
}) {
  const acceptFriendRequest = useMutation(api.friends.acceptFriendRequest)
  const declineFriendRequest = useMutation(api.friends.declineFriendRequest)
  const unread = new Set(unreadIds ?? [])
  const lastActivity = useQuery(api.friendThread.lastActivity)

  // Latest conversation first, then people you haven't talked to yet by name.
  const { conversations, activityByFriend } = useMemo(() => {
    const activityByFriend = new Map((lastActivity ?? []).map((a) => [a.friendId, a]))
    const conversations = [...(friends ?? [])].sort((a, b) => {
      const diff = (activityByFriend.get(b.userId)?.ts ?? 0) - (activityByFriend.get(a.userId)?.ts ?? 0)
      return diff || a.displayName.localeCompare(b.displayName)
    })
    return { conversations, activityByFriend }
  }, [friends, lastActivity])
  const now = Date.now()

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
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1, minWidth: 0 }}>
                  <Avatar src={r.from.avatarUrl} name={r.from.displayName} size={36} />
                  <Typography noWrap sx={{ minWidth: 0, fontWeight: 500 }}>
                    {r.from.displayName}
                  </Typography>
                </Box>
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
        Conversations
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
          {conversations.map((f) => (
            <ConversationRow
              key={f.userId}
              friend={f}
              hasUnread={unread.has(f.userId)}
              activity={activityByFriend.get(f.userId)}
              now={now}
            />
          ))}
        </Box>
      )}
    </>
  )
}
