import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { formatKg } from '../../../convex/fitness'
import { HeartOutlineIcon } from '../../components/icons'
import { FirstVisitTip } from '../../components/FirstVisitTip'
import { ExerciseDetail } from '../exercises/ExerciseDetail'

export function FavoritesPage() {
  const favorites = useQuery(api.favorites.listMine)
  const toggleFavorite = useMutation(api.favorites.toggle)
  const [selected, setSelected] = useState<NonNullable<typeof favorites>[number] | null>(
    null,
  )

  return (
    <div>
      <h1 className="text-2xl font-bold">Favorites</h1>
      <FirstVisitTip tabKey="favorites" />

      {favorites === undefined ? (
        <p className="mt-8 text-center text-muted">Loading…</p>
      ) : favorites.length === 0 ? (
        <div className="mt-8 flex flex-col items-center gap-2 text-center text-muted">
          <HeartOutlineIcon className="h-8 w-8" />
          <p>No favorites yet — tap the heart on an exercise to pin it here.</p>
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {favorites.map((fav) => (
            <li key={fav.exercise._id} className="relative">
              <button
                type="button"
                // Same detail sheet as the Exercises tab: one place for stats.
                onClick={() => setSelected(fav)}
                className="flex w-full items-center justify-between rounded-xl border border-border bg-surface py-3 pr-12 pl-4 text-left"
              >
                <div>
                  <p className="font-medium">{fav.exercise.name}</p>
                  <p className="text-sm text-muted">
                    {fav.exercise.equipment ?? fav.exercise.muscleGroup}
                    {fav.record &&
                      ` · 🏆 ${formatKg(fav.record.bestWeightKg)} kg × ${fav.record.bestWeightReps}`}
                  </p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => void toggleFavorite({ exerciseId: fav.exercise._id })}
                aria-label="Remove from favorites"
                className="absolute top-1/2 right-3 -translate-y-1/2 text-lg leading-none"
              >
                ❤️
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <ExerciseDetail
          exercise={selected.exercise}
          record={selected.record}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
