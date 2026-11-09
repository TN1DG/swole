// "1½", "¾", "2" — how a number of servings reads in the UI.
export function formatServings(servings: number): string {
  const whole = Math.floor(servings)
  const frac = servings - whole
  const fracLabel =
    frac === 0.5 ? '½' : frac === 0.25 ? '¼' : frac === 0.75 ? '¾' : frac ? String(frac) : ''
  if (!whole) return fracLabel || '0'
  return `${whole}${fracLabel}`
}
