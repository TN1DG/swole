import { Navigate, Route, Routes } from 'react-router-dom'
import { Authenticated, Unauthenticated, AuthLoading } from 'convex/react'
import { AppLayout } from './components/AppLayout'
import { SignInPage } from './features/auth/SignInPage'
import { WorkoutsPage } from './features/workouts/WorkoutsPage'
import { HistoryPage } from './features/history/HistoryPage'
import { WorkoutDetailPage } from './features/history/WorkoutDetailPage'
import { SharePage } from './features/share/SharePage'
import { RoutinesPage } from './features/routines/RoutinesPage'
import { ExercisesPage } from './features/exercises/ExercisesPage'
import { FavoritesPage } from './features/favorites/FavoritesPage'
import { ProfilePage } from './features/profile/ProfilePage'
import { StatsPage } from './features/stats/StatsPage'

export default function App() {
  return (
    <>
      {/* While Convex checks for an existing session, show a splash. */}
      <AuthLoading>
        <div className="flex min-h-svh items-center justify-center text-muted">
          Loading…
        </div>
      </AuthLoading>

      {/* Not signed in -> only the sign-in screen exists. */}
      <Unauthenticated>
        <SignInPage />
      </Unauthenticated>

      {/* Signed in -> the actual app. */}
      <Authenticated>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<WorkoutsPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/history/:workoutId" element={<WorkoutDetailPage />} />
            <Route path="/share/:workoutId" element={<SharePage />} />
            <Route path="/favorites" element={<FavoritesPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/routines" element={<RoutinesPage />} />
            <Route path="/exercises" element={<ExercisesPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Authenticated>
    </>
  )
}
