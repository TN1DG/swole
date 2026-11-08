import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { Box, Button, TextField, Typography } from '@mui/material'
import { api } from '../../../convex/_generated/api'
import { GlassTile } from '../../components/GlassTile'
import { Avatar } from '../../components/Avatar'
import { SwoleCoin } from '../../components/SwoleCoin'
import { errorMessage } from '../../lib/errors'
import { usePeriodStart } from '../../lib/period'

type MyClan = NonNullable<FunctionReturnType<typeof api.clans.myClan>>

function inviteLink(code: string): string {
  return `${window.location.origin}/clans/join/${code}`
}

// The Board tab's "Clans" view: your clan (or a way to get one), then this
// month's clan standings. CP is points EARNED this calendar month, the same
// number the friends board ranks on, summed across the clan.
export function ClansPanel() {
  const monthStartMs = usePeriodStart('month')
  const myClan = useQuery(api.clans.myClan, { monthStartMs })
  const rankings = useQuery(api.clans.rankings, { monthStartMs })

  return (
    <>
      <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
        Calendar month · UTC
      </Typography>

      {myClan === undefined ? (
        <Typography sx={{ mt: 1.5, textAlign: 'center' }} color="text.secondary">
          Loading…
        </Typography>
      ) : myClan === null ? (
        <NoClan />
      ) : (
        <ClanCard clan={myClan} />
      )}

      <Typography variant="overline" color="text.secondary" component="h2" sx={{ display: 'block', mt: 2 }}>
        Clan rankings
      </Typography>
      {rankings === undefined ? null : rankings.length === 0 ? (
        <Typography variant="body2" sx={{ mt: 1, textAlign: 'center' }} color="text.secondary">
          No clans on the board yet this month.
        </Typography>
      ) : (
        <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {rankings.map((clan, i) => (
            <GlassTile
              key={clan.clanId}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 1.5,
                py: 1.5,
                ...(clan.isMine && { borderColor: 'rgb(var(--color-accent-rgb) / 0.4)' }),
              }}
            >
              <Typography sx={{ width: 20, flexShrink: 0, textAlign: 'center', fontWeight: 'bold' }} variant="body2" color="text.secondary">
                {i + 1}
              </Typography>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography noWrap sx={{ fontWeight: 500 }}>
                  {clan.name}
                  {clan.isMine && <Typography component="span" color="text.secondary"> (yours)</Typography>}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {clan.memberCount} {clan.memberCount === 1 ? 'member' : 'members'}
                </Typography>
              </Box>
              <CpAmount cp={clan.cp} />
            </GlassTile>
          ))}
        </Box>
      )}
    </>
  )
}

function CpAmount({ cp }: { cp: number }) {
  return (
    <Box sx={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 0.5, fontVariantNumeric: 'tabular-nums' }}>
      <SwoleCoin size={16} title="CP" />
      <Typography sx={{ fontWeight: 'bold' }}>{cp}</Typography>
      <Typography variant="caption" color="text.secondary">
        CP
      </Typography>
    </Box>
  )
}

function NoClan() {
  const create = useMutation(api.clans.create)
  const join = useMutation(api.clans.joinByCode)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function run(action: () => Promise<unknown>, fallback: string) {
    setError(null)
    setBusy(true)
    try {
      await action()
    } catch (err) {
      setError(errorMessage(err, fallback))
    } finally {
      setBusy(false)
    }
  }

  return (
    <GlassTile sx={{ mt: 1, p: 2 }}>
      <Typography sx={{ fontWeight: 600 }}>Team up</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
        Every point your clan earns from training adds to its CP. You can be in one clan, and join once a month.
      </Typography>

      <Box
        component="form"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) void run(() => create({ name }), 'Could not create the clan.')
        }}
        sx={{ mt: 2, display: 'flex', gap: 1 }}
      >
        <TextField
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Clan name"
          size="small"
          fullWidth
          slotProps={{ htmlInput: { maxLength: 24, 'aria-label': 'Clan name' } }}
        />
        <Button type="submit" variant="contained" disabled={busy} sx={{ flexShrink: 0 }}>
          Create
        </Button>
      </Box>

      <Box
        component="form"
        onSubmit={(e) => {
          e.preventDefault()
          if (code.trim()) void run(() => join({ code }), 'Could not join that clan.')
        }}
        sx={{ mt: 1, display: 'flex', gap: 1 }}
      >
        <TextField
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Invite code"
          size="small"
          fullWidth
          slotProps={{ htmlInput: { maxLength: 16, 'aria-label': 'Invite code' } }}
        />
        <Button type="submit" variant="outlined" color="inherit" disabled={busy} sx={{ flexShrink: 0 }}>
          Join
        </Button>
      </Box>

      {error && (
        <Typography variant="body2" color="error" sx={{ mt: 1.5 }}>
          {error}
        </Typography>
      )}
    </GlassTile>
  )
}

