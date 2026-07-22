import type { ConsistencyTier } from '../../convex/fitness'

// Shared by the leaderboard and the friend trophy card — one place for how
// each consistency tier is labeled/emoji'd.
export const TIER_LABELS: Record<ConsistencyTier, string> = {
  none: '',
  consistent: '🔥 Consistent',
  dedicated: '🔥 Dedicated',
  relentless: '🔥 Relentless',
  iron_will: '🔥 Iron Will',
}
