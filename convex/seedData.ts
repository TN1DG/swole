import type { EquipmentType, MuscleGroup } from './constants'

type SeedExercise = {
  name: string
  muscleGroup: MuscleGroup
  equipment: EquipmentType
}

// The built-in library inserted once by the `exercises:seed` mutation.
export const BUILT_IN_EXERCISES: SeedExercise[] = [
  // Chest
  { name: 'Bench Press', muscleGroup: 'Chest', equipment: 'Barbell' },
  { name: 'Incline Bench Press', muscleGroup: 'Chest', equipment: 'Barbell' },
  { name: 'Bench Press (Dumbbell)', muscleGroup: 'Chest', equipment: 'Dumbbell' },
  { name: 'Incline Bench Press (Dumbbell)', muscleGroup: 'Chest', equipment: 'Dumbbell' },
  { name: 'Chest Fly (Dumbbell)', muscleGroup: 'Chest', equipment: 'Dumbbell' },
  { name: 'Chest Fly (Cable)', muscleGroup: 'Chest', equipment: 'Cable' },
  { name: 'Chest Press (Machine)', muscleGroup: 'Chest', equipment: 'Machine' },
  { name: 'Pec Deck', muscleGroup: 'Chest', equipment: 'Machine' },
  { name: 'Push-Up', muscleGroup: 'Chest', equipment: 'Bodyweight' },
  { name: 'Dips', muscleGroup: 'Chest', equipment: 'Bodyweight' },

  // Back
  { name: 'Deadlift', muscleGroup: 'Back', equipment: 'Barbell' },
  { name: 'Pull-Up', muscleGroup: 'Back', equipment: 'Bodyweight' },
  { name: 'Chin-Up', muscleGroup: 'Back', equipment: 'Bodyweight' },
  { name: 'Lat Pulldown', muscleGroup: 'Back', equipment: 'Cable' },
  { name: 'Bent-Over Row', muscleGroup: 'Back', equipment: 'Barbell' },
  { name: 'Row (Dumbbell)', muscleGroup: 'Back', equipment: 'Dumbbell' },
  { name: 'Seated Cable Row', muscleGroup: 'Back', equipment: 'Cable' },
  { name: 'T-Bar Row', muscleGroup: 'Back', equipment: 'Barbell' },
  { name: 'Face Pull', muscleGroup: 'Back', equipment: 'Cable' },
  { name: 'Back Extension', muscleGroup: 'Back', equipment: 'Bodyweight' },
  { name: 'Shrug (Dumbbell)', muscleGroup: 'Back', equipment: 'Dumbbell' },
  { name: 'Shrug (Barbell)', muscleGroup: 'Back', equipment: 'Barbell' },

  // Shoulders
  { name: 'Overhead Press', muscleGroup: 'Shoulders', equipment: 'Barbell' },
  { name: 'Shoulder Press (Dumbbell)', muscleGroup: 'Shoulders', equipment: 'Dumbbell' },
  { name: 'Shoulder Press (Machine)', muscleGroup: 'Shoulders', equipment: 'Machine' },
  { name: 'Arnold Press', muscleGroup: 'Shoulders', equipment: 'Dumbbell' },
  { name: 'Lateral Raise (Dumbbell)', muscleGroup: 'Shoulders', equipment: 'Dumbbell' },
  { name: 'Lateral Raise (Cable)', muscleGroup: 'Shoulders', equipment: 'Cable' },
  { name: 'Front Raise', muscleGroup: 'Shoulders', equipment: 'Dumbbell' },
  { name: 'Rear Delt Fly (Dumbbell)', muscleGroup: 'Shoulders', equipment: 'Dumbbell' },
  { name: 'Rear Delt Fly (Machine)', muscleGroup: 'Shoulders', equipment: 'Machine' },
  { name: 'Upright Row', muscleGroup: 'Shoulders', equipment: 'Barbell' },

  // Biceps
  { name: 'Bicep Curl (Barbell)', muscleGroup: 'Biceps', equipment: 'Barbell' },
  { name: 'Bicep Curl (Dumbbell)', muscleGroup: 'Biceps', equipment: 'Dumbbell' },
  { name: 'EZ-Bar Curl', muscleGroup: 'Biceps', equipment: 'Barbell' },
  { name: 'Hammer Curl', muscleGroup: 'Biceps', equipment: 'Dumbbell' },
  { name: 'Preacher Curl', muscleGroup: 'Biceps', equipment: 'Barbell' },
  { name: 'Incline Curl', muscleGroup: 'Biceps', equipment: 'Dumbbell' },
  { name: 'Cable Curl', muscleGroup: 'Biceps', equipment: 'Cable' },
  { name: 'Concentration Curl', muscleGroup: 'Biceps', equipment: 'Dumbbell' },

  // Triceps
  { name: 'Tricep Pushdown', muscleGroup: 'Triceps', equipment: 'Cable' },
  { name: 'Overhead Tricep Extension', muscleGroup: 'Triceps', equipment: 'Cable' },
  { name: 'Skull Crusher', muscleGroup: 'Triceps', equipment: 'Barbell' },
  { name: 'Close-Grip Bench Press', muscleGroup: 'Triceps', equipment: 'Barbell' },
  { name: 'Tricep Dips', muscleGroup: 'Triceps', equipment: 'Bodyweight' },
  { name: 'Tricep Kickback', muscleGroup: 'Triceps', equipment: 'Dumbbell' },

  // Legs
  { name: 'Squat', muscleGroup: 'Legs', equipment: 'Barbell' },
  { name: 'Front Squat', muscleGroup: 'Legs', equipment: 'Barbell' },
  { name: 'Goblet Squat', muscleGroup: 'Legs', equipment: 'Dumbbell' },
  { name: 'Hack Squat', muscleGroup: 'Legs', equipment: 'Machine' },
  { name: 'Leg Press', muscleGroup: 'Legs', equipment: 'Machine' },
  { name: 'Romanian Deadlift', muscleGroup: 'Legs', equipment: 'Barbell' },
  { name: 'Leg Extension', muscleGroup: 'Legs', equipment: 'Machine' },
  { name: 'Lying Leg Curl', muscleGroup: 'Legs', equipment: 'Machine' },
  { name: 'Seated Leg Curl', muscleGroup: 'Legs', equipment: 'Machine' },
  { name: 'Bulgarian Split Squat', muscleGroup: 'Legs', equipment: 'Dumbbell' },
  { name: 'Lunge', muscleGroup: 'Legs', equipment: 'Dumbbell' },
  { name: 'Hip Thrust', muscleGroup: 'Legs', equipment: 'Barbell' },
  { name: 'Glute Kickback', muscleGroup: 'Legs', equipment: 'Cable' },
  { name: 'Standing Calf Raise', muscleGroup: 'Legs', equipment: 'Machine' },
  { name: 'Seated Calf Raise', muscleGroup: 'Legs', equipment: 'Machine' },

  // Core
  { name: 'Plank', muscleGroup: 'Core', equipment: 'Bodyweight' },
  { name: 'Crunch', muscleGroup: 'Core', equipment: 'Bodyweight' },
  { name: 'Cable Crunch', muscleGroup: 'Core', equipment: 'Cable' },
  { name: 'Hanging Leg Raise', muscleGroup: 'Core', equipment: 'Bodyweight' },
  { name: 'Russian Twist', muscleGroup: 'Core', equipment: 'Bodyweight' },
  { name: 'Ab Wheel Rollout', muscleGroup: 'Core', equipment: 'Other' },
  { name: 'Sit-Up', muscleGroup: 'Core', equipment: 'Bodyweight' },

  // Other
  { name: "Farmer's Carry", muscleGroup: 'Other', equipment: 'Dumbbell' },
  { name: 'Kettlebell Swing', muscleGroup: 'Other', equipment: 'Kettlebell' },
]
