// A labeled number tile with an optional leading icon — used for the small
// stat grids on the post-workout summary and the profile page.
export function StatTile({
  label,
  value,
  icon,
  centered = false,
}: {
  label: string
  value: string
  icon?: React.ReactNode
  centered?: boolean
}) {
  return (
    <div className={`rounded-xl bg-surface-2 p-3 ${centered ? 'text-center' : ''}`}>
      <p
        className={`flex items-center gap-1 text-xs text-muted uppercase ${
          centered ? 'justify-center' : ''
        }`}
      >
        {icon}
        {label}
      </p>
      <p className="mt-1 text-lg font-bold">{value}</p>
    </div>
  )
}
