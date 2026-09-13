import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { SearchPickerSheet } from '../../components/SearchPickerSheet'

export type PickedFood = {
  description: string
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
  fiberG: number
}

type Props = {
  onPick: (food: PickedFood) => void
  onClose: () => void
}

// Searchable list of the seeded food database (see convex/foods.ts +
// foodSeedData.ts). Picking an item hands its macros back to
// CaloricConsistencyPage, which fills the manual-entry fields, so it's a
// free (no vision-model call) alternative to the photo path for anything
// common enough to already be in the dataset.
export function FoodPicker({ onPick, onClose }: Props) {
  const foods = useQuery(api.foods.list)

  return (
    <SearchPickerSheet
      title="Search Food"
      items={foods}
      getKey={(f) => f._id}
      matchesSearch={(f, search) => f.name.toLowerCase().includes(search.toLowerCase())}
      primary={(f) => f.name}
      secondary={(f) => `${f.calories} kcal · P ${f.proteinG}g · C ${f.carbsG}g · F ${f.fatG}g`}
      emptyMessage="No match. Log it manually instead."
      onPick={(f) =>
        onPick({
          description: f.name,
          calories: f.calories,
          proteinG: f.proteinG,
          carbsG: f.carbsG,
          fatG: f.fatG,
          fiberG: f.fiberG,
        })
      }
      onClose={onClose}
    />
  )
}
