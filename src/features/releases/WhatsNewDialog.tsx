import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material'
import { api } from '../../../convex/_generated/api'
import { formatShortDate } from '../../lib/dates'
import { CURRENT_RELEASE, shouldShowRelease, type Release } from './releaseNotes'

/**
 * The popup itself. Presentational and fully controlled, so the same
 * component serves both the automatic post-update appearance and the
 * "What's new" entry on the profile page.
 */
export function WhatsNewDialog({
  open,
  release,
  onClose,
}: {
  open: boolean
  release: Release
  onClose: () => void
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      // scroll="paper" keeps the title and the button pinned while a long
      // change list scrolls between them — on a short phone screen the
      // alternative is a dialog whose dismiss button is off-screen.
      scroll="paper"
      slotProps={{ paper: { sx: { borderRadius: '16px' } } }}
    >
      <DialogTitle sx={{ pb: 0.5, fontWeight: 700 }}>
        What&rsquo;s new
        <Typography variant="overline" color="text.secondary" sx={{ display: 'block' }}>
          {release.version} · {formatShortDate(release.releasedAt)}
        </Typography>
      </DialogTitle>

      <DialogContent dividers>
        <Typography variant="body2" sx={{ mb: 2 }}>
          {release.summary}
        </Typography>

        <Box
          component="ul"
          sx={{ m: 0, p: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 1.5 }}
        >
          {release.changes.map((change) => (
            <Box
              key={change}
              component="li"
              sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}
            >
              <Box
                aria-hidden
                sx={{
                  // Nudged down to sit on the first line's optical centre
                  // rather than its top edge.
                  mt: '0.45em',
                  flexShrink: 0,
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  bgcolor: 'primary.main',
                }}
              />
              <Typography variant="body2" color="text.secondary">
                {change}
              </Typography>
            </Box>
          ))}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button variant="contained" fullWidth onClick={onClose}>
          Got it
        </Button>
      </DialogActions>
    </Dialog>
  )
}

/**
 * Decides whether this user is owed the popup, and records the dismissal.
 *
 * Mounted once in AppLayout so it can appear over whichever page the user
 * happens to land on after an update. `dismissed` is local state as well as a
 * server write so the dialog closes instantly rather than waiting on the
 * round trip — same pattern as FirstVisitTip.
 */
export function WhatsNewGate() {
  const profile = useQuery(api.profiles.getMine)
  const markSeen = useMutation(api.profiles.markReleaseSeen)
  const [dismissed, setDismissed] = useState(false)

  if (dismissed || !profile) return null

  const show = shouldShowRelease({
    release: CURRENT_RELEASE,
    lastSeenRelease: profile.lastSeenRelease,
    memberSince: profile.memberSince,
  })
  if (!show) return null

  return (
    <WhatsNewDialog
      open
      release={CURRENT_RELEASE}
      onClose={() => {
        setDismissed(true)
        void markSeen({ version: CURRENT_RELEASE.version })
      }}
    />
  )
}
