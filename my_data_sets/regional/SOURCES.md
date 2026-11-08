# Regional food data: sources and licences

These files feed `scripts/generate-regional-food-seed-data.mjs`, which writes
`convex/foodSeedRegional.ts` and `convex/foodSeedIndian.ts`. Regenerate rather
than hand-edit those.

| File | Source | Licence | Units |
|---|---|---|---|
| `sheffield_african_caribbean_foods.csv` | Apekey, T.A., Copeman, J., Kime, N.H. et al. (2019) "Nutrient composition of popularly consumed African and Caribbean foods in the UK", *Foods* 8(10), 500. https://doi.org/10.3390/foods8100500 | CC BY 4.0 | per 100 g edible portion |
| `egyptian_middle_eastern_food_nutrition.csv` | Kaggle, mohamedmagdyhekal/egyptian-and-middle-eastern-food-nutrition-dataset | CC0 1.0 | per serving |
| `indonesian_food_nutrition.csv` | Kaggle, anasfikrihanif/indonesian-food-and-drink-nutrition-dataset | CC0 1.0 | per 100 g |
| `indian_food_nutrition_calories.csv` | Kaggle, shadab80k/indian-food-nutrition-and-calories-dataset | **CC BY-SA 4.0** | per 100 g |

## Notes

- **Sheffield**: transcribed from Tables 3–8 of the paper (protein, available
  carbohydrate, fat, AOAC fibre, kcal). The PDF's table layout misaligns the
  energy column, so each row was matched by checking that its kcal agrees with
  4/4/9 from its own macros (all 33 within ~5%). Jollof rice uses the printed
  protein (1.6 g), which is what its energy agrees with, not 6.25 × the printed
  nitrogen. "__" (not analysed) and "<0.1" are recorded as 0.
- **Indian (CC BY-SA 4.0)**: kept in its own generated file,
  `convex/foodSeedIndian.ts`, which carries the attribution and stays under
  CC BY-SA 4.0 as the licence requires.
- **Rejected**: Kaggle "10k South Asian Recipes" (synthetic: most rows' calories
  disagree with their macros by >25%), "Global Cuisine Meals with Diet Labels"
  (same problem), a Thai dataset (licence unknown), the two "Nigerian Foods"
  datasets (no nutrient values), and the FAO/INFOODS West African Food
  Composition Table 2019 (CC BY-NC-SA 3.0 IGO, non-commercial only).
