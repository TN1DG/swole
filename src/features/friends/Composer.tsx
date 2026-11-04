import { useRef, useState } from 'react'
import { Box, IconButton, InputBase, Menu, MenuItem, Typography } from '@mui/material'
import { PingSendFlare } from '../../components/PingSendFlare'
import { errorMessage } from '../../lib/errors'
import { optimizeImage, type OptimizedImage } from '../../lib/optimizeImage'
import { LIMITS } from '../../../convex/validation'
import { EmojiPicker } from './EmojiPicker'

export type Attachment = OptimizedImage & { url: string }

// On a phone Return adds a line and the send button sends, as in every texting
// app, because there's no comfortable way to reach Shift. With a real keyboard,
// Enter sends and Shift+Enter adds a line.
function enterSends(): boolean {
  return !window.matchMedia('(pointer: coarse)').matches
}

export function Composer({
  disabled,
  canPing,
  canChallenge,
  pingFlareKey,
  onSend,
  onPing,
  onChallenge,
  onTypingChange,
}: {
  disabled: boolean
  canPing: boolean
  canChallenge: boolean
  pingFlareKey: number
  onSend: (text: string, attachment: Attachment | null) => void
  onPing: () => void
  onChallenge: () => void
  onTypingChange: (typing: boolean) => void
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const typing = useRef(false)

  const [draft, setDraft] = useState('')
  const [attachment, setAttachment] = useState<Attachment | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)

  const canSend = !disabled && !preparing && (draft.trim() !== '' || attachment !== null)

  function stopTyping() {
    if (idleTimer.current) clearTimeout(idleTimer.current)
    if (typing.current) {
      typing.current = false
      onTypingChange(false)
    }
  }

  // Reports only the start and stop of typing, never each keystroke, so a person
  // typing costs a couple of writes rather than one per letter.
  function noteTyping(value: string) {
    if (!value.trim()) {
      stopTyping()
      return
    }
    if (!typing.current) {
      typing.current = true
      onTypingChange(true)
    }
    if (idleTimer.current) clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(stopTyping, 3000)
  }

  function send() {
    if (!canSend) return
    onSend(draft.trim(), attachment)
    setDraft('')
    setAttachment(null)
    setError(null)
    stopTyping()
    inputRef.current?.focus()
  }

  function insertEmoji(emoji: string) {
    const input = inputRef.current
    const start = input?.selectionStart ?? draft.length
    const end = input?.selectionEnd ?? draft.length
    const next = draft.slice(0, start) + emoji + draft.slice(end)
    setDraft(next)
    noteTyping(next)
    requestAnimationFrame(() => {
      input?.setSelectionRange(start + emoji.length, start + emoji.length)
    })
  }

  async function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    setError(null)
    setPreparing(true)
    try {
      const optimized = await optimizeImage(file, 'chat')
      if (attachment) URL.revokeObjectURL(attachment.url)
      setAttachment({ ...optimized, url: URL.createObjectURL(optimized.blob) })
    } catch (err) {
      setError(errorMessage(err, 'Could not read that photo.'))
    } finally {
      setPreparing(false)
    }
  }

  function removeAttachment() {
    if (attachment) URL.revokeObjectURL(attachment.url)
    setAttachment(null)
  }

  return (
    <Box
      sx={{
        flexShrink: 0,
        borderTop: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        pl: 'var(--app-gutter-left)',
        pr: 'var(--app-gutter-right)',
        pt: 1,
        pb: 'max(0.5rem, env(safe-area-inset-bottom))',
      }}
    >
      {error && (
        <Typography variant="body2" color="error" sx={{ mb: 1 }}>
          {error}
        </Typography>
      )}

      {(attachment || preparing) && (
        <Box sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          {attachment ? (
            <>
              <Box
                component="img"
                src={attachment.url}
                alt="Photo to send"
                sx={{ width: 64, height: 64, objectFit: 'cover', borderRadius: '8px', display: 'block' }}
              />
              <IconButton size="small" aria-label="Remove photo" onClick={removeAttachment}>
                ✕
              </IconButton>
            </>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Preparing photo…
            </Typography>
          )}
        </Box>
      )}

      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.5 }}>
        <Box sx={{ position: 'relative', flexShrink: 0, borderRadius: '50%' }}>
          <IconButton
            aria-label="More actions"
            disabled={disabled}
            sx={{ color: 'text.secondary', fontSize: '1.5rem', width: 40, height: 40 }}
            onClick={(e) => setMenuAnchor(e.currentTarget)}
          >
            +
          </IconButton>
          <PingSendFlare triggerKey={pingFlareKey} />
        </Box>
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            alignItems: 'flex-end',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: '20px',
            bgcolor: 'surface2.main',
            pl: 1.75,
          }}
        >
          <InputBase
            inputRef={inputRef}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              noteTyping(e.target.value)
            }}
            onKeyDown={(e) => {
              // isComposing: Enter is confirming an IME word, not sending.
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && enterSends()) {
                e.preventDefault()
                send()
              }
            }}
            placeholder="Message…"
            multiline
            maxRows={5}
            fullWidth
            disabled={disabled}
            sx={{ py: 0.75 }}
            slotProps={{
              input: {
                maxLength: LIMITS.messageMaxLength,
                'aria-label': 'Message',
                enterKeyHint: enterSends() ? 'send' : 'enter',
              },
            }}
          />
          <IconButton
            aria-label={emojiOpen ? 'Hide emoji' : 'Show emoji'}
            aria-expanded={emojiOpen}
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setEmojiOpen((open) => !open)}
            sx={{ flexShrink: 0, width: 38, height: 38, fontSize: '1.125rem' }}
          >
            🙂
          </IconButton>
        </Box>
        <IconButton
          aria-label="Send message"
          disabled={!canSend}
          // Keeps focus in the box, so the keyboard doesn't drop between messages.
          onMouseDown={(e) => e.preventDefault()}
          onClick={send}
          sx={{
            flexShrink: 0,
            width: 40,
            height: 40,
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            '&:hover': { bgcolor: 'primary.dark' },
            '&.Mui-disabled': { bgcolor: 'surface2.main', color: 'text.disabled' },
          }}
        >
          ➤
        </IconButton>
      </Box>

      {emojiOpen && <EmojiPicker onPick={insertEmoji} />}

      <Box
        component="input"
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => void pickPhoto(e)}
        sx={{ display: 'none' }}
      />

      <Menu anchorEl={menuAnchor} open={menuAnchor !== null} onClose={() => setMenuAnchor(null)}>
        <MenuItem
          onClick={() => {
            setMenuAnchor(null)
            fileRef.current?.click()
          }}
        >
          📷 Photo
        </MenuItem>
        <MenuItem
          disabled={!canPing}
          onClick={() => {
            setMenuAnchor(null)
            onPing()
          }}
        >
          🏋️ Gym ping
        </MenuItem>
        <MenuItem
          disabled={!canChallenge}
          onClick={() => {
            setMenuAnchor(null)
            onChallenge()
          }}
        >
          ⚔️ Challenge
        </MenuItem>
      </Menu>
    </Box>
  )
}
