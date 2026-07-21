import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { useAuthActions } from '@convex-dev/auth/react'
import { api } from '../../../convex/_generated/api'
import { formatShortDate } from '../../lib/dates'
import { BarbellIcon, HeartOutlineIcon } from '../../components/icons'

export function ProfilePage() {
  const profile = useQuery(api.profiles.getMine)
  const updateDisplayName = useMutation(api.profiles.updateDisplayName)
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
        <Stat icon={<BarbellIcon />} label="Workouts" value={String(profile!.workoutCount)} />
        <Stat label="PRs" value={`🏆 ${profile!.prCount}`} />
        <Stat
          icon={<HeartOutlineIcon />}
          label="Favorites"
          value={String(profile!.favoriteCount)}
        />
      </div>

      <button
        type="button"
        onClick={() => void signOut()}
        className="mt-6 w-full rounded-xl border border-border py-3 font-semibold text-red-400"
      >
        Sign out
      </button>
    </div>
  )
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string
  value: string
  icon?: React.ReactNode
}) {
  return (
    <div className="rounded-xl bg-surface-2 p-3 text-center">
      <p className="flex items-center justify-center gap-1 text-xs text-muted uppercase">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-lg font-bold">{value}</p>
    </div>
  )
}
