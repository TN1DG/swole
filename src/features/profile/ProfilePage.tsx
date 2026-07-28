import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from 'convex/react'
import { useAuthActions } from '@convex-dev/auth/react'
import { Box, Button, ButtonBase, Checkbox, Stack, TextField, Typography } from '@mui/material'
import { api } from '../../../convex/_generated/api'
import { formatShortDate } from '../../lib/dates'
import { errorMessage } from '../../lib/errors'
import {
  BarbellIcon,
  ClipboardIcon,
  FlameIcon,
  HeartOutlineIcon,
  PeopleIcon,
} from '../../components/icons'
import { StatTile } from '../../components/StatTile'
import { FirstVisitTip } from '../../components/FirstVisitTip'
import { ConsistencyRing } from '../../components/ConsistencyRing'
import { GlassCard } from '../../components/GlassCard'
import { GlassTile } from '../../components/GlassTile'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Avatar } from '../../components/Avatar'
import { AvatarUploadDialog } from './AvatarUploadDialog'
import { useAvatarPicker } from './useAvatarPicker'
import { WhatsNewDialog } from '../releases/WhatsNewDialog'
import { CURRENT_RELEASE } from '../releases/releaseNotes'
import { TIER_LABELS } from '../../lib/tierLabels'

export function ProfilePage() {
  const profile = useQuery(api.profiles.getMine)
  const updateDisplayName = useMutation(api.profiles.updateDisplayName)
  const setWorkoutsPublic = useMutation(api.profiles.setWorkoutsPublic)
  const submitFeatureRequest = useMutation(api.featureRequests.submit)
  const deleteAccount = useMutation(api.account.deleteAccount)
  const { signOut } = useAuthActions()

  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const [featureText, setFeatureText] = useState('')
  const [featureError, setFeatureError] = useState<string | null>(null)
  const [featureSent, setFeatureSent] = useState(false)

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [whatsNewOpen, setWhatsNewOpen] = useState(false)

  const removeAvatar = useMutation(api.profiles.removeAvatar)
  const { imageSrc, onFileChange, clear: clearPickedImage } = useAvatarPicker()

  if (profile === undefined) {
    return (
      <Typography sx={{ mt: 8, textAlign: 'center' }} color="text.secondary">
        Loading…
      </Typography>
    )
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    try {
      await updateDisplayName({ displayName: name })
      setEditing(false)
    } catch (err) {
      setError(errorMessage(err, 'Could not save.'))
    }
  }

  async function handleSubmitFeatureRequest(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFeatureError(null)
    setFeatureSent(false)
    try {
      await submitFeatureRequest({ text: featureText })
      setFeatureText('')
      setFeatureSent(true)
    } catch (err) {
      setFeatureError(errorMessage(err, 'Could not send.'))
    }
  }

  async function handleDeleteAccount() {
    setDeleteError(null)
    setDeleting(true)
    try {
      await deleteAccount({})
      await signOut()
    } catch (err) {
      setDeleteError(errorMessage(err, 'Could not delete account.'))
      setDeleting(false)
    }
  }

  return (
    <Box>
      <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
        Profile
      </Typography>
      <FirstVisitTip tabKey="profile" />

      <GlassCard sx={{ mt: 2 }}>
        {editing ? (
          <Box component="form" onSubmit={handleSave} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <TextField
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Display name"
              size="small"
              fullWidth
            />
            {error && (
              <Typography variant="body2" color="error">
                {error}
              </Typography>
            )}
            <Stack direction="row" spacing={1}>
              <Button type="submit" variant="contained" fullWidth>
                Save
              </Button>
              <Button type="button" variant="outlined" color="inherit" fullWidth onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </Stack>
          </Box>
        ) : (
          <Stack
            direction="row"
            spacing={1.5}
            sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}
          >
            <Box
              component="label"
              sx={{ cursor: 'pointer', flexShrink: 0, position: 'relative' }}
              title="Change photo"
            >
              <Avatar src={profile?.avatarUrl} name={profile?.displayName ?? profile?.email} size={64} />
              <Box
                component="input"
                type="file"
                accept="image/*"
                onChange={onFileChange}
                sx={{ display: 'none' }}
              />
            </Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography noWrap variant="h6" sx={{ fontWeight: 'bold' }}>
                {profile?.displayName ?? profile?.email}
              </Typography>
              {profile?.displayName && (
                <Typography noWrap variant="body2" color="text.secondary">
                  {profile.email}
                </Typography>
              )}
              {profile?.username && (
                <Typography noWrap variant="body2" color="primary.main">
                  @{profile.username}
                </Typography>
              )}
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                Member since {formatShortDate(profile!.memberSince)}
              </Typography>
            </Box>
            <Stack spacing={0.5} sx={{ flexShrink: 0, alignItems: 'stretch' }}>
              <Button
                size="small"
                variant="outlined"
                color="inherit"
                onClick={() => {
                  setName(profile?.displayName ?? '')
                  setEditing(true)
                }}
              >
                Edit
              </Button>
              {profile?.avatarUrl && (
                <Button
                  size="small"
                  variant="text"
                  color="inherit"
                  sx={{ color: 'text.secondary', fontSize: '0.75rem' }}
                  onClick={() => void removeAvatar({})}
                >
                  Remove photo
                </Button>
              )}
            </Stack>
          </Stack>
        )}
      </GlassCard>

      <GlassCard sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
        <ConsistencyRing streakWeeks={profile!.streakWeeks} size={52} />
        <Box>
          <Typography sx={{ fontWeight: 600 }}>{TIER_LABELS[profile!.tier] || 'Building streak…'}</Typography>
          <Typography variant="body2" color="text.secondary">
            {profile!.streakWeeks} week streak
          </Typography>
        </Box>
      </GlassCard>

      <GlassCard sx={{ mt: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography sx={{ fontWeight: 600 }}>Points</Typography>
        <Typography variant="h6" sx={{ fontWeight: 'bold', fontVariantNumeric: 'tabular-nums' }}>
          🪙 {profile!.pointsBalance}
        </Typography>
      </GlassCard>

      <Box sx={{ mt: 2, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: 1.5 }}>
        <StatTile centered icon={<BarbellIcon />} label="Workouts" value={String(profile!.workoutCount)} />
        <StatTile centered label="PRs" value={`🏆 ${profile!.prCount}`} />
        <StatTile centered icon={<HeartOutlineIcon />} label="Favorites" value={String(profile!.favoriteCount)} />
      </Box>

      <GlassCard
        component="label"
        sx={{
          mt: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          borderRadius: '12px',
          cursor: 'pointer',
        }}
      >
        <Box>
          <Typography sx={{ fontWeight: 600 }}>Public workouts</Typography>
          <Typography variant="body2" color="text.secondary">
            Anyone can view your workout history, not just accepted friends.
          </Typography>
        </Box>
        <Checkbox
          checked={profile!.workoutsPublic}
          onChange={(e) => void setWorkoutsPublic({ workoutsPublic: e.target.checked })}
          sx={{ flexShrink: 0 }}
        />
      </GlassCard>

      <GlassCard sx={{ mt: 2 }}>
        <Typography sx={{ display: 'flex', alignItems: 'center', gap: 1, fontWeight: 600 }}>
          <ClipboardIcon /> Suggest a feature
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Got an idea? It goes straight to the developer.
        </Typography>
        <Box component="form" onSubmit={handleSubmitFeatureRequest} sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <TextField
            value={featureText}
            onChange={(e) => setFeatureText(e.target.value)}
            placeholder="I'd love to see…"
            multiline
            rows={3}
            fullWidth
          />
          {featureError && (
            <Typography variant="body2" color="error">
              {featureError}
            </Typography>
          )}
          {featureSent && (
            <Typography variant="body2" color="success.main">
              Sent — thanks!
            </Typography>
          )}
          <Button type="submit" variant="contained" disabled={!featureText.trim()}>
            Submit
          </Button>
        </Box>
      </GlassCard>

      <Link to="/friends" style={{ textDecoration: 'none', display: 'block' }}>
        <GlassTile
          sx={{
            mt: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1,
            py: 1.5,
            fontWeight: 600,
            color: 'text.primary',
          }}
        >
          <PeopleIcon /> Friends
        </GlassTile>
      </Link>

      <Link to="/stats" style={{ textDecoration: 'none', display: 'block' }}>
        <GlassTile
          sx={{
            mt: 1.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1,
            py: 1.5,
            fontWeight: 600,
            color: 'text.primary',
          }}
        >
          <FlameIcon /> My Stats
        </GlassTile>
      </Link>

      {/* The post-update popup shows once and is then gone for good, so give
          it somewhere to live afterwards. */}
      <ButtonBase onClick={() => setWhatsNewOpen(true)} sx={{ mt: 1.5, width: '100%', display: 'block' }}>
        <GlassTile
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1,
            py: 1.5,
            fontWeight: 600,
            color: 'text.primary',
          }}
        >
          ✨ What&rsquo;s new
        </GlassTile>
      </ButtonBase>

      <WhatsNewDialog
        open={whatsNewOpen}
        release={CURRENT_RELEASE}
        onClose={() => setWhatsNewOpen(false)}
      />

      <Button
        fullWidth
        variant="outlined"
        color="inherit"
        sx={{ mt: 1.5, color: 'error.main' }}
        onClick={() => void signOut()}
      >
        Sign out
      </Button>

      <GlassCard sx={{ mt: 4, borderColor: 'rgb(248 113 113 / 0.3)' }}>
        <Typography color="error" sx={{ fontWeight: 600 }}>
          Danger zone
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Permanently delete your account and everything in it — workouts, routines, friends,
          PRs. This can't be undone.
        </Typography>
        {deleteError && (
          <Typography variant="body2" color="error" sx={{ mt: 1 }}>
            {deleteError}
          </Typography>
        )}
        <Button
          fullWidth
          variant="outlined"
          color="error"
          disabled={deleting}
          sx={{ mt: 1.5 }}
          onClick={() => setConfirmOpen(true)}
        >
          {deleting ? 'Deleting…' : 'Delete Account'}
        </Button>
      </GlassCard>

      {imageSrc && <AvatarUploadDialog imageSrc={imageSrc} onClose={clearPickedImage} />}

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Delete your account?"
        description="Every workout, routine, PR, and friend connection you have will be gone for good — there's no getting this back."
        confirmLabel="Yes, delete everything"
        destructive
        onConfirm={() => void handleDeleteAccount()}
      />
    </Box>
  )
}
