import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Authenticated, Unauthenticated, AuthLoading } from 'convex/react'
import { Box } from '@mui/material'
import { AppLayout } from './components/AppLayout'
import { OnboardingGate } from './features/onboarding/OnboardingGate'
import { SignInPage } from './features/auth/SignInPage'

// Route-level code splitting: everything below is its own chunk, fetched
// only once its route is actually visited, instead of all ~16 pages (plus
// whatever each pulls in — modern-screenshot for the share/trophy cards,
// full emoji-picker-style icon sets, etc.) shipping in the one bundle every
// visitor downloads just to see the default Workouts screen.
const WorkoutsPage = lazy(() =>
  import('./features/workouts/WorkoutsPage').then((m) => ({ default: m.WorkoutsPage })),
)
const HistoryPage = lazy(() =>
  import('./features/history/HistoryPage').then((m) => ({ default: m.HistoryPage })),
)
const WorkoutDetailPage = lazy(() =>
  import('./features/history/WorkoutDetailPage').then((m) => ({ default: m.WorkoutDetailPage })),
)
const SharePage = lazy(() =>
  import('./features/share/SharePage').then((m) => ({ default: m.SharePage })),
)
const LibraryPage = lazy(() =>
  import('./features/library/LibraryPage').then((m) => ({ default: m.LibraryPage })),
)
const ProfilePage = lazy(() =>
  import('./features/profile/ProfilePage').then((m) => ({ default: m.ProfilePage })),
)
const StatsPage = lazy(() =>
  import('./features/stats/StatsPage').then((m) => ({ default: m.StatsPage })),
)
const CaloricConsistencyPage = lazy(() =>
  import('./features/nutrition/CaloricConsistencyPage').then((m) => ({
    default: m.CaloricConsistencyPage,
  })),
)
const FriendsPage = lazy(() =>
  import('./features/friends/FriendsPage').then((m) => ({ default: m.FriendsPage })),
)
const FriendWorkoutsPage = lazy(() =>
  import('./features/friends/FriendWorkoutsPage').then((m) => ({
    default: m.FriendWorkoutsPage,
  })),
)
const FriendWorkoutDetailPage = lazy(() =>
  import('./features/friends/FriendWorkoutDetailPage').then((m) => ({
    default: m.FriendWorkoutDetailPage,
  })),
)
const FriendTrophyPage = lazy(() =>
  import('./features/friends/FriendTrophyPage').then((m) => ({ default: m.FriendTrophyPage })),
)
const FriendChatPage = lazy(() =>
  import('./features/friends/FriendChatPage').then((m) => ({ default: m.FriendChatPage })),
)
const ComposePostPage = lazy(() =>
  import('./features/feed/ComposePostPage').then((m) => ({ default: m.ComposePostPage })),
)
const PostDetailPage = lazy(() =>
  import('./features/feed/PostDetailPage').then((m) => ({ default: m.PostDetailPage })),
)
const NotificationsPage = lazy(() =>
  import('./features/notifications/NotificationsPage').then((m) => ({
    default: m.NotificationsPage,
  })),
)

// Shown between picking a route and its chunk finishing download — same
// look as the AuthLoading splash below so a slow connection doesn't flash a
// different loading style depending on which gate is waiting.
function RouteFallback() {
  return (
    <Box
      sx={{
        display: 'flex',
        minHeight: '100svh',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'text.secondary',
      }}
    >
      Loading…
    </Box>
  )
}

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
          <Suspense fallback={<RouteFallback />}>
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
                <Route path="/favorites" element={<Navigate to="/library?tab=exercises&favorites=1" replace />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/stats" element={<StatsPage />} />
                <Route path="/nutrition/consistency" element={<CaloricConsistencyPage />} />
                <Route path="/friends" element={<FriendsPage />} />
                <Route path="/friends/:userId/chat" element={<FriendChatPage />} />
                <Route path="/friends/:userId" element={<FriendWorkoutsPage />} />
                <Route path="/friends/:userId/:workoutId" element={<FriendWorkoutDetailPage />} />
                <Route
                  path="/friends/:userId/:workoutId/trophy"
                  element={<FriendTrophyPage />}
                />
                <Route path="/library" element={<LibraryPage />} />
                <Route path="/routines" element={<Navigate to="/library" replace />} />
                <Route path="/exercises" element={<Navigate to="/library?tab=exercises" replace />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </Suspense>
        </OnboardingGate>
      </Authenticated>
    </>
  )
}
