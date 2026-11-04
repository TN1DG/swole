import { Box, ButtonBase, Typography } from '@mui/material'
import { REACTION_EMOJIS } from '../../../convex/constants'
import { StoredImage } from '../../components/StoredImage'
import { tokens } from '../../theme/tokens'
import { isBigEmoji } from './threadLayout'

export type BubbleMessage = {
  text: string
  imageUrl: string | null
  imageWidth: number | null
  imageHeight: number | null
  reactions: { emoji: string; isMine: boolean }[]
}

const BUBBLE_RADIUS = '18px'
const JOINED_RADIUS = '5px'

// A burst reads as one block: the corners facing a neighbour tighten, on the
// sender's side only, the way every texting app draws it.
function cornerRadii(isMine: boolean, joinedAbove: boolean, joinedBelow: boolean) {
  const top = joinedAbove ? JOINED_RADIUS : BUBBLE_RADIUS
  const bottom = joinedBelow ? JOINED_RADIUS : BUBBLE_RADIUS
  return isMine
    ? `${BUBBLE_RADIUS} ${top} ${bottom} ${BUBBLE_RADIUS}`
    : `${top} ${BUBBLE_RADIUS} ${BUBBLE_RADIUS} ${bottom}`
}

export function MessageBubble({
  message,
  isMine,
  joinedAbove,
  joinedBelow,
  selected,
  faded = false,
  footer,
  onSelect,
  onReact,
  onOpenImage,
}: {
  message: BubbleMessage
  isMine: boolean
  joinedAbove: boolean
  joinedBelow: boolean
  selected: boolean
  faded?: boolean
  footer?: React.ReactNode
  onSelect?: () => void
  onReact?: (emoji: string) => void
  onOpenImage?: (url: string) => void
}) {
  const bigEmoji = !message.imageUrl && isBigEmoji(message.text)
  const hasBubble = !bigEmoji

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        maxWidth: '80%',
        alignSelf: isMine ? 'flex-end' : 'flex-start',
        alignItems: isMine ? 'flex-end' : 'flex-start',
        opacity: faded ? 0.65 : 1,
        transition: 'opacity 0.15s ease',
      }}
    >
      {selected && onReact && (
        <Box
          role="group"
          aria-label="React to this message"
          sx={{
            mb: 0.5,
            display: 'flex',
            gap: 0.25,
            p: 0.25,
            borderRadius: '999px',
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          {REACTION_EMOJIS.map((emoji) => {
            const mine = message.reactions.some((r) => r.isMine && r.emoji === emoji)
            return (
              <ButtonBase
                key={emoji}
                aria-label={`React with ${emoji}`}
                aria-pressed={mine}
                onClick={() => onReact(emoji)}
                sx={{
                  width: 36,
                  height: 36,
                  fontSize: '1.25rem',
                  borderRadius: '50%',
                  ...(mine && { bgcolor: 'surface2.main' }),
                }}
              >
                {emoji}
              </ButtonBase>
            )
          })}
        </Box>
      )}

      <Box
        role={onSelect ? 'button' : undefined}
        tabIndex={onSelect ? 0 : undefined}
        aria-label={onSelect ? 'Message options' : undefined}
        onClick={onSelect}
        onKeyDown={
          onSelect
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect()
                }
              }
            : undefined
        }
        sx={{
          minWidth: 0,
          maxWidth: '100%',
          overflow: 'hidden',
          cursor: onSelect ? 'pointer' : undefined,
          ...(hasBubble && {
            borderRadius: cornerRadii(isMine, joinedAbove, joinedBelow),
            ...(isMine
              ? { bgcolor: 'primary.main', color: 'primary.contrastText' }
              : {
                  bgcolor: tokens.surface2,
                  border: '1px solid rgb(var(--color-border-rgb) / 0.3)',
                }),
          }),
        }}
      >
        {message.imageUrl && (
          <StoredImage
            src={message.imageUrl}
            width={message.imageWidth}
            height={message.imageHeight}
            radius="0"
            alt="Photo"
            // A very tall photo shouldn't take over the whole conversation.
            sx={{ width: 260, maxWidth: '100%', maxHeight: 360 }}
            onClick={
              onOpenImage
                ? () => {
                    onOpenImage(message.imageUrl!)
                  }
                : undefined
            }
          />
        )}
        {message.text && (
          <Typography
            variant="body2"
            sx={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              ...(bigEmoji
                ? { fontSize: '2.5rem', lineHeight: 1.2 }
                : { px: 1.5, py: 0.875, fontSize: '0.9375rem' }),
            }}
          >
            {message.text}
          </Typography>
        )}
      </Box>

      {message.reactions.length > 0 && (
        <Box sx={{ mt: -0.5, mx: 1, display: 'flex', gap: 0.25, zIndex: 1 }}>
          {message.reactions.map((reaction) => (
            <ButtonBase
              key={`${reaction.emoji}-${reaction.isMine}`}
              aria-label={reaction.isMine ? `Remove your ${reaction.emoji}` : `Reaction ${reaction.emoji}`}
              disabled={!reaction.isMine || !onReact}
              onClick={() => onReact?.(reaction.emoji)}
              sx={{
                px: 0.625,
                height: 22,
                fontSize: '0.8125rem',
                borderRadius: '999px',
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: reaction.isMine ? 'primary.main' : 'divider',
              }}
            >
              {reaction.emoji}
            </ButtonBase>
          ))}
        </Box>
      )}

      {footer}
    </Box>
  )
}
