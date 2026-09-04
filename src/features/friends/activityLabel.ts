import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../../convex/_generated/api'

type Activity = FunctionReturnType<typeof api.friendThread.lastActivity>[number]

// One-line, icon-prefixed summary of a friend's most recent activity, for
// the Friends-list row preview. Pure formatting only — the query already
// picked which activity is "most recent" (see convex/friendThread.ts).
export function formatLastActivity(activity: Activity): { icon: string | null; text: string } {
  if (activity.kind === 'message') {
    return { icon: null, text: (activity.isMine ? 'You: ' : '') + activity.text }
  }

  if (activity.kind === 'ping') {
    if (activity.isMine) {
      return { icon: '🏋️', text: activity.acknowledged ? 'Held accountable' : 'You pinged them' }
    }
    return { icon: '🏋️', text: activity.acknowledged ? 'You held them accountable' : 'Pinged you' }
  }

  // challenge
  if (activity.status === 'pending') {
    return { icon: '⚔️', text: activity.isMine ? 'Challenge sent' : 'New challenge' }
  }
  if (activity.status === 'active') {
    return { icon: '⚔️', text: 'Challenge active' }
  }
  if (activity.status === 'declined') {
    return { icon: '⚔️', text: 'Challenge declined' }
  }
  if (activity.status === 'cancelled') {
    return { icon: '⚔️', text: 'Challenge cancelled' }
  }
  // resolved
  if (activity.outcome === 'won') return { icon: '🏆', text: 'You won the challenge!' }
  if (activity.outcome === 'lost') return { icon: '⚔️', text: 'Challenge lost' }
  return { icon: '⚔️', text: 'Challenge tied' }
}
