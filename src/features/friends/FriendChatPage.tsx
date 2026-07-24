import { useEffect, useRef } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery } from 'convex/react'
import type { Id } from '../../../convex/_generated/dataModel'
import { api } from '../../../convex/_generated/api'
import { formatWorkoutDate } from '../../lib/dates'

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
