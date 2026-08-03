// Shared between backend (validation, seeding) and frontend (filters, forms).
export const MUSCLE_GROUPS = [
  'Chest',
  'Back',
  'Shoulders',
  'Biceps',
  'Triceps',
  'Legs',
  'Core',
  'Other',
] as const

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number]

export const EQUIPMENT_TYPES = [
  'Barbell',
  'Dumbbell',
  'Machine',
  'Cable',
  'Bodyweight',
  'Kettlebell',
  'Band',
  'Other',
] as const

export type EquipmentType = (typeof EQUIPMENT_TYPES)[number]

export const REASON_OPTIONS = [
  'More energy',
  'Better sleep',
  'A workout partner',
  'Clearer plan',
  'More time',
  'Better music/mood',
] as const
