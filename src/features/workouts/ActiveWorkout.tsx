import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { Box, Button, ButtonBase, IconButton, TextField, Typography } from '@mui/material'
import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { beatsRecord, behindRecord, formatDuration, formatKg } from '../../../convex/fitness'
import { ExerciseDetail } from '../exercises/ExerciseDetail'
import { ExercisePicker } from './ExercisePicker'
import { RestTimer } from './RestTimer'
import { GlassTile } from '../../components/GlassTile'
import { ConfirmDialog } from '../../components/ConfirmDialog'

// The exact shape getActive returns, minus null — TypeScript derives it
// from the backend function, so the two can never drift apart.
export type ActiveWorkoutData = NonNullable<
  FunctionReturnType<typeof api.workouts.getActive>
>
export type FinishSummary = FunctionReturnType<typeof api.workouts.finish>

type Props = {
  workout: ActiveWorkoutData
  onFinished: (summary: FinishSummary) => void
}

// What (if anything) ConfirmDialog is currently asking about — replaces the
// three window.confirm() calls this component used to make.
type PendingConfirm =
  | { kind: 'discardEmpty' }
  | { kind: 'finishWithPending'; count: number }
  | { kind: 'discardWorkout' }
  | null

export function ActiveWorkout({ workout, onFinished }: Props) {
  const finish = useMutation(api.workouts.finish)
  const cancel = useMutation(api.workouts.cancel)
  const addExercise = useMutation(api.workouts.addExercise)

  const prs = useQuery(api.prs.listMine)
  // exerciseId -> record, for O(1) lookups in set rows.
  const recordByExercise = useMemo(
    () => new Map((prs ?? []).map((r) => [r.exerciseId, r])),
    [prs],
  )

  const [pickerOpen, setPickerOpen] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>(null)
  // Set whenever any save fails (bad connection, etc.) so nothing is lost silently.
  const [saveError, setSaveError] = useState(false)
  const reportSaveError = () => setSaveError(true)

  // Bumped every time a set is checked off; RestTimer restarts on each bump.
  const [restSignal, setRestSignal] = useState(0)
  const startRest = () => setRestSignal((n) => n + 1)

  // Live stats shown at the top.
  const allSets = workout.exercises.flatMap((e) => e.sets)
  const doneSets = allSets.filter((s) => s.completed)
  const volume = doneSets
    .filter((s) => !s.isWarmup)
    .reduce((sum, s) => sum + s.weightKg * s.reps, 0)

  async function doFinish() {
    setFinishing(true)
    try {
      onFinished(await finish({ workoutId: workout._id }))
    } catch {
      reportSaveError()
    } finally {
      setFinishing(false)
    }
  }

  function handleFinish() {
    const pending = allSets.length - doneSets.length
    if (doneSets.length === 0) {
      setPendingConfirm({ kind: 'discardEmpty' })
    } else if (pending > 0) {
      setPendingConfirm({ kind: 'finishWithPending', count: pending })
    } else {
      void doFinish()
    }
  }

  async function doCancel() {
    await cancel({ workoutId: workout._id }).catch(reportSaveError)
  }

  return (
    <Box>
      {/* Connection problem banner */}
      {saveError && (
        <Box
          sx={{
            mb: 1.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderRadius: '12px',
            border: '1px solid rgb(248 113 113 / 0.4)',
            bgcolor: 'rgb(248 113 113 / 0.1)',
            color: 'rgb(252 165 165)',
            px: 1.5,
            py: 1,
            fontSize: '0.875rem',
          }}
        >
          <span>Couldn't save — check your connection and retry.</span>
          <IconButton size="small" onClick={() => setSaveError(false)} aria-label="Dismiss" sx={{ color: 'inherit' }}>
            ✕
          </IconButton>
        </Box>
      )}

      {/* Header: name + live stats, finish/cancel */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
            {workout.name}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontVariantNumeric: 'tabular-nums' }}>
            <ElapsedTimer since={workout.startedAt} /> · {formatKg(volume)} kg · {doneSets.length} sets
          </Typography>
        </Box>
        <Button
          variant="contained"
          disabled={finishing}
          onClick={handleFinish}
          sx={{ bgcolor: 'success.main', color: '#000', '&:hover': { bgcolor: 'success.main' } }}
        >
          Finish
        </Button>
      </Box>

      <Box sx={{ mt: 2 }}>
        <RestTimer autoStartSignal={restSignal} />
      </Box>

      {/* Exercise cards */}
      <Box sx={{ mt: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {workout.exercises.map((entry, i) => (
          <ExerciseCard
            key={entry.workoutExerciseId}
            entry={entry}
            record={recordByExercise.get(entry.exercise._id)}
            onSaveError={reportSaveError}
            onSetCompleted={startRest}
            isFirst={i === 0}
            isLast={i === workout.exercises.length - 1}
          />
        ))}
      </Box>

      <Button variant="contained" fullWidth sx={{ mt: 2.5 }} onClick={() => setPickerOpen(true)}>
        + Add Exercise
      </Button>
      <Button
        variant="outlined"
        color="inherit"
        fullWidth
        sx={{ mt: 1.5, color: 'error.main' }}
        onClick={() => setPendingConfirm({ kind: 'discardWorkout' })}
      >
        Discard Workout
      </Button>

      {pickerOpen && (
        <ExercisePicker
          onClose={() => setPickerOpen(false)}
          onPick={async (exerciseId) => {
            setPickerOpen(false)
            await addExercise({ workoutId: workout._id, exerciseId }).catch(reportSaveError)
          }}
        />
      )}

      <ConfirmDialog
        open={pendingConfirm !== null}
        onClose={() => setPendingConfirm(null)}
        title={
          pendingConfirm?.kind === 'finishWithPending'
            ? 'Finish workout?'
            : 'Discard this workout?'
        }
        description={
          pendingConfirm?.kind === 'discardEmpty'
            ? 'No sets are marked done — this workout will be discarded.'
            : pendingConfirm?.kind === 'finishWithPending'
              ? `${pendingConfirm.count} unfinished set${pendingConfirm.count > 1 ? 's' : ''} will be discarded. Finish anyway?`
              : undefined
        }
        confirmLabel={pendingConfirm?.kind === 'finishWithPending' ? 'Finish' : 'Discard'}
        destructive={pendingConfirm?.kind !== 'finishWithPending'}
        onConfirm={() => {
          if (pendingConfirm?.kind === 'discardWorkout') void doCancel()
          else void doFinish()
        }}
      />
    </Box>
  )
}

function ElapsedTimer({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  return <span>{formatDuration(now - since)}</span>
}

// ---------- one exercise with its set rows ----------

const SET_ROW_COLUMNS = '2.5rem 1fr 1fr 2.75rem 2rem'

function ExerciseCard({
  entry,
  record,
  onSaveError,
  onSetCompleted,
  isFirst,
  isLast,
}: {
  entry: ActiveWorkoutData['exercises'][number]
  record: { bestWeightKg: number; bestWeightReps: number; bestEst1rm: number } | undefined
  onSaveError: () => void
  onSetCompleted: () => void
  isFirst: boolean
  isLast: boolean
}) {
  const addSet = useMutation(api.workouts.addSet)
  const removeExercise = useMutation(api.workouts.removeExercise)
  const moveExercise = useMutation(api.workouts.moveExercise)
  const [detailOpen, setDetailOpen] = useState(false)
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false)

  return (
    <GlassTile component="section" sx={{ p: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {/* reorder */}
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          <IconButton
            size="small"
            disabled={isFirst}
            aria-label="Move up"
            sx={{ color: 'text.secondary', py: 0.5 }}
            onClick={() =>
              moveExercise({ workoutExerciseId: entry.workoutExerciseId, direction: 'up' }).catch(onSaveError)
            }
          >
            ▲
          </IconButton>
          <IconButton
            size="small"
            disabled={isLast}
            aria-label="Move down"
            sx={{ color: 'text.secondary', py: 0.5 }}
            onClick={() =>
              moveExercise({ workoutExerciseId: entry.workoutExerciseId, direction: 'down' }).catch(onSaveError)
            }
          >
            ▼
          </IconButton>
        </Box>

        <ButtonBase
          onClick={() => setDetailOpen(true)}
          sx={{ flex: 1, justifyContent: 'flex-start', textAlign: 'left', fontWeight: 600, color: 'primary.main' }}
        >
          {entry.exercise.name}
        </ButtonBase>
        <IconButton
          size="small"
          aria-label="Remove exercise"
          sx={{ color: 'text.secondary' }}
          onClick={() => setConfirmRemoveOpen(true)}
        >
          ✕
        </IconButton>
      </Box>

      {/* Column headers */}
      <Box
        sx={{
          mt: 1,
          display: 'grid',
          gridTemplateColumns: SET_ROW_COLUMNS,
          alignItems: 'center',
          gap: 1,
        }}
      >
        {['Set', 'kg', 'Reps', '✓', ''].map((label, i) => (
          <Typography
            key={i}
            variant="caption"
            color="text.secondary"
            sx={{ textAlign: 'center', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.02em' }}
          >
            {label}
          </Typography>
        ))}
      </Box>

      <Box sx={{ mt: 0.5, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {entry.sets.map((set) => (
          <SetRow
            key={set._id}
            set={set}
            record={record}
            onSaveError={onSaveError}
            onSetCompleted={onSetCompleted}
          />
        ))}
      </Box>

      <Button
        fullWidth
        sx={{ mt: 1, bgcolor: 'surface2.main', color: 'text.secondary', fontWeight: 500, fontSize: '0.875rem' }}
        onClick={() => addSet({ workoutExerciseId: entry.workoutExerciseId }).catch(onSaveError)}
      >
        + Add Set
      </Button>

      {detailOpen && (
        <ExerciseDetail exercise={entry.exercise} record={record} onClose={() => setDetailOpen(false)} />
      )}

      <ConfirmDialog
        open={confirmRemoveOpen}
        onClose={() => setConfirmRemoveOpen(false)}
        title={`Remove ${entry.exercise.name}?`}
        confirmLabel="Remove"
        destructive
        onConfirm={() =>
          removeExercise({ workoutExerciseId: entry.workoutExerciseId }).catch(onSaveError)
        }
      />
    </GlassTile>
  )
}

// ---------- one set row ----------

function SetRow({
  set,
  record,
  onSaveError,
  onSetCompleted,
}: {
  set: Doc<'sets'>
  record: { bestWeightKg: number; bestEst1rm: number } | undefined
  onSaveError: () => void
  onSetCompleted: () => void
}) {
  const updateSet = useMutation(api.workouts.updateSet)
  const removeSet = useMutation(api.workouts.removeSet)

  // Inputs are local state while typing; committed to the server on blur /
  // when the set is checked off. Empty string instead of "0" placeholder.
  const [weight, setWeight] = useState(set.weightKg > 0 ? String(set.weightKg) : '')
  const [reps, setReps] = useState(set.reps > 0 ? String(set.reps) : '')

  const parsedWeight = parseFloat(weight) || 0
  const parsedReps = parseInt(reps, 10) || 0

  // A completed working set that beats (or sets) the record gets a trophy.
  const isPr = set.completed && !set.isWarmup && beatsRecord(set.weightKg, set.reps, record)
  // …and one the record has left behind gets a red slash. The active workout
  // is always eligible to be measured against the record (it's happening
  // now), so unlike the history view there's no achievedAt check here.
  const conquered =
    set.completed && !set.isWarmup && behindRecord(set.weightKg, set.reps, record)

  function commit(extra?: { completed?: boolean }) {
    updateSet({
      setId: set._id,
      weightKg: parsedWeight,
      reps: parsedReps,
      ...extra,
    }).catch(onSaveError)
  }

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: SET_ROW_COLUMNS,
        alignItems: 'center',
        gap: 1,
        borderRadius: '8px',
        py: 0.25,
        bgcolor: set.completed ? 'rgb(122 154 82 / 0.1)' : 'transparent',
      }}
    >
      {/* Set number badge; tap to toggle warm-up. The "conquered" slash lands
          here rather than on the weight/reps fields — those are live text
          inputs, and striking through what you're mid-way through typing
          reads as an error state rather than an achievement. */}
      <ButtonBase
        title={conquered ? 'Beaten by your PR' : 'Tap to toggle warm-up'}
        sx={{
          justifySelf: 'center',
          borderRadius: '6px',
          px: 1,
          py: 0.5,
          fontSize: '0.875rem',
          fontWeight: 600,
          color: set.isWarmup ? 'pr.main' : 'text.secondary',
          ...(conquered && {
            textDecoration: 'line-through',
            textDecorationColor: 'var(--color-error)',
            opacity: 0.55,
          }),
        }}
        onClick={() => updateSet({ setId: set._id, isWarmup: !set.isWarmup }).catch(onSaveError)}
      >
        {set.isWarmup ? 'W' : set.setNumber}
        {isPr && ' 🏆'}
      </ButtonBase>

      <TextField
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
        onBlur={() => commit()}
        placeholder="0"
        size="small"
        slotProps={{
          htmlInput: {
            inputMode: 'decimal',
            style: { textAlign: 'center' },
            onFocus: (e: React.FocusEvent<HTMLInputElement>) => e.target.select(),
          },
        }}
        sx={{ '& .MuiInputBase-input': { fontVariantNumeric: 'tabular-nums' } }}
      />
      <TextField
        value={reps}
        onChange={(e) => setReps(e.target.value)}
        onBlur={() => commit()}
        placeholder="0"
        size="small"
        slotProps={{
          htmlInput: {
            inputMode: 'numeric',
            style: { textAlign: 'center' },
            onFocus: (e: React.FocusEvent<HTMLInputElement>) => e.target.select(),
          },
        }}
        sx={{ '& .MuiInputBase-input': { fontVariantNumeric: 'tabular-nums' } }}
      />

      {/* Done toggle — also commits current weight/reps */}
      <ButtonBase
        aria-label={set.completed ? 'Mark not done' : 'Mark done'}
        sx={{
          justifySelf: 'center',
          borderRadius: '8px',
          px: 1.5,
          py: 0.75,
          fontWeight: 'bold',
          bgcolor: set.completed ? 'success.main' : 'transparent',
          color: set.completed ? '#000' : 'text.secondary',
          border: set.completed ? 'none' : '1px solid',
          borderColor: 'divider',
        }}
        onClick={() => {
          const nowCompleted = !set.completed
          commit({ completed: nowCompleted })
          // Only finishing a set starts a rest — un-checking one (a
          // correction) shouldn't.
          if (nowCompleted) onSetCompleted()
        }}
      >
        ✓
      </ButtonBase>

      <IconButton
        size="small"
        aria-label="Remove set"
        sx={{ justifySelf: 'center', color: 'text.secondary' }}
        onClick={() => removeSet({ setId: set._id }).catch(onSaveError)}
      >
        ✕
      </IconButton>
    </Box>
  )
}
