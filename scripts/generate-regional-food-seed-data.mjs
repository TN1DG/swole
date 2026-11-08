// Regenerates convex/foodSeedRegional.ts and convex/foodSeedIndian.ts from
// my_data_sets/regional/ (see SOURCES.md there for where each file came from
// and under what licence). Run with: node scripts/generate-regional-food-seed-data.mjs
//
// Every row is sanity-checked before it's kept: its calories must agree with
// 4/4/9 from its own protein/carbs/fat to within 25%. That is the same check
// that rejected two synthetic Kaggle datasets outright; here it drops the
// handful of rows in otherwise-good datasets whose numbers can't all be right.
//
// Rows whose base name (the part before any "(…)" portion) already exists in
// convex/foodSeedData.ts are skipped, so search doesn't show two "Hummus"es
// with different portions from different sources.
import { readFileSync, writeFileSync } from 'node:fs'

const DIR = 'my_data_sets/regional'
const MAX_MACRO_ERROR = 0.25

// RFC 4180-ish: quoted fields, doubled quotes, newlines inside quotes.
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  text = text.replace(/^﻿/, '')
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.some((f) => f.trim() !== '')) rows.push(row)
      row = []
    } else field += ch
  }
  row.push(field)
  if (row.some((f) => f.trim() !== '')) rows.push(row)
  const [header, ...body] = rows
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])))
}

const read = (file) => parseCsv(readFileSync(`${DIR}/${file}`, 'utf8'))
const num = (s) => {
  const n = Number(String(s).replace(/[<>]/g, ''))
  return Number.isFinite(n) ? n : 0
}
const round1 = (n) => Math.round(n * 10) / 10
const baseName = (name) => name.replace(/\s*\(.*\)\s*$/, '').trim().toLowerCase()

function food(name, category, calories, proteinG, carbsG, fatG, fiberG) {
  return {
    name,
    category,
    calories: Math.round(calories),
    proteinG: round1(proteinG),
    carbsG: round1(carbsG),
    fatG: round1(fatG),
    fiberG: round1(fiberG),
  }
}

function plausible(f) {
  if (f.calories <= 0) return false
  const fromMacros = 4 * f.proteinG + 4 * f.carbsG + 9 * f.fatG
  return Math.abs(fromMacros - f.calories) / f.calories <= MAX_MACRO_ERROR
}

// Names already in the main database (convex/foodSeedData.ts), by base name.
const existing = new Set(
  [...readFileSync('convex/foodSeedData.ts', 'utf8').matchAll(/\{ name: ("(?:[^"\\]|\\.)*")/g)].map((m) =>
    baseName(JSON.parse(m[1])),
  ),
)

const stats = []
function collect(label, candidates, taken) {
  const kept = []
  let implausible = 0
  let duplicate = 0
  for (const f of candidates) {
    if (!plausible(f)) {
      implausible++
      continue
    }
    const key = baseName(f.name)
    if (taken.has(key)) {
      duplicate++
      continue
    }
    taken.add(key)
    kept.push(f)
  }
  stats.push(`${label}: ${kept.length} kept of ${candidates.length} (${implausible} implausible, ${duplicate} duplicate)`)
  return kept
}

const taken = new Set(existing)

const sheffield = collect(
  'Sheffield (CC BY 4.0)',
  read('sheffield_african_caribbean_foods.csv').map((r) =>
    food(`${r.name} (100g)`, r.cuisine, num(r.calories), num(r.proteinG), num(r.carbsG), num(r.fatG), num(r.fiberG)),
  ),
  taken,
)

const egyptian = collect(
  'Egyptian & Middle Eastern (CC0)',
  read('egyptian_middle_eastern_food_nutrition.csv').map((r) =>
    food(
      `${r.food_name} (1 serving)`,
      'Egyptian/Middle Eastern',
      num(r.calories_kcal),
      num(r.protein_g),
      num(r.carbs_g),
      num(r.fat_g),
      num(r.fiber_g),
    ),
  ),
  taken,
)

// The dataset has no fibre column, so fibre is recorded as 0.
const indonesian = collect(
  'Indonesian (CC0)',
  read('indonesian_food_nutrition.csv').map((r) => {
    const name = r.name.charAt(0).toUpperCase() + r.name.slice(1)
    return food(`${name} (100g)`, 'Indonesian', num(r.calories), num(r.proteins), num(r.carbohydrate), num(r.fat), 0)
  }),
  taken,
)

const indian = collect(
  'Indian (CC BY-SA 4.0)',
  read('indian_food_nutrition_calories.csv').map((r) =>
    food(
      `${r.Food_Item} (100g)`,
      'Indian',
      num(r.Calories_per_100g),
      num(r.Protein_g),
      num(r.Carbs_g),
      num(r.Fat_g),
      num(r.Fiber_g),
    ),
  ),
  taken,
)

const byName = (a, b) => a.name.localeCompare(b.name)
const entries = (foods) =>
  [...foods]
    .sort(byName)
    .map(
      (f) =>
        `  { name: ${JSON.stringify(f.name)}, category: ${JSON.stringify(f.category)}, ` +
        `calories: ${f.calories}, proteinG: ${f.proteinG}, carbsG: ${f.carbsG}, ` +
        `fatG: ${f.fatG}, fiberG: ${f.fiberG} },`,
    )
    .join('\n')

const regional = [...sheffield, ...egyptian, ...indonesian]
writeFileSync(
  'convex/foodSeedRegional.ts',
  `// Auto-generated from my_data_sets/regional/ by scripts/generate-regional-food-seed-data.mjs.
// Regenerate rather than hand-edit. Sources and licences: my_data_sets/regional/SOURCES.md.
//
// - Caribbean, West African and North African dishes (per 100 g): Apekey, T.A.,
//   Copeman, J., Kime, N.H. et al. (2019) "Nutrient composition of popularly
//   consumed African and Caribbean foods in the UK", Foods 8(10), 500,
//   https://doi.org/10.3390/foods8100500 (CC BY 4.0).
// - Egyptian/Middle Eastern dishes (per serving) and Indonesian foods (per 100 g):
//   Kaggle datasets released under CC0 1.0.
import type { SeedFood } from './foodSeedData'

export const REGIONAL_SEED_FOODS: SeedFood[] = [
${entries(regional)}
]
`,
)

writeFileSync(
  'convex/foodSeedIndian.ts',
  `// Auto-generated from my_data_sets/regional/indian_food_nutrition_calories.csv
// by scripts/generate-regional-food-seed-data.mjs. Regenerate rather than hand-edit.
//
// Adapted from "Indian Food Nutrition & Calories Dataset" by shadab80k on Kaggle
// (https://www.kaggle.com/datasets/shadab80k/indian-food-nutrition-and-calories-dataset),
// licensed CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/).
// Changes: kept name, calories and macros per 100 g; dropped rows whose calories
// disagree with their macros. THIS FILE is likewise licensed CC BY-SA 4.0,
// which is why it is kept separate from the rest of the food database.
import type { SeedFood } from './foodSeedData'

export const INDIAN_SEED_FOODS: SeedFood[] = [
${entries(indian)}
]
`,
)

console.log(stats.join('\n'))
console.log(`Wrote ${regional.length} foods to convex/foodSeedRegional.ts, ${indian.length} to convex/foodSeedIndian.ts`)
