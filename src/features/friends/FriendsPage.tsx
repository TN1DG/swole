import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '../../../convex/_generated/api'
import { formatKg } from '../../../convex/fitness'
import { FirstVisitTip } from '../../components/FirstVisitTip'
import { TIER_LABELS } from '../../lib/tierLabels'

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

  const [tab, setTab] = useState<'leaderboard' | 'friends'>('leaderboard')
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
      setActionError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }

  const alreadyFriends = searchResult
    ? (friends ?? []).some((f) => f.userId === searchResult.userId)
    : false
  const alreadyPending = searchResult
    ? (outgoing ?? []).some((r) => r.to.userId === searchResult.userId)
    : false

  return (
    <div>
      <h1 className="text-2xl font-bold">Friends</h1>
      <FirstVisitTip tabKey="friends" />

      <form onSubmit={handleSearch} className="mt-4 flex gap-2">
        <input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Add by username"
          className="w-full rounded-xl border border-border bg-surface px-4 py-3 outline-none focus:border-accent"
        />
        <button
          type="submit"
          className="shrink-0 rounded-xl glass-tile px-4 py-3 font-semibold"
        >
          Search
        </button>
      </form>

      {committedSearch && (
        <div className="mt-2 rounded-xl glass-tile p-3">
          {searchResult === undefined ? (
            <p className="text-sm text-muted">Searching…</p>
          ) : searchResult === null ? (
            <p className="text-sm text-muted">No user with that username.</p>
          ) : searchResult.isMe ? (
            <p className="text-sm text-muted">That's you!</p>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{searchResult.displayName}</p>
                <p className="truncate text-sm text-muted">@{searchResult.username}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Link
                  to={`/friends/${searchResult.userId}`}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-muted"
                >
                  View
                </Link>
                {alreadyFriends ? (
                  <span className="px-3 py-1.5 text-sm text-muted">Friends</span>
                ) : alreadyPending ? (
                  <span className="px-3 py-1.5 text-sm text-muted">Pending</span>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      runAction(() =>
                        sendFriendRequest({ username: searchResult.username! }),
                      )
                    }
                    className="btn-glow rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg"
                  >
                    Add Friend
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {actionError && <p className="mt-2 text-sm text-red-400">{actionError}</p>}

      {/* Segmented control — same pattern as History's Workouts/Records toggle. */}
      <div className="mt-4 grid grid-cols-2 rounded-xl glass-tile p-1">
        {(['leaderboard', 'friends'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`relative rounded-lg py-2 text-sm font-semibold ${
              tab === t ? 'bg-accent text-accent-fg' : 'text-muted'
            }`}
          >
            {t === 'leaderboard' ? 'Leaderboard' : 'Friends'}
            {t === 'friends' && incoming !== undefined && incoming.length > 0 && (
              <span className="absolute -top-1 right-3 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {incoming.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'leaderboard' ? <LeaderboardTab /> : <FriendsTab friends={friends} incoming={incoming} outgoing={outgoing} runAction={runAction} />}
    </div>
  )
}

function LeaderboardTab() {
  const leaderboard = useQuery(api.friends.leaderboard)

  return (
    <>
      <p className="label-micro mt-4">Last 7 days</p>
      {leaderboard === undefined ? (
        <p className="mt-3 text-center text-muted">Loading…</p>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          {leaderboard.map((entry, i) => (
            <Link
              key={entry.userId}
              to={`/friends/${entry.userId}`}
              className={`flex items-center gap-3 rounded-xl glass-tile px-4 py-3 ${
                entry.isMe ? 'border-accent/40!' : ''
              }`}
            >
              <span className="w-5 shrink-0 text-center text-sm font-bold text-muted">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {entry.displayName}
                  {entry.isMe && <span className="text-muted"> (you)</span>}
                </p>
                {TIER_LABELS[entry.tier] && (
                  <p className="truncate text-xs text-accent">{TIER_LABELS[entry.tier]}</p>
                )}
              </div>
              <div className="shrink-0 text-right tabular-nums">
                <p className="font-bold">{entry.score} pts</p>
                <p className="text-xs text-muted">{formatKg(entry.weekVolumeKg)} kg</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
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

  return (
    <>
      {incoming !== undefined && incoming.length > 0 && (
        <>
          <h2 className="label-micro mt-4">Requests</h2>
          <div className="mt-2 flex flex-col gap-2">
            {incoming.map((r) => (
              <div
                key={r.requestId}
                className="flex items-center justify-between gap-2 rounded-xl glass-tile px-4 py-3"
              >
                <p className="min-w-0 truncate font-medium">{r.from.displayName}</p>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      runAction(() => acceptFriendRequest({ requestId: r.requestId }))
                    }
                    className="btn-glow rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      runAction(() => declineFriendRequest({ requestId: r.requestId }))
                    }
                    className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {outgoing !== undefined && outgoing.length > 0 && (
        <>
          <h2 className="label-micro mt-4">Pending</h2>
          <div className="mt-2 flex flex-col gap-2">
            {outgoing.map((r) => (
              <div
                key={r.requestId}
                className="flex items-center justify-between gap-2 rounded-xl glass-tile px-4 py-3"
              >
                <p className="min-w-0 truncate font-medium">{r.to.displayName}</p>
                <button
                  type="button"
                  onClick={() =>
                    runAction(() => declineFriendRequest({ requestId: r.requestId }))
                  }
                  className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-sm text-muted"
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <h2 className="label-micro mt-4">My Friends</h2>
      {friends === undefined ? (
        <p className="mt-3 text-center text-muted">Loading…</p>
      ) : friends.length === 0 ? (
        <p className="mt-3 text-center text-sm text-muted">
          No friends yet — search a username above to send a request.
        </p>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          {friends.map((f) => (
            <div
              key={f.userId}
              className="flex items-center justify-between gap-2 rounded-xl glass-tile px-4 py-3"
            >
              <Link to={`/friends/${f.userId}`} className="min-w-0 flex-1 truncate font-medium">
                {f.displayName}
              </Link>
              <button
                type="button"
                onClick={() => runAction(() => removeFriend({ friendId: f.userId }))}
                className="shrink-0 text-sm text-muted"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
