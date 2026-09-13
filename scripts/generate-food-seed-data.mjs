// Regenerates convex/foodSeedData.ts from my_data_sets/daily_food_nutrition_dataset.csv.
// Run with: node scripts/generate-food-seed-data.mjs
//
// The source CSV isn't quoted, so the ~6 food names that contain a literal
// comma (e.g. "Milk (2%, 1 cup)") split into one extra column. Since every
// row has the same trailing shape (category, then 5 numeric macro columns),
// any overflow columns belong to the name — rejoin them before reading the
// rest positionally. The dataset also repeats some items verbatim (651 rows,
// 593 unique names); this keeps the first occurrence of each and drops later
// repeats.
import { readFileSync, writeFileSync } from 'node:fs'

const SOURCE = 'my_data_sets/daily_food_nutrition_dataset.csv'
const OUTPUT = 'convex/foodSeedData.ts'

const raw = readFileSync(SOURCE, 'utf8')
const lines = raw.split(/\r?\n/).filter((l) => l.trim() !== '')
const header = lines[0].split(',')
const EXPECTED_COLS = header.length

function parseLine(line, lineNo) {
  const cols = line.split(',')
  if (cols.length === EXPECTED_COLS) return cols
  const extra = cols.length - EXPECTED_COLS
  if (extra <= 0) throw new Error(`line ${lineNo} has fewer columns than expected: ${line}`)
  const name = cols.slice(0, 1 + extra).join(',')
  return [name, ...cols.slice(1 + extra)]
}

const rows = lines.slice(1).map((line, i) => parseLine(line, i + 2))

const seen = new Set()
const foods = []
for (const [name, category, calories, proteinG, carbsG, fatG, fiberG] of rows) {
  const key = name.trim().toLowerCase()
  if (seen.has(key)) continue
  seen.add(key)
  foods.push({
    name: name.trim(),
    category: category.trim(),
    calories: Number(calories),
    proteinG: Number(proteinG),
    carbsG: Number(carbsG),
    fatG: Number(fatG),
    fiberG: Number(fiberG),
  })
}
foods.sort((a, b) => a.name.localeCompare(b.name))

const entries = foods
  .map(
    (f) =>
      `  { name: ${JSON.stringify(f.name)}, category: ${JSON.stringify(f.category)}, ` +
      `calories: ${f.calories}, proteinG: ${f.proteinG}, carbsG: ${f.carbsG}, ` +
      `fatG: ${f.fatG}, fiberG: ${f.fiberG} },`,
  )
  .join('\n')

const out = `// Auto-generated from ${SOURCE} by scripts/generate-food-seed-data.mjs.
// Deduped by name (${foods.length} unique of ${rows.length} rows; the rest were exact
// repeats). Regenerate rather than hand-edit.
export type SeedFood = {
  name: string
  category: string
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
  fiberG: number
}

export const SEED_FOODS: SeedFood[] = [
${entries}
]
`

writeFileSync(OUTPUT, out)
console.log(`Wrote ${foods.length} foods to ${OUTPUT}`)
