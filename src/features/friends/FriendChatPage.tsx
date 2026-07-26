import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery } from 'convex/react'
import type { Id } from '../../../convex/_generated/dataModel'
import { api } from '../../../convex/_generated/api'
import { formatShortDate, formatWorkoutDate } from '../../lib/dates'
import { ProgressRing } from '../../components/ProgressRing'

const DAY_MS = 24 * 60 * 60 * 1000

export function FriendChatPage() {
  const { userId } = useParams<{ userId: string }>()
  const friendId = userId as Id<'users'>

  const thread = useQuery(api.pings.getThread, { friendUserId: friendId })
  const friends = useQuery(api.friends.myFriends)
  const sendPing = useMutation(api.pings.send)
  const acknowledge = useMutation(api.pings.acknowledge)

  const bottomRef = useRef<HTMLDivElement>(null)
  const friend = friends?.find((f) => f.userId === friendId)
  const now = Date.now()
  const hasPendingOutgoing =
    thread?.some((p) => p.isMine && p.acknowledgedAt === null) ?? false

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [thread?.length])

  return (
    <div>
      <div className="flex items-center gap-3 -mx-4 -mt-4 px-4 py-3 border-b border-border sticky top-0 z-10 bg-surface/90 backdrop-blur-sm">
        <Link to="/friends" className="text-muted font-medium">←</Link>
        <p className="font-semibold">{friend?.displayName ?? '…'}</p>
      </div>

      <ChallengeSection friendId={friendId} friendName={friend?.displayName ?? 'them'} />

      <div className="flex flex-col gap-4 py-4 min-h-[50vh]">
        {thread === undefined ? (
          <p className="text-center text-muted">Loading…</p>
        ) : thread.length === 0 ? (
          <p className="text-center text-sm text-muted mt-8">
            No pings yet — hit "Ping" below to get started!
          </p>
        ) : (
          thread.map((ping) => {
            const expired = now - ping.sentAt > DAY_MS
            return (
              <div
                key={ping._id}
                className={`flex flex-col gap-1 max-w-[80%] ${
                  ping.isMine ? 'self-end items-end ml-auto' : 'self-start items-start'
                } ${expired ? 'opacity-40' : ''}`}
              >
                <div
                  className={`rounded-2xl px-4 py-2.5 ${
                    ping.isMine ? 'bg-accent text-accent-fg' : 'glass-tile'
                  }`}
                >
                  <p className="text-sm font-medium">I'm heading to the gym! 💪</p>
                </div>
                <p className="text-xs text-muted px-1">{formatWorkoutDate(ping.sentAt)}</p>

                {ping.isMine ? (
                  <p className="text-xs text-muted px-1">
                    {ping.acknowledgedAt !== null ? 'Held accountable ✓' : 'Waiting…'}
                  </p>
                ) : !ping.acknowledgedAt && !expired ? (
                  <button
                    type="button"
                    onClick={() => void acknowledge({ pingId: ping._id })}
                    className="mt-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg btn-glow"
                  >
                    Hold them accountable 💪
                  </button>
                ) : null}

                {ping.linkedWorkout && (
                  <Link
                    to={`/friends/${ping.fromUserId}/${ping.linkedWorkout._id}`}
                    className="text-xs text-accent underline px-1"
                  >
                    See workout → {ping.linkedWorkout.name}
                  </Link>
                )}

                {ping.isMine && !ping.linkedWorkout && !expired && (
                  <Link to="/" className="text-xs text-accent underline px-1">
                    Log workout →
                  </Link>
                )}
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      <button
        type="button"
        disabled={hasPendingOutgoing}
        onClick={() => void sendPing({ toUserId: friendId })}
        className="w-full rounded-xl bg-accent py-3 font-semibold text-accent-fg btn-glow disabled:opacity-50 sticky bottom-0"
      >
        Ping 🏋️
      </button>
    </div>
  )
}

// The most recent challenge between me and this friend, plus the compose
// flow. Only one open (pending/active) challenge per friend pair can exist
// (enforced server-side), so "current" is unambiguous.
function ChallengeSection({ friendId, friendName }: { friendId: Id<'users'>; friendName: string }) {
  const challenges = useQuery(api.challenges.getThread, { friendUserId: friendId })
  const propose = useMutation(api.challenges.propose)
  const accept = useMutation(api.challenges.accept)
  const decline = useMutation(api.challenges.decline)
  const cancelChallenge = useMutation(api.challenges.cancel)

  const [composing, setComposing] = useState(false)
  const [weeks, setWeeks] = useState('2')
  const [wager, setWager] = useState('20')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (challenges === undefined) return null
  const current = challenges[0]
  const open = current && (current.status === 'pending' || current.status === 'active')

  async function handlePropose(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await propose({
        opponentId: friendId,
        weeks: parseInt(weeks, 10),
        wagerPoints: parseInt(wager, 10),
      })
      setComposing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not propose.')
    } finally {
      setBusy(false)
    }
  }

  async function respond(action: 'accept' | 'decline' | 'cancel', challengeId: Id<'challenges'>) {
    setError(null)
    setBusy(true)
    try {
      if (action === 'accept') await accept({ challengeId })
      else if (action === 'decline') await decline({ challengeId })
      else await cancelChallenge({ challengeId })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <div className="mt-3 rounded-2xl glass-tile p-4">
        {current?.status === 'resolved' && (
          <p className="mb-2 text-sm text-muted">
            {current.winnerId === undefined
              ? 'Last challenge tied — points returned.'
              : current.isMine === (current.winnerId === current.challengerId)
                ? `You won the last challenge! +${current.wagerPoints} pts`
                : `${friendName} won the last challenge.`}
          </p>
        )}
        {composing ? (
          <form onSubmit={handlePropose} className="flex flex-col gap-2">
            <p className="font-semibold">Challenge {friendName} ⚔️</p>
            <p className="text-xs text-muted">Whoever keeps the longer streak wins the pot.</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-muted">
                Weeks
                <input
                  value={weeks}
                  onChange={(e) => setWeeks(e.target.value)}
                  inputMode="numeric"
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </label>
              <label className="text-xs text-muted">
                Wager (pts)
                <input
                  value={wager}
                  onChange={(e) => setWager(e.target.value)}
                  inputMode="numeric"
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </label>
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={busy}
                className="btn-glow flex-1 rounded-lg bg-accent py-2 text-sm font-semibold text-accent-fg disabled:opacity-50"
              >
                Propose
              </button>
              <button
                type="button"
                onClick={() => setComposing(false)}
                className="flex-1 rounded-lg border border-border py-2 text-sm font-semibold text-muted"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setComposing(true)}
            className="w-full rounded-lg border border-border py-2 text-sm font-semibold text-muted"
          >
            Start a Challenge ⚔️
          </button>
        )}
      </div>
    )
  }

  if (current.status === 'pending' && current.isMine) {
    return (
      <div className="mt-3 flex items-center justify-between gap-2 rounded-2xl glass-tile p-4">
        <p className="text-sm text-muted">
          Waiting for {friendName} to accept… ({current.wagerPoints} pts, {current.weeks}w)
        </p>
        <button
          type="button"
          onClick={() => void respond('cancel', current._id)}
          disabled={busy}
          className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs text-muted disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    )
  }

  if (current.status === 'pending' && !current.isMine) {
    return (
      <div className="mt-3 rounded-2xl glass-tile p-4">
        <p className="text-sm">
          {friendName} challenged you: {current.wagerPoints} pts, {current.weeks} weeks — longer
          streak wins.
        </p>
        {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => void respond('accept', current._id)}
            disabled={busy}
            className="btn-glow flex-1 rounded-lg bg-accent py-2 text-sm font-semibold text-accent-fg disabled:opacity-50"
          >
            Accept
          </button>
          <button
            type="button"
            onClick={() => void respond('decline', current._id)}
            disabled={busy}
            className="flex-1 rounded-lg border border-border py-2 text-sm font-semibold text-muted disabled:opacity-50"
          >
            Decline
          </button>
        </div>
      </div>
    )
  }

  // active
  const youName = 'You'
  const challengerName = current.isMine ? youName : friendName
  const opponentName = current.isMine ? friendName : youName
  const challengerStreak = current.liveChallengerStreak ?? 0
  const opponentStreak = current.liveOpponentStreak ?? 0

  return (
    <div className="mt-3 rounded-2xl glass-tile p-4">
      <p className="text-sm font-semibold">
        Challenge in progress — {current.wagerPoints} pts · ends{' '}
        {current.endsAt !== undefined ? formatShortDate(current.endsAt) : '…'}
      </p>
      <div className="mt-3 flex items-center justify-around">
        <div className="flex flex-col items-center gap-1">
          <ProgressRing
            progress={challengerStreak / current.weeks}
            color="var(--color-accent)"
            size={48}
            label={String(challengerStreak)}
          />
          <p className="text-xs text-muted">{challengerName}</p>
        </div>
        <p className="text-muted">vs</p>
        <div className="flex flex-col items-center gap-1">
          <ProgressRing
            progress={opponentStreak / current.weeks}
            color="var(--color-accent)"
            size={48}
            label={String(opponentStreak)}
          />
          <p className="text-xs text-muted">{opponentName}</p>
        </div>
      </div>
    </div>
  )
}
