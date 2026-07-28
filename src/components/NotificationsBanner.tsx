import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from 'convex/react'
import { Button } from '@mui/material'
import type { FunctionReturnType } from 'convex/server'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { InlineNotice } from './InlineNotice'

type Notification = FunctionReturnType<typeof api.notifications.listUnread>[number]

// How many stack at once. There's no notifications *page* yet, so the rest
// stay unread until these are cleared and the next ones surface — see
// docs/new-features-progress.md for why that's the accepted v1 tradeoff.
const MAX_VISIBLE = 3

// What each kind says and where tapping it goes. Kept as one lookup rather
// than a switch inside the render so adding a kind is a single edit.
function describe(notification: Notification): { text: string; actionLabel: string; to: string } {
  const who = notification.fromName
  switch (notification.kind) {
    case 'friend_request_received':
      return { text: `${who} sent you a friend request`, actionLabel: 'View', to: '/friends' }
    case 'friend_request_accepted':
      return { text: `${who} accepted your friend request`, actionLabel: 'View', to: '/friends' }
    case 'ping_received':
      return {
        text: `${who} is going to the gym — keep them accountable`,
        actionLabel: "I'm in",
        to: `/friends/${notification.fromUserId}/chat`,
      }
    case 'workout_finished_after_ping':
      return {
        text: `${who} won the battle 🏆`,
        actionLabel: 'See workout',
        to: notification.workoutId
          ? `/friends/${notification.fromUserId}/${notification.workoutId}`
          : `/friends/${notification.fromUserId}/chat`,
      }
  }
}

// App-wide (mounted once in AppLayout, not per-route) so a notice raised
// while you're deep in a workout still reaches you. Sits alongside
// PingAckBanner, which covers the opposite direction of the ping flow (your
// friend acked the ping YOU sent).
export function NotificationsBanner() {
  const notifications = useQuery(api.notifications.listUnread)
  const markRead = useMutation(api.notifications.markRead)
  const acknowledge = useMutation(api.pings.acknowledge)
  const navigate = useNavigate()

  // Hide instantly on tap; the server round-trip that actually marks it read
  // would otherwise leave the banner on screen for a beat.
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  if (!notifications) return null
  const visible = notifications.filter((n) => !dismissed.has(n._id)).slice(0, MAX_VISIBLE)
  if (visible.length === 0) return null

  function hide(id: Id<'notifications'>) {
    setDismissed((prev) => new Set(prev).add(id))
  }

  async function handleAction(notification: Notification) {
    hide(notification._id)
    // Tapping "I'm in" on a ping should hold them accountable outright —
    // that's the whole call to action, and making the user tap it again in
    // the thread would be a pointless second step.
    if (notification.kind === 'ping_received' && notification.pingId) {
      await acknowledge({ pingId: notification.pingId }).catch(() => {})
    }
    await markRead({ notificationId: notification._id }).catch(() => {})
    navigate(describe(notification).to)
  }

  return (
    <>
      {visible.map((notification) => {
        const { text, actionLabel } = describe(notification)
        return (
          <InlineNotice
            key={notification._id}
            onDismiss={() => {
              hide(notification._id)
              void markRead({ notificationId: notification._id }).catch(() => {})
            }}
            action={
              <Button
                variant="contained"
                size="small"
                onClick={() => void handleAction(notification)}
              >
                {actionLabel}
              </Button>
            }
          >
            {text}
          </InlineNotice>
        )
      })}
    </>
  )
}
