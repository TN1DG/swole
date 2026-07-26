import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from 'convex/react'
import { Box, Button, Typography } from '@mui/material'
import { api } from '../../../convex/_generated/api'
import { ClipboardIcon } from '../../components/icons'
import { FirstVisitTip } from '../../components/FirstVisitTip'
import { GlassTile } from '../../components/GlassTile'
import { RoutineEditor, type RoutineDraft } from './RoutineEditor'

export function RoutinesPage() {
  const routines = useQuery(api.routines.list)
  const startFromRoutine = useMutation(api.routines.startFromRoutine)
  const navigate = useNavigate()

  // null = list view; otherwise the editor is open ('new' or an existing draft).
  const [editing, setEditing] = useState<RoutineDraft | 'new' | null>(null)
  const [startError, setStartError] = useState<string | null>(null)

  if (editing !== null) {
    return (
      <RoutineEditor
        initial={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
      />
    )
  }

  async function handleStart(routineId: (typeof routines & object)[number]['_id']) {
    setStartError(null)
    try {
      await startFromRoutine({ routineId })
      navigate('/') // jump to the Workout tab, which now shows the active session
    } catch {
      setStartError('Finish your current workout first.')
    }
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
          Routines
        </Typography>
        <Button variant="contained" size="small" onClick={() => setEditing('new')}>
          + New
        </Button>
      </Box>
      <FirstVisitTip tabKey="routines" />

      {startError && (
        <Typography variant="body2" color="error" sx={{ mt: 1.5 }}>
          {startError}
        </Typography>
      )}

      {routines === undefined ? (
        <Typography sx={{ mt: 4, textAlign: 'center' }} color="text.secondary">
          Loading…
        </Typography>
      ) : routines.length === 0 ? (
        <Box sx={{ mt: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, textAlign: 'center' }}>
          <ClipboardIcon size={32} />
          <Typography color="text.secondary">No routines yet. Build one and start workouts with two taps.</Typography>
        </Box>
      ) : (
        <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {routines.map((routine) => (
            <GlassTile key={routine._id} sx={{ p: 2 }}>
              <Typography sx={{ fontWeight: 600 }}>{routine.name}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {routine.exercises.map((ex) => `${ex.targetSets}×${ex.name}`).join(' · ')}
              </Typography>
              <Box sx={{ mt: 1.5, display: 'flex', gap: 1 }}>
                <Button variant="contained" fullWidth onClick={() => void handleStart(routine._id)}>
                  Start
                </Button>
                <Button variant="outlined" color="inherit" fullWidth onClick={() => setEditing(routine)}>
                  Edit
                </Button>
              </Box>
            </GlassTile>
          ))}
        </Box>
      )}
    </Box>
  )
}
