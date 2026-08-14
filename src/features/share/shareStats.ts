import type { Id } from '../../../convex/_generated/dataModel'

type SetLike = { weightKg: number; reps: number; isWarmup: boolean }
type ExerciseEntry = {
  workoutExerciseId: Id<'workoutExercises'>
  exercise: { _id: Id<'exercises'>; name: string }
  sets: SetLike[]
}

// Shared by ShareCard (the owner's own share/trophy export) and
// FriendTrophyCard (a friend's stats-only export of someone else's
// workout) — same underlying `exercises`/`prExerciseIds` shape from either
// history.getDetail or friends.getFriendWorkoutDetail.
export function computeShareStats(exercises: ExerciseEntry[], prExerciseIds: Id<'exercises'>[]) {
  const prSet = new Set(prExerciseIds)
  const workingSets = exercises.flatMap((e) => e.sets).filter((s) => !s.isWarmup)
  const volumeKg = workingSets.reduce((sum, s) => sum + s.weightKg * s.reps, 0)
  const setCount = exercises.reduce((n, e) => n + e.sets.length, 0)

  // Per exercise: set count + heaviest set for the summary line.
  const lines = exercises.map((entry) => {
    const working = entry.sets.filter((s) => !s.isWarmup)
    // An exercise with no sets at all leaves `top` undefined, which callers
    // already handle (see WorkoutBreakdown). The accumulator is typed to admit
    // that rather than pretending the seed is always present.
    const top = working.reduce<SetLike | undefined>(
      (a, b) =>
        !a || b.weightKg > a.weightKg || (b.weightKg === a.weightKg && b.reps > a.reps) ? b : a,
      working[0] ?? entry.sets[0],
    )
    return {
      id: entry.workoutExerciseId,
      name: entry.exercise.name,
      setCount: entry.sets.length,
      top,
      isPr: prSet.has(entry.exercise._id),
    }
  })

  return { volumeKg, setCount, lines }
}
