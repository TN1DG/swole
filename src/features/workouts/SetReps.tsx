import Tooltip from '@mui/material/Tooltip'
import Box from '@mui/material/Box'
import type { SetLike } from './setDisplay'

// A finished set's reps. An estimate (a to-failure set logged without a count)
// shows as "~8" with an explanation; a to-failure set nothing could be
// estimated from shows a dash rather than a misleading 0.
export function SetReps({ set }: { set: SetLike }) {
  if (set.repsEstimated) {
    return (
      <Tooltip title="Estimated — went to failure without counting">
        <Box component="span" sx={{ fontStyle: 'italic' }}>
          ~{set.reps}
        </Box>
      </Tooltip>
    )
  }
  if (set.toFailure && set.reps === 0) return <>—</>
  return <>{set.reps}</>
}
