import { useState } from 'react'
import { useQuery } from 'convex/react'
import { Box, ButtonBase, Collapse, Typography } from '@mui/material'
import { api } from '../../../convex/_generated/api'
import { Avatar } from '../../components/Avatar'
import { SegmentedControl } from '../../components/SegmentedControl'
import { SwoleCoin } from '../../components/SwoleCoin'
import { usePeriodStart, type LeaderboardPeriod } from '../../lib/period'

// The clan's own leaderboard, which lives only here in the clan chat. "This
// week" is the weekly race whose winner is crowned MVP on Monday; "This month"
// is what adds up to the clan's CP.
export function ClanLeaderboardPanel() {
  const [period, setPeriod] = useState<LeaderboardPeriod>('week')
  const [open, setOpen] = useState(false)
  const periodStartMs = usePeriodStart(period)
  const board = useQuery(api.clanChat.leaderboard, { period, periodStartMs })

  const myRank = board ? board.findIndex((e) => e.isMe) + 1 : 0
  const summary = board
    ? board
        .slice(0, 2)
        .map((e, i) => `${i + 1}. ${e.isMe ? 'You' : e.displayName} ${e.points}`)
        .join(' · ') + (myRank > 2 ? ` · you #${myRank}` : '')
    : 'Loading…'

  return (
    <Box sx={{ flexShrink: 0, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
      <ButtonBase
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? 'Hide clan leaderboard' : 'Show clan leaderboard'}
        sx={{
          width: '100%',
          justifyContent: 'flex-start',
          gap: 1,
          pl: 'var(--app-gutter-left)',
          pr: 'var(--app-gutter-right)',
          py: 1,
          textAlign: 'left',
        }}
      >
        <Typography sx={{ flexShrink: 0 }}>🏆</Typography>
        <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }}>
          <Box component="span" sx={{ fontWeight: 600 }}>
            {period === 'week' ? 'This week' : 'This month'}:
          </Box>{' '}
          {summary}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
          {open ? '▴' : '▾'}
        </Typography>
      </ButtonBase>

      <Collapse in={open} unmountOnExit>
        <Box sx={{ pl: 'var(--app-gutter-left)', pr: 'var(--app-gutter-right)', pb: 1.5 }}>
          <SegmentedControl
            value={period}
            onChange={setPeriod}
            options={[
              { value: 'week', label: 'This week' },
              { value: 'month', label: 'This month' },
            ]}
          />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            {period === 'week'
              ? "Weekly race · Mon–Sun UTC · the winner is crowned MVP on Monday"
              : 'Calendar month · UTC · adds up to the clan’s CP'}
          </Typography>
          <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 0.75, maxHeight: '40svh', overflowY: 'auto' }}>
            {(board ?? []).map((e, i) => (
              <Box
                key={e.userId}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 1,
                  py: 0.75,
                  borderRadius: '10px',
                  bgcolor: e.isMe ? 'rgb(var(--color-accent-rgb) / 0.12)' : 'transparent',
                }}
              >
                <Typography variant="body2" color="text.secondary" sx={{ width: 18, flexShrink: 0, textAlign: 'center', fontWeight: 700 }}>
                  {period === 'week' && i === 0 && e.points > 0 ? '👑' : i + 1}
                </Typography>
                <Avatar src={e.avatarUrl} name={e.displayName} size={28} />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>
                    {e.displayName}
                    {e.isMe && (
                      <Typography component="span" variant="body2" color="text.secondary">
                        {' '}
                        (you)
                      </Typography>
                    )}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {e.daysTrained} {e.daysTrained === 1 ? 'day' : 'days'}
                    {e.mvpCount > 0 && ` · 🏆 ${e.mvpCount}× MVP`}
                    {e.isLeader && ' · Leader'}
                  </Typography>
                </Box>
                <Box sx={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 0.5, fontVariantNumeric: 'tabular-nums' }}>
                  <SwoleCoin size={14} title="points" />
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {e.points}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      </Collapse>
    </Box>
  )
}
