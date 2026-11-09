import type { Doc } from '../../../convex/_generated/dataModel'

export type SetLike = Pick<Doc<'sets'>, 'setNumber' | 'reps' | 'isWarmup' | 'toFailure' | 'repsEstimated'>

// The label in a finished set's "Set" column: W for warm-ups, F for sets taken
// to failure, otherwise the set number.
export function setBadge(set: SetLike): string | number {
  return set.isWarmup ? 'W' : set.toFailure ? 'F' : set.setNumber
}

export function setBadgeColor(set: SetLike): string {
  return set.isWarmup ? 'pr.main' : set.toFailure ? 'error.main' : 'text.secondary'
}
