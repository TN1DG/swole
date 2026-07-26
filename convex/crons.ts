import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

const crons = cronJobs()

// Challenges settle within an hour of their window ending — safe because
// forwardStreakWeeks caps its score at endsAt, so a late run can't let
// either side sneak in an extra qualifying week.
crons.interval('resolve expired challenges', { hours: 1 }, internal.challenges.resolveExpired, {})

export default crons
