import { Navigate, Route, Routes } from 'react-router-dom'
import { Authenticated, Unauthenticated, AuthLoading } from 'convex/react'
import { Box } from '@mui/material'
import { AppLayout } from './components/AppLayout'
import { OnboardingGate } from './features/onboarding/OnboardingGate'
import { SignInPage } from './features/auth/SignInPage'
import { WorkoutsPage } from './features/workouts/WorkoutsPage'
import { HistoryPage } from './features/history/HistoryPage'
import { WorkoutDetailPage } from './features/history/WorkoutDetailPage'
import { SharePage } from './features/share/SharePage'
import { RoutinesPage } from './features/routines/RoutinesPage'
import { ExercisesPage } from './features/exercises/ExercisesPage'
import { ProfilePage } from './features/profile/ProfilePage'
import { StatsPage } from './features/stats/StatsPage'
import { FriendsPage } from './features/friends/FriendsPage'
import { FriendWorkoutsPage } from './features/friends/FriendWorkoutsPage'
import { FriendWorkoutDetailPage } from './features/friends/FriendWorkoutDetailPage'
import { FriendTrophyPage } from './features/friends/FriendTrophyPage'
import { FriendChatPage } from './features/friends/FriendChatPage'
import { ComposePostPage } from './features/feed/ComposePostPage'
import { PostDetailPage } from './features/feed/PostDetailPage'
import { NotificationsPage } from './features/notifications/NotificationsPage'

export default function App() {
  return (
    <>
      {/* While Convex checks for an existing session, show a splash. */}
      <AuthLoading>
        <Box sx={{ display: 'flex', minHeight: '100svh', alignItems: 'center', justifyContent: 'center', color: 'text.secondary' }}>
          Loading…
        </Box>
      </AuthLoading>

      {/* Not signed in -> only the sign-in screen exists. */}
      <Unauthenticated>
        <SignInPage />
      </Unauthenticated>

      {/* Signed in -> the welcome carousel first-run, then the actual app. */}
      <Authenticated>
        <OnboardingGate>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<WorkoutsPage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/history/:workoutId" element={<WorkoutDetailPage />} />
              <Route path="/share/:workoutId" element={<SharePage />} />
              {/* 3 segments vs 2, so these can never collide. */}
              <Route path="/feed/compose/:workoutId" element={<ComposePostPage />} />
              <Route path="/feed/:postId" element={<PostDetailPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/favorites" element={<Navigate to="/exercises" replace />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/stats" element={<StatsPage />} />
              <Route path="/friends" element={<FriendsPage />} />
              <Route path="/friends/:userId/chat" element={<FriendChatPage />} />
              <Route path="/friends/:userId" element={<FriendWorkoutsPage />} />
              <Route path="/friends/:userId/:workoutId" element={<FriendWorkoutDetailPage />} />
              <Route
                path="/friends/:userId/:workoutId/trophy"
                element={<FriendTrophyPage />}
              />
              <Route path="/routines" element={<RoutinesPage />} />
              <Route path="/exercises" element={<ExercisesPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </OnboardingGate>
      </Authenticated>
    </>
  )
}
