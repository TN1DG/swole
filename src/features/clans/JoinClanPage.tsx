import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery } from 'convex/react'
import { Box, Button, Typography } from '@mui/material'
import { api } from '../../../convex/_generated/api'
import { GlassTile } from '../../components/GlassTile'
import { errorMessage } from '../../lib/errors'

// Where a shared invite link (/clans/join/<code>) lands.
export function JoinClanPage() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const preview = useQuery(api.clans.previewByCode, { code })
  const join = useMutation(api.clans.joinByCode)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const toClans = () => navigate('/friends?tab=clans', { replace: true })

  async function handleJoin() {
    setError(null)
    setBusy(true)
    try {
      await join({ code })
      toClans()
    } catch (err) {
      setError(errorMessage(err, 'Could not join that clan.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Box>
      <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
        Join a clan
      </Typography>
      <GlassTile sx={{ mt: 2, p: 2 }}>
        {preview === undefined ? (
          <Typography color="text.secondary">Loading…</Typography>
        ) : preview === null ? (
          <Typography color="text.secondary">This invite link isn't valid any more. Ask for a new one.</Typography>
        ) : (
          <>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {preview.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {preview.memberCount}/{preview.maxMembers} members
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
              Every point you earn from training this month adds to the clan's CP.
            </Typography>
            <Box sx={{ mt: 2 }}>
              {preview.alreadyMember ? (
                <Button variant="contained" onClick={toClans}>
                  You're in. View clan
                </Button>
              ) : preview.inOtherClan ? (
                <Typography variant="body2" color="text.secondary">
                  You're already in a clan. Leave it first to join this one.
                </Typography>
              ) : preview.isFull ? (
                <Typography variant="body2" color="text.secondary">
                  This clan is full.
                </Typography>
              ) : (
                <Button variant="contained" disabled={busy} onClick={() => void handleJoin()}>
                  Join {preview.name}
                </Button>
              )}
            </Box>
          </>
        )}
        {error && (
          <Typography variant="body2" color="error" sx={{ mt: 1.5 }}>
            {error}
          </Typography>
        )}
      </GlassTile>
      <Button component={Link} to="/friends?tab=clans" color="inherit" sx={{ mt: 1.5 }}>
        Back
      </Button>
    </Box>
  )
}
