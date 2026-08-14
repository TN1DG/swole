import { useMemo } from 'react'
import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import {
  formatWeightIn,
  formatWeightWithUnitIn,
  toDisplayWeight,
  type WeightUnit,
} from './weightFormat'

export type { WeightUnit }

/**
 * The viewer's weight display preference, bound to the formatters in
 * weightFormat.ts so no call site has to pass the unit around.
 *
 * The preference is the *viewer's*, even on someone else's workout: a friend
 * who thinks in pounds wants to read your session in pounds.
 *
 * One `getMine` subscription backs every call site. Convex dedupes identical
 * query+args across components, so using this hook in twenty places opens one
 * subscription, not twenty — and AppLayout already subscribes to `getMine` on
 * every screen regardless.
 */
export function useWeightUnit() {
  const profile = useQuery(api.profiles.getMine, {})
  // `undefined` while the query is in flight. Falling back to kg matches the
  // schema default, so the first paint never shows a converted number that
  // then changes under the reader.
  const unit: WeightUnit = profile?.unitPreference ?? 'kg'

  return useMemo(
    () => ({
      unit,
      toDisplay: (kg: number) => toDisplayWeight(unit, kg),
      formatWeight: (kg: number) => formatWeightIn(unit, kg),
      formatWeightWithUnit: (kg: number) => formatWeightWithUnitIn(unit, kg),
    }),
    [unit],
  )
}
