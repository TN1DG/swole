import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { tokens } from '../theme/tokens'

// A short burst of expanding rings, meant to sit absolutely-positioned over
// the button that triggered it (the button needs position: relative). Pass
// an incrementing `triggerKey` each time the action succeeds — AnimatePresence
// keys off it, so repeated sends replay the effect instead of no-op'ing on an
// unchanged prop. Renders nothing until the first successful trigger, and
// nothing at all under prefers-reduced-motion.
export function PingSendFlare({ triggerKey }: { triggerKey: number }) {
  const prefersReducedMotion = useReducedMotion()
  if (prefersReducedMotion || triggerKey === 0) return null

  return (
    <span style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} aria-hidden>
      <AnimatePresence>
        {[0, 1, 2].map((i) => (
          <motion.span
            key={`${triggerKey}-${i}`}
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 'inherit',
              border: `2px solid ${tokens.accent}`,
            }}
            initial={{ opacity: 0.5, scale: 1 }}
            animate={{ opacity: 0, scale: 1.6 + i * 0.25 }}
            transition={{ duration: 0.6, delay: i * 0.1, ease: 'easeOut' }}
          />
        ))}
      </AnimatePresence>
    </span>
  )
}
