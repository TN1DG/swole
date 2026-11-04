import { Box, ButtonBase, Typography } from '@mui/material'

// A small curated set rather than a full emoji library: the phone keyboard
// already has all of them, so this is the ones a gym chat actually reaches for,
// and it adds nothing to the bundle.
const EMOJI_SECTIONS = [
  {
    label: 'Gym',
    emojis: ['💪', '🏋️', '🏋️‍♀️', '🔥', '🏆', '🥇', '⚔️', '🎯', '⏱️', '🦾', '🦵', '🥵', '🧘', '🏃', '🚴', '🤸'],
  },
  {
    label: 'Fuel',
    emojis: ['🥩', '🍗', '🥚', '🍚', '🥦', '🍌', '🥑', '🍕', '🍔', '🍟', '🥤', '☕', '💧', '🍫'],
  },
  {
    label: 'Reactions',
    emojis: ['😂', '🤣', '😅', '😎', '🤩', '🥳', '😤', '😭', '😴', '🤔', '🫡', '💀', '👀', '🙌', '👏', '👍', '👎', '🤝', '🙏', '❤️', '💯', '✅', '🎉', '🚀', '⚡', '👑', '🐐', '🤡'],
  },
] as const

export function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  return (
    <Box
      sx={{ maxHeight: 200, overflowY: 'auto', overscrollBehavior: 'contain', pt: 1 }}
      role="group"
      aria-label="Emoji"
    >
      {EMOJI_SECTIONS.map((section) => (
        <Box key={section.label} sx={{ mb: 1 }}>
          <Typography variant="overline" color="text.secondary" component="p">
            {section.label}
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(40px, 1fr))' }}>
            {section.emojis.map((emoji) => (
              <ButtonBase
                key={emoji}
                aria-label={emoji}
                // Keeps focus in the message box, so the keyboard stays up and
                // the emoji lands where the cursor is.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onPick(emoji)}
                sx={{ height: 40, fontSize: '1.375rem', borderRadius: '8px' }}
              >
                {emoji}
              </ButtonBase>
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  )
}
