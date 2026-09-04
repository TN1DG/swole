import { useSearchParams } from 'react-router-dom'
import { Box, Typography } from '@mui/material'
import { SegmentedControl } from '../../components/SegmentedControl'
import { RoutinesTab } from '../routines/RoutinesPage'
import { ExercisesTab } from '../exercises/ExercisesPage'

type Segment = 'routines' | 'exercises'

// Routines and Exercises used to be separate bottom-nav tabs; merged here
// (same segmented-tab pattern as History/Friends) to free a tab slot for
// Nutrition. The segment lives in the URL rather than local state so
// `/library?tab=exercises` (what `/exercises`, `/routines`, and `/favorites`
// now redirect to) deep-links correctly regardless of how this page mounts.
export function LibraryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab: Segment = searchParams.get('tab') === 'exercises' ? 'exercises' : 'routines'
  const favoritesOnly = searchParams.get('favorites') === '1'

  function handleTabChange(next: Segment) {
    setSearchParams(next === 'routines' ? {} : { tab: next }, { replace: true })
  }

  return (
    <Box>
      <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
        Library
      </Typography>

      <Box sx={{ mt: 2 }}>
        <SegmentedControl
          value={tab}
          onChange={handleTabChange}
          options={[
            { value: 'routines', label: 'Routines' },
            { value: 'exercises', label: 'Exercises' },
          ]}
        />
      </Box>

      {tab === 'routines' ? <RoutinesTab /> : <ExercisesTab initialFavoritesOnly={favoritesOnly} />}
    </Box>
  )
}
