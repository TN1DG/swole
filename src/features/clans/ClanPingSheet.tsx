import { useState } from 'react'
import { useQuery } from 'convex/react'
import { Box, Button, Checkbox, List, ListItemButton, Typography } from '@mui/material'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { BottomSheet } from '../../components/BottomSheet'
import { Avatar } from '../../components/Avatar'

// Who to call to the gym: the whole clan, or the clanmates you tick.
export function ClanPingSheet({
  onPing,
  onClose,
}: {
  // undefined = the whole clan.
  onPing: (targetUserIds: Id<'users'>[] | undefined) => void
  onClose: () => void
}) {
  const members = useQuery(api.clanChat.members)
  const others = (members ?? []).filter((m) => !m.isMe)
  const [picked, setPicked] = useState<Set<Id<'users'>>>(new Set())

  function toggle(id: Id<'users'>) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <BottomSheet open onClose={onClose} paperSx={{ p: 2 }}>
      <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
        💪 Gym ping
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
        Tell your clan you're heading to the gym. They can answer “I'm going”.
      </Typography>

      <Button
        variant="contained"
        fullWidth
        sx={{ mt: 2 }}
        disabled={others.length === 0}
        onClick={() => onPing(undefined)}
      >
        Ping the whole clan
      </Button>

      <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
        Or pick clanmates
      </Typography>
      {members !== undefined && others.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Nobody else is in your clan yet. Share your invite code.
        </Typography>
      ) : (
        <List disablePadding sx={{ maxHeight: '40svh', overflowY: 'auto' }}>
          {others.map((m) => (
            <ListItemButton key={m.userId} onClick={() => toggle(m.userId)} sx={{ px: 0.5, gap: 1 }}>
              <Checkbox
                edge="start"
                checked={picked.has(m.userId)}
                tabIndex={-1}
                slotProps={{ input: { 'aria-label': `Ping ${m.displayName}` } }}
              />
              <Avatar src={m.avatarUrl} name={m.displayName} size={28} />
              <Typography noWrap sx={{ flex: 1, minWidth: 0 }}>
                {m.displayName}
              </Typography>
            </ListItemButton>
          ))}
        </List>
      )}

      <Box sx={{ mt: 1.5, display: 'flex', gap: 1 }}>
        <Button variant="outlined" color="inherit" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="outlined" fullWidth disabled={picked.size === 0} onClick={() => onPing([...picked])}>
          {picked.size === 0 ? 'Ping selected' : `Ping ${picked.size} selected`}
        </Button>
      </Box>
    </BottomSheet>
  )
}
