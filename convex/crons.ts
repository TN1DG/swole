import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

const crons = cronJobs()

// Challenges settle within an hour of their window ending — safe because
// forwardStreakWeeks caps its score at endsAt, so a late run can't let
// either side sneak in an extra qualifying week.
crons.interval('resolve expired challenges', { hours: 1 }, internal.challenges.resolveExpired, {})

// The clan weekly race: crown last week's MVP in every clan, just after the
// UTC week (Mon–Sun) ends. Idempotent, so a late or repeated run is harmless.
crons.cron('clan weekly mvp', '5 0 * * 1', internal.clanChat.awardWeeklyMvps, {})

export default crons