function ClanCard({ clan }: { clan: MyClan }) {
  const leave = useMutation(api.clans.leave)
  const kick = useMutation(api.clans.kick)
  const rotate = useMutation(api.clans.rotateInviteCode)
  const rename = useMutation(api.clans.rename)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)

  async function run(action: () => Promise<unknown>, fallback: string) {
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(errorMessage(err, fallback))
    }
  }

  async function share() {
    const url = inviteLink(clan.inviteCode)
    try {
      if (navigator.share) {
        await navigator.share({ title: `Join ${clan.name} on Swole`, url })
      } else {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    } catch {
      // Share sheet dismissed, or clipboard blocked; the code is on screen.
    }
  }

  const rankLabel =
    clan.rank !== null ? `#${clan.rank}` : clan.cp > 0 ? `${clan.rankScanLimit}+` : 'Unranked'

  return (
    <>
      <GlassTile sx={{ mt: 1, p: 2, borderColor: 'rgb(var(--color-accent-rgb) / 0.4)' }}>
        {renaming !== null ? (
          <Box
            component="form"
            onSubmit={(e) => {
              e.preventDefault()
              void run(async () => {
                await rename({ name: renaming })
                setRenaming(null)
              }, 'Could not rename the clan.')
            }}
            sx={{ display: 'flex', gap: 1 }}
          >
            <TextField
              value={renaming}
              onChange={(e) => setRenaming(e.target.value)}
              size="small"
              fullWidth
              autoFocus
              slotProps={{ htmlInput: { maxLength: 24, 'aria-label': 'New clan name' } }}
            />
            <Button type="submit" variant="contained" size="small" sx={{ flexShrink: 0 }}>
              Save
            </Button>
            <Button onClick={() => setRenaming(null)} color="inherit" size="small" sx={{ flexShrink: 0 }}>
              Cancel
            </Button>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
            <Typography variant="h6" noWrap sx={{ flex: 1, minWidth: 0, fontWeight: 700 }}>
              {clan.name}
            </Typography>
            <Typography variant="body2" color="primary.main" sx={{ flexShrink: 0, fontWeight: 600 }}>
              {rankLabel}
            </Typography>
          </Box>
        )}

        <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <CpAmount cp={clan.cp} />
          <Typography variant="caption" color="text.secondary">
            {clan.memberCount}/{clan.maxMembers} members
          </Typography>
        </Box>

        <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="body2" color="text.secondary">
            Invite code
          </Typography>
          <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, letterSpacing: 1 }}>{clan.inviteCode}</Typography>
          <Box sx={{ flex: 1 }} />
          <Button size="small" variant="outlined" color="inherit" onClick={() => void share()}>
            {copied ? 'Link copied' : 'Share invite'}
          </Button>
        </Box>

        {clan.isLeader && renaming === null && (
          <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
            <Button size="small" color="inherit" onClick={() => setRenaming(clan.name)}>
              Rename
            </Button>
            <Button size="small" color="inherit" onClick={() => void run(() => rotate({}), 'Could not change the code.')}>
              New code
            </Button>
          </Box>
        )}
      </GlassTile>

      <Typography variant="overline" color="text.secondary" component="h2" sx={{ display: 'block', mt: 2 }}>
        Members
      </Typography>
      <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
        {clan.members.map((m) => (
          <GlassTile key={m.userId} sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1 }}>
            {/* No profile link: clanmates aren't necessarily friends, and a
                stranger's workouts are private. */}
            <Avatar src={m.avatarUrl} name={m.displayName} size={32} />
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography noWrap sx={{ fontWeight: 500 }}>
                {m.displayName}
                {m.isMe && <Typography component="span" color="text.secondary"> (you)</Typography>}
              </Typography>
              {m.isLeader && (
                <Typography variant="caption" color="primary.main">
                  Leader
                </Typography>
              )}
            </Box>
            <Box sx={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 0.5, fontVariantNumeric: 'tabular-nums' }}>
              <SwoleCoin size={14} title="points" />
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {m.points}
              </Typography>
            </Box>
            {clan.isLeader && !m.isMe && (
              <Button
                size="small"
                color="inherit"
                sx={{ flexShrink: 0, minWidth: 0 }}
                onClick={() => void run(() => kick({ userId: m.userId }), 'Could not remove that member.')}
              >
                Kick
              </Button>
            )}
          </GlassTile>
        ))}
      </Box>

      {confirmLeave && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, textAlign: 'center' }}>
          Your points this month leave with you, and you can't join another clan until next month.
        </Typography>
      )}
      <Box sx={{ mt: 1, display: 'flex', justifyContent: 'center', gap: 1 }}>
        {confirmLeave ? (
          <>
            <Button size="small" color="error" variant="contained" onClick={() => void run(() => leave({}), 'Could not leave the clan.')}>
              Leave clan
            </Button>
            <Button size="small" color="inherit" onClick={() => setConfirmLeave(false)}>
              Stay
            </Button>
          </>
        ) : (
          <Button size="small" color="inherit" onClick={() => setConfirmLeave(true)}>
            Leave clan
          </Button>
        )}
      </Box>

      {error && (
        <Typography variant="body2" color="error" sx={{ mt: 1, textAlign: 'center' }}>
          {error}
        </Typography>
      )}
    </>
  )
}
