import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from 'convex/react'
import { useAuthActions } from '@convex-dev/auth/react'
import { api } from '../../../convex/_generated/api'
import { formatShortDate } from '../../lib/dates'
import { BarbellIcon, FlameIcon, HeartOutlineIcon, PeopleIcon } from '../../components/icons'
import { StatTile } from '../../components/StatTile'

export function ProfilePage() {
  const profile = useQuery(api.profiles.getMine)
  const updateDisplayName = useMutation(api.profiles.updateDisplayName)
  const setWorkoutsPublic = useMutation(api.profiles.setWorkoutsPublic)
  const { signOut } = useAuthActions()

  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (profile === undefined) {
    return <p className="mt-8 text-center text-muted">Loading…</p>
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    try {
      await updateDisplayName({ displayName: name })
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Profile</h1>

      <div className="mt-4 rounded-2xl border border-border bg-surface p-4">
        {editing ? (
          <form onSubmit={handleSave} className="flex flex-col gap-2">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Display name"
              className="rounded-lg border border-border bg-surface-2 px-3 py-2 outline-none focus:border-accent"
            />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 rounded-lg bg-accent py-2 font-semibold text-accent-fg"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="flex-1 rounded-lg border border-border py-2 font-semibold text-muted"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-lg font-bold">{profile?.displayName ?? profile?.email}</p>
              {profile?.displayName && (
                <p className="text-sm text-muted">{profile.email}</p>
              )}
              {profile?.username && (
                <p className="text-sm text-accent">@{profile.username}</p>
              )}
              <p className="mt-1 text-xs text-muted">
                Member since {formatShortDate(profile!.memberSince)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setName(profile?.displayName ?? '')
                setEditing(true)
              }}
              className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-sm text-muted"
            >
              Edit
            </button>
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <StatTile
          centered
          icon={<BarbellIcon />}
          label="Workouts"
          value={String(profile!.workoutCount)}
        />
        <StatTile centered label="PRs" value={`🏆 ${profile!.prCount}`} />
        <StatTile
          centered
          icon={<HeartOutlineIcon />}
          label="Favorites"
          value={String(profile!.favoriteCount)}
        />
      </div>

      <label className="mt-4 flex items-center justify-between gap-2 rounded-xl border border-border bg-surface p-4">
        <div>
          <p className="font-semibold">Public workouts</p>
          <p className="text-sm text-muted">
            Anyone can view your workout history, not just accepted friends.
          </p>
        </div>
        <input
          type="checkbox"
          checked={profile!.workoutsPublic}
          onChange={(e) => void setWorkoutsPublic({ workoutsPublic: e.target.checked })}
          className="h-5 w-5 shrink-0 accent-accent"
        />
      </label>

      <Link
        to="/friends"
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface py-3 font-semibold"
      >
        <PeopleIcon /> Friends
      </Link>

      <Link
        to="/stats"
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface py-3 font-semibold"
      >
        <FlameIcon /> My Stats
      </Link>

      <button
        type="button"
        onClick={() => void signOut()}
        className="mt-3 w-full rounded-xl border border-border py-3 font-semibold text-red-400"
      >
        Sign out
      </button>
    </div>
  )
}
