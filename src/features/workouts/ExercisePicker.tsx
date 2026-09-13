import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { SearchPickerSheet } from '../../components/SearchPickerSheet'

type Props = {
  onPick: (exerciseId: Id<'exercises'>) => void
  onClose: () => void
}

// Searchable exercise list; tap one to add it. Reused unmodified by
// RoutineEditor (via a small wrapper) and ActiveWorkout.
export function ExercisePicker({ onPick, onClose }: Props) {
  const exercises = useQuery(api.exercises.list)

  return (
    <SearchPickerSheet
      title="Add Exercise"
      items={exercises}
      getKey={(ex) => ex._id}
      matchesSearch={(ex, search) => ex.name.toLowerCase().includes(search.toLowerCase())}
      primary={(ex) => ex.name}
      secondary={(ex) => `${ex.muscleGroup} · ${ex.equipment}`}
      emptyMessage="No match. Add custom exercises in the Exercises tab."
      onPick={(ex) => onPick(ex._id)}
      onClose={onClose}
    />
  )
}
