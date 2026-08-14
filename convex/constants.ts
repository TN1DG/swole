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

/**
 * Thrown by `turnstile.spendSignupChallenge` when sign-up arrives without a
 * solved challenge, and matched by `SignInPage` to recognise one specific
 * situation: a client whose bundle predates Turnstile being enabled.
 *
 * It lives here, in the module both sides already share, rather than being
 * written out twice — a copy on the client would silently stop matching the
 * day someone reworded the server's copy, and the symptom would be the dead
 * end this message exists to prevent.
 */
export const CHALLENGE_REQUIRED_MESSAGE = 'Please complete the challenge before signing up.'

export const REASON_OPTIONS = [
  'More energy',
  'Better sleep',
  'A workout partner',
  'Clearer plan',
  'More time',
  'Better music/mood',
] as const
