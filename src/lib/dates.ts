// "Today, 18:30" / "Yesterday, 07:12" / "Sat 4 Jul" / "Sat 4 Jul 2025"
export function formatWorkoutDate(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const startOfDay = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000)

  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (diffDays === 0) return `Today, ${time}`
  if (diffDays === 1) return `Yesterday, ${time}`

  return d.toLocaleDateString([], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  })
}

// Short form for chart labels / PR rows: "4 Jul" or "4 Jul 24".
export function formatShortDate(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  return d.toLocaleDateString([], {
    day: 'numeric',
    month: 'short',
    ...(d.getFullYear() !== now.getFullYear() ? { year: '2-digit' } : {}),
  })
}
