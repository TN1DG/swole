# MUI Migration Progress

Full migration of Swole's UI from Tailwind CSS v4 (hand-built dark design system) to MUI (Material UI), keeping the existing gunmetal/rust visual identity via a custom theme. Plan lives in the Claude Code plan file for this task; this doc tracks what's actually been done, wave by wave, so a new session can pick up without re-deriving state.

**How to use this file**: read it first thing when resuming this task. Each wave section below gets updated (status, files touched, decisions/deviations, verification results) as work completes.

---

## Wave 1 — Foundation

**Status: done**

Installed `@mui/material` (v9.2.0), `@emotion/react`, `@emotion/styled` — no peer-dep issues with React 19.2.

Built:
- `src/theme/tokens.ts` — literal color values, single source of truth (also feeds the CSS-variable bridge below).
- `src/theme/index.ts` — `createTheme`, `palette.mode: 'dark'`, custom `surface2`/`pr` palette keys (module augmentation), `overline` typography variant matching the old `label-micro` utility, `MuiButton.styleOverrides.containedPrimary` replicating the old `btn-glow` rust glow automatically on every primary button, `MuiPaper` flattened (no elevation overlay — GlassCard/GlassTile own their own backgrounds), `MuiCssBaseline` override preserving the `font-size: 16px` iOS-zoom-prevention rule.
- `src/theme/globalStyles.ts` — `GlobalStyles` object: re-publishes the palette as plain `:root` CSS custom properties (`--color-accent` etc.) for consumers that can't read the MUI theme via context — `ProgressChart.tsx`, `ProgressRing.tsx`, `CalendarView.tsx` (hand-rolled SVG), and eventually the `modern-screenshot` export pipeline (Wave 8). Also carries the `body::before`/`::after` decorative glow+noise pseudo-elements and `html/body/#root { min-height: 100svh }` forward from the old `index.css`.
- `src/components/GlassCard.tsx`, `GlassTile.tsx` — Paper-based, replace the `glass-card`/`glass-tile` Tailwind utilities exactly (same blur/border/shadow values).
- `src/components/ConfirmDialog.tsx` — MUI `Dialog` wrapper, ready to replace `window.confirm()` call sites (not yet wired up anywhere — that happens in Wave 3/5 where those call sites live).
- `src/components/BottomSheet.tsx` — MUI `Drawer anchor="bottom"` wrapper matching the old hand-rolled sheet look (rounded top corners, safe-area bottom padding, capped at the app's max width). Not yet wired up (Wave 3/4).
- `src/components/InlineNotice.tsx` — shared dismissible-banner shell (built on `GlassCard`), meant to replace the identical markup duplicated between `PingAckBanner`/`FirstVisitTip`. Not yet wired up — those two components still use their original Tailwind markup and work fine as-is since Tailwind isn't removed yet.
- `src/components/SegmentedControl.tsx` — `ToggleButtonGroup`-based, replaces the segmented-tab pattern and the twice-duplicated male/female toggle. Not yet wired up.

Wired `ThemeProvider` + `CssBaseline` + `GlobalStyles` into `src/main.tsx`.

Migrated `src/components/AppLayout.tsx` (the app shell every route renders inside) fully to MUI: header → styled `Box component="header"` with sticky positioning and safe-area padding preserved exactly; bottom tab bar → styled `Box component="nav"`, fixed positioning, safe-area padding preserved; `NavLink` active-state coloring driven by `useTheme()` rather than Tailwind classes. Consolidated the duplicate `PeopleIcon` (AppLayout had its own copy identical to `src/components/icons.tsx`'s) down to the one shared version.

Trimmed `src/index.css` — removed the base rules now owned by `GlobalStyles`/`CssBaseline` (html/body/#root sizing, body background/font/antialiasing, the glow/noise pseudo-elements, the iOS zoom-prevention rule). What's left is only the still-load-bearing Tailwind pieces: `@import 'tailwindcss'`, the `@theme` token block, and the five `@utility` classes — all still needed by every page that hasn't been migrated yet. This shrinks further wave by wave and gets deleted entirely in Wave 9.

**Deviations from the plan**: 
- `AppBar`/`BottomNavigation`/`BottomNavigationAction` (mentioned as the likely approach in the plan) turned out not to fit well — `BottomNavigationAction` wants a single controlled `value`, which fights `NavLink`'s own active-state mechanism from `react-router-dom`. Used plain `Box`/`NavLink` with `useTheme()`-driven inline styles instead — same visual result, simpler integration with routing.
- **MUI v9 API gotcha**: the installed version (`@mui/material` v9.2.0) dropped the old combined `styleOverrides` classKeys like `containedPrimary` (used in MUI v5/v6) in favor of composable slots (`contained` + `colorPrimary` separately) — there's no single key to target "contained + primary" together anymore. `npx tsc --noEmit` did NOT catch this (only `tsc -b`, the project-reference build `npm run build` actually uses, caught it) — worth remembering `tsc --noEmit` alone isn't fully trustworthy as a pre-build check on this repo's tsconfig setup; always confirm with a real `npm run build` too. Fixed by overriding `root` with an `ownerState`-checking function instead (`src/theme/index.ts`).

**Verification**: `npx tsc --noEmit` clean, `npm run build` clean (after the fix above), `npm test` — 157/157 backend tests still passing (unaffected, as expected). Manual browser pass: header, bottom nav (including active-tab coloring across a route change), background glow texture, and page content all render pixel-identical to pre-migration.

**Bundle size**: gzipped JS went from ~130KB (pre-MUI) to ~162KB after just the foundation + AppLayout — the ~32KB jump is the MUI+Emotion runtime baseline landing all at once. Expect this number to grow further as more pages migrate and pull in more MUI components (Dialog, Drawer, ToggleButtonGroup, etc. aren't in the bundle yet since nothing uses them). This was the exact tradeoff flagged before starting the migration — noting the actual number here rather than just the prediction.

**Follow-up — resolved**: ran `npm audit fix` (non-breaking) — fixed the critical `@auth/core` vulnerability plus `fast-uri`, `postcss`, and one of two `brace-expansion` copies. Confirmed `npm run build`/`npm test` still clean afterward. Two remain, both requiring a breaking downgrade via `--force`; discussed with the user and both were deliberately left as-is:
- `react-router` (CSRF bypass) — only exploitable in RSC mode, which this client-only SPA doesn't use. Downgrading `react-router-dom` risked destabilizing routing mid-migration for a CVE that doesn't apply here.
- `brace-expansion` (DoS/OOM) — remaining copy is a build-time-only dependency of `vite-plugin-pwa`'s service-worker generation (`workbox-build`), never shipped to the browser. Not worth downgrading PWA tooling for a build-time-only risk.

---

## Wave 2 — Simple pages

**Status: done**

Migrated `ProfilePage.tsx`, `StatsPage.tsx` (+ `CalorieBreakdown.tsx`, shared with the not-yet-migrated onboarding reward screen — fine, same reasoning as `StatTile`), `SignInPage.tsx`. Also migrated `StatTile.tsx` early since `ProfilePage` depends on it (also used by the not-yet-migrated `WorkoutsPage` post-workout summary — safe, MUI components render fine inside a still-Tailwind parent).

**Notable decisions**:
- `ProfilePage`'s account-deletion flow changed from an inline two-step panel swap to a real `ConfirmDialog` (per the plan's intent for `window.confirm()` replacement — this wasn't a `window.confirm()` call site, but the same "no more DIY confirm patterns" principle applied cleanly here too, and it's a genuine UX upgrade).
- `StatsPage`'s male/female toggle now uses the shared `SegmentedControl` (dedupes what was hand-duplicated between this page and `WelcomeCarousel` — the second half of that dedupe happens when Wave 7 migrates `WelcomeCarousel`).
- `StatsPage`'s activity-level `<select>` became a real MUI `Select`/`MenuItem` (not just a styled native select) — used a plain `Select` with `aria-label` rather than `FormControl`+`InputLabel`, since the page already has its own `Typography` caption above each field (matching the existing form layout) and a floating MUI label would have duplicated that.
- `SignInPage.tsx` migrated but **not visually verified live** — doing so requires signing out of the only session available in this browser tab, and there's no way to sign back in without the account's real password. Build is clean and it only reuses primitives (`TextField`, `Button`, `Typography`) already visually confirmed correct elsewhere this wave, but this one page is unverified in the browser — worth a manual look next time you're signed out anyway, or ask to have it force-verified via sign-out if that's acceptable.

**More MUI v9 gotchas hit this wave** (same root cause as Wave 1's `containedPrimary` issue — this version trimmed the old "system shorthand" props):
- `fontWeight` is **not** a direct `Typography` prop in this version when no `variant` narrows the overload correctly — always set it via `sx={{ fontWeight: ... }}` instead. Hit repeatedly across `ProfilePage`/`StatTile`.
- `Stack`'s `justifyContent`/`alignItems` are also not direct props — same fix, move into `sx`.
- MUI `Paper`'s (and anything built on it, like `GlassCard`/`GlassTile`) `component={SomeRouterLink}` polymorphism doesn't type-check when the target component has its own required extra props (e.g. `react-router-dom`'s `Link` needs `to`) — TS can't merge them through the generic `component` prop in this setup. Fix: wrap the router `Link` around the MUI component instead of using `component={Link}` — i.e. `<Link to="..."><GlassTile>...</GlassTile></Link>`, not `<GlassTile component={Link} to="...">`.
- **Reminder**: `npx tsc --noEmit` continues to not reliably catch these — every fix this wave was only surfaced by running the real `npm run build`. Keep using that as the actual gate, not the standalone tsc check.

**Verification**: `npm run build` clean (after the fixes above), `npm test` 157/157, manual browser pass on `/profile` and `/stats` (including opening the `ConfirmDialog`, the `Select` dropdown, and the `SegmentedControl`) — all pixel-close to the pre-migration versions and fully interactive.

## Wave 3 — Core workout logging

**Status: done**

Migrated `ExercisePicker.tsx`, `ActiveWorkout.tsx`, `WorkoutsPage.tsx` — the densest screen in the app (live elapsed timer, per-exercise reorder, blur-commit weight/reps inputs, warmup/done toggle buttons, and 4 separate confirm-before-destructive-action flows).

**Notable decisions**:
- `ExercisePicker` now uses `BottomSheet` (`Drawer anchor="bottom"`) instead of the hand-rolled `fixed inset-0 z-50` overlay — first real use of that Wave-1 component. It's rendered with `open` hard-coded `true` (the parent still mounts/unmounts it conditionally, same contract as before) — this means it slides up on open but disappears instantly on close instead of sliding down, since unmounting doesn't let Drawer's own exit transition play. Documented as a known, minor animation gap; fixable later by threading a real controlled `open` prop from callers if it's ever worth the churn.
- `ActiveWorkout`'s three `window.confirm()` calls (discard-empty, finish-with-pending-sets, discard-workout) collapsed into one `pendingConfirm` state variable driving a single `ConfirmDialog`, rather than three separate dialogs — simpler than it sounds since only one can ever be relevant at a time. `ExerciseCard`'s remove-exercise confirm got its own separate, self-contained `ConfirmDialog` + boolean state (didn't fold it into the parent's state since it's a genuinely separate, per-card concern).
- The set-number "tap to toggle warmup" button and the done-toggle "✓" button both use `ButtonBase` rather than `Button`/`IconButton` — both need exact custom sizing/coloring inside a tight 5-column grid cell that `Button`'s built-in padding/sizing would fight. `ButtonBase` gives real MUI interaction states (ripple, focus, a11y) without an opinionated visual footprint.
- The blur-commit pattern for weight/reps `TextField`s (local state while typing, committed to the server only `onBlur`) is preserved exactly — swapping the underlying element from `<input>` to MUI `TextField` doesn't change this pattern's logic at all, only how the native `<input>` is reached (`slotProps.htmlInput` for `inputMode`/`onFocus`-select-all/`textAlign` — MUI wraps the real input, so anything that needs the literal DOM node's attributes goes through `slotProps.htmlInput`, not the top-level `TextField` props).

**More per-component MUI quirks worth remembering**:
- `Button`'s `component={Link} to="..."` (react-router) type-checks fine — unlike `Paper`-based components (`GlassCard`/`GlassTile`), `Button`'s types are set up to merge in the target component's extra required props correctly. So: wrap-with-`Link` for `Paper`-based components, `component={Link}` directly is fine for `Button`.

**Verification**: `npm run build` clean, `npm test` 157/157. Full live click-through: started a workout, opened the exercise picker bottom sheet, searched and added "Bench Press," logged a set (100kg × 5, watched the header's live volume/set-count update), toggled it done (success-green), opened the discard confirm dialog and cancelled it, then hit Finish and confirmed the post-workout summary card renders correctly with real `StatTile`s. Every interaction worked exactly as before the migration.

## Wave 4 — History, favorites, exercise library

**Status: done**

Migrated `HistoryPage.tsx` + `CalendarView.tsx`, `WorkoutDetailPage.tsx`, `FavoritesPage.tsx`, `ExercisesPage.tsx` + `ExerciseDetail.tsx` + `ExerciseForm.tsx` + `ProgressChart.tsx`.

**Notable decisions**:
- `ExerciseDetail.tsx` and `ExerciseForm.tsx` both now use `BottomSheet` (same "open hard-coded true, parent still mounts/unmounts" pattern as `ExercisePicker` from Wave 3 — same minor lost-closing-animation tradeoff, already documented there).
- `WorkoutDetailPage.tsx`'s per-set table now uses real MUI `Table`/`TableHead`/`TableBody`/`TableRow`/`TableCell` instead of a hand-rolled `<table>` — first real table in the migration.
- `WorkoutDetailPage.tsx`'s `window.confirm()` for deleting a workout became a `ConfirmDialog`, consistent with Wave 3.
- `ExercisesPage.tsx`'s muscle-group filter row now uses MUI `Chip` (`clickable`, `color="primary"` when active, `surface2.main` background when not) instead of hand-rolled pill buttons.
- **`ProgressChart.tsx` fully dropped its remaining Tailwind dependency** — it previously mixed `var(--color-accent)`/`var(--color-pr)` inline (already CSS-var-based) with two `className="text-border"`/`className="text-muted"` + `stroke/fill="currentColor"` pairs (Tailwind-utility-based). Converted the latter to direct `var(--color-border)`/`var(--color-muted)` too, and swapped the top-level `<svg className="w-full">` for an inline `style`. This file now has zero Tailwind dependency and needs no changes in Wave 9.
- Found a **real small regression while verifying live**: the horizontal-scrolling filter-chip row (and, on reflection, `ExercisePicker`'s list and `ExerciseDetail`'s scroll container from Wave 3) lost the old `no-scrollbar` Tailwind utility's effect — bare `overflowX/Y: auto` in MUI shows a visible scrollbar where the original hid it. Fixed by extracting a small shared `noScrollbarSx` constant (`src/theme/noScrollbar.ts`) and applying it to all three spots. Worth checking for this same gap on any future page with a scrollable strip/list.

**Verification**: `npm run build` clean, `npm test` 157/157. Live-verified: History's three tabs (Workouts/Records/Calendar, including the calendar's progress rings against real logged data), drilling into a workout's detail page (table renders correctly), Favorites, the Exercises list with search + filter chips, opening `ExerciseDetail` (PR stat tiles, lifetime volume, the SVG progress chart rendering with correct colors — direct confirmation the CSS-variable bridge works for non-MUI consumers), and the `ExerciseForm` bottom sheet with its two `Select` dropdowns.

## Wave 5 — Routines

**Status: done**

Migrated `RoutinesPage.tsx`, `RoutineEditor.tsx`.

**Notable decisions**:
- `RoutineEditor` is a full inline page swap (rendered by `RoutinesPage` in place of the list, not an overlay) — unlike everything else this migration has touched, it doesn't use `BottomSheet` at all, since the original wasn't a sheet either.
- The target-sets stepper (`− N sets +`) has no MUI equivalent — built from two small `IconButton`s with a bordered square `sx` (matching the original's `h-8 w-8 border` look) around a fixed-width `Typography`. Same treatment as `ActiveWorkout`'s reorder buttons from Wave 3.
- `RoutineEditor`'s `window.confirm()` for deleting a routine became a `ConfirmDialog`, consistent with Waves 3-4.
- `RoutinesPage`'s `window.alert('Finish your current workout first.')` (shown when starting a routine while one's already active — not a confirm, just a notice) became an inline `Typography color="error"` line instead, following the same inline-error pattern already used on every form in this app. No `window.*` dialogs remain anywhere in the migrated portion of the app.

**Verification**: `npm run build` clean, `npm test` 157/157. Live-verified: routines list, opening the editor (reorder buttons, target-sets stepper — incremented and confirmed the count updates correctly, then navigated back without saving to leave the real routine's data untouched).

## Wave 6 — Friends & social

**Status: done**

Migrated `FriendsPage.tsx`, `FriendChatPage.tsx` (ping thread + the challenge composer/states), `FriendWorkoutsPage.tsx`, `FriendWorkoutDetailPage.tsx`.

**Notable decisions**:
- Extended the shared `SegmentedControl` component (Wave 1) to support an optional `badge` count per option, rendered via MUI `Badge` — needed for `FriendsPage`'s "Friends" tab showing a red pending-request-count pill, which the original hand-rolled with an absolutely-positioned `span`. A genuine, reusable capability addition, not a one-off hack.
- `FriendChatPage`'s sticky header bar (`bg-surface/90 backdrop-blur-sm` in the original) uses a literal `rgb(30 28 25 / 0.9)` (= `tokens.surface` at 90% alpha) rather than a theme-palette reference, since MUI's palette doesn't have a slot for "a translucent version of a solid color" — same reasoning as `GlassCard`/`GlassTile` reaching for literal `tokens.*` values instead of palette colors.
- Chat bubbles (`self-end`/`self-start` alignment) converted to `alignSelf`/`alignItems` on a `Box`, one visual branch for "mine" (accent-filled) vs "theirs" (glass-tile-style, built inline rather than via the `GlassTile` component since the bubble needs a rounded-pill shape `GlassTile`'s default radius doesn't match).
- `ChallengeSection`'s four distinct render states (no-open-challenge/composing, pending-mine, pending-theirs, active) were preserved exactly as separate early-return branches — no attempt to unify them into one parametrized render, since the original's branch-per-state structure was already the clearest way to express this.

**Verification**: `npm run build` clean, `npm test` 157/157. Live-verified `FriendsPage`: leaderboard (own row highlighted with the accent border, `ConsistencyRing` + score/volume rendering correctly), the Friends tab's empty state, and the segmented control's badge-capable extension (no badge shown currently since there are no pending requests on this dev account — the badge code path itself is exercised by nothing live yet, worth a manual check once a real pending request exists). **Not live-verified**: `FriendChatPage`'s ping thread and challenge flows, `FriendWorkoutsPage`/`FriendWorkoutDetailPage` — all require a second friended account to reach, which (same reasoning as `SignInPage` in Wave 2) isn't safely testable in this single-session browser tab. These reuse patterns (`GlassTile`, `Button`, `TextField`, `ProgressRing`, `Table`) already proven correct elsewhere, and the build is clean, but worth a manual look with a real friend connection.

## Wave 7 — Onboarding

**Status: done**

Migrated `WelcomeCarousel.tsx`, `OnboardingGate.tsx`.

**Notable decisions**:
- The male/female toggle dedupe (flagged back in Wave 2) is now complete — `StatsSlide` uses the same shared `SegmentedControl` as `StatsPage`, so the pattern exists in exactly one place instead of two hand-duplicated copies.
- `StatsSlide`'s activity-level `<select>` became a MUI `Select`, same treatment as `StatsPage`'s equivalent field back in Wave 2 (plain `Select` + `aria-label`, no floating `InputLabel`, since there's already a `Typography` caption pattern elsewhere in this app's forms — though note this particular field has no separate caption in the original design either way, it's a bare `Select` styled to match the surrounding text fields).
- Step-index carousel logic (`step < IDENTITY_STEP`, etc.) and the progress-dot row are untouched in structure — still plain conditional rendering keyed off numeric state, no swipe/animation library introduced. Progress dots are now a `Box` row with `bgcolor` driven by `primary.main`/`surface2.main` instead of Tailwind classes.

**Verification**: `npm run build` clean, `npm test` 157/157. **Not live-verified**: the only account available in this browser tab is already onboarded, and forcing the carousel to show would mean mutating that real dev account's `onboardedAt` field — same caution as the `SignInPage`/`FriendChatPage` gaps from earlier waves, so skipped rather than risking it. Every component this screen composes (`TextField`, `Button`, `SegmentedControl`, `Select`, `CalorieBreakdown`) is already proven correct live elsewhere (Waves 2 and 6), so confidence is reasonably high, but this is worth a first-run check with a fresh signup when convenient.

## Wave 8 — Share/export pages (special caution)

**Status: done**

Migrated `WorkoutBreakdown.tsx`, `ShareCard.tsx` + `SharePage.tsx`, `FriendTrophyCard.tsx` + `FriendTrophyPage.tsx`.

**Notable decisions**:
- Per the plan, these five files keep hardcoded colors (`tokens.*`, literal white/white-alpha) rather than theme-driven `sx` palette references — the exported card always renders dark-on-dark or overlaid on a photo regardless of the app's own light/dark theme, so it must not inherit from `useTheme()`.
- `GlassTile` (not a new pattern) reused as-is for `SharePage`'s "Take Photo"/"Choose Photo" buttons — the only non-exported UI in this wave, so no special treatment needed there.
- `shareStats.ts` is pure logic (`computeShareStats`) with no UI — untouched.

**The flagged risk — resolved, verified with real PNG exports, not just the on-screen preview**: exported actual PNGs via the app's own `domToBlob` → `downloadBlob` code path (intercepted `URL.createObjectURL`/`document.createElement('a').click`/`URL.revokeObjectURL` in-page via the browser devtools to capture the real `Blob` without writing anything to disk, then rendered it back as an `<img>` for visual inspection) for both branches of `ShareCard`:
  - **No-photo branch** (plain card, no `backdrop-filter`): 41.5KB PNG, renders correctly — dark surface, orange accent header, white stat text, correct layout.
  - **Photo branch** (the specifically-flagged risk: `backdrop-filter: blur(4px)` caption overlay on top of an `<img>`, captured through MUI/Emotion's runtime-injected `<style data-emotion>` tags): 104.5KB PNG, renders correctly — 9:16 frame, photo visible behind the overlay, the blurred semi-transparent caption panel positioned and rounded correctly, text legible and correctly colored. **Emotion's runtime style injection did not break `domToBlob`'s rasterization** — no fallback to plain inline styles was needed.
  - One cosmetic flake noticed: in one of the captures, the ⏱/🏋 emoji glyphs rendered as fallback/monochrome glyphs instead of full color. This reproduced inconsistently across otherwise-identical captures, which points to a `domToBlob` emoji-font-loading timing quirk (a general characteristic of DOM-to-canvas rasterization, not tied to the CSS engine) rather than an MUI/Emotion regression — not treated as a blocker, but worth a look if it recurs visibly in production exports.

**Known pre-existing debt, not introduced this wave**: `ShareCard.tsx`/`FriendTrophyCard.tsx` both render `<BarbellIcon className="h-5 w-5" />` — still a Tailwind utility class for icon sizing. This is the same pattern used app-wide since Wave 1 (icons never got wrapped in `SvgIcon`/switched to `sx`-based sizing as the original plan considered optionally doing), so it's not specific to this wave — flagging it here because Wave 9 (full Tailwind removal) will need a repo-wide fix for icon sizing before `h-4`/`h-5`/`w-4`/`w-5` etc. can safely disappear.

**Verification**: `npm run build` clean, `npm test` 157/157. Live-verified both `SharePage` (no-photo and with-photo, via a real uploaded image) and confirmed real PNG export bytes for both, per the plan's explicit "export and visually diff, don't just eyeball the preview" requirement. `FriendTrophyPage` reuses the identical `WorkoutBreakdown` component and export code path already proven correct here; not separately re-verified live this wave (same reasoning as other friend-only screens in Wave 6 — would need a second friended account to reach through the UI, though its rasterization logic is byte-for-byte the same `domToBlob` call already tested).

## Wave 9 — Cleanup

**Status: done — migration complete**

Removed Tailwind entirely and closed out the handful of files Waves 1-8 had deliberately left alone as "not yet migrated, still fine since Tailwind wasn't gone yet."

**Files touched**:
- `src/components/icons.tsx` — the 8 shared icon components (`BarbellIcon`, `PlateIcon`, `StopwatchIcon`, `ChecklistIcon`, `HeartOutlineIcon`, `ClipboardIcon`, `FlameIcon`, `PeopleIcon`) took a Tailwind `className` prop defaulting to `'h-4 w-4'`, with callers overriding it (`h-3.5 w-3.5`, `h-5 w-5`, `h-8 w-8`) — real Tailwind coupling that every earlier wave had left in place since deleting Tailwind wasn't due yet. Changed `IconProps` to `{ size?: number; color?: string }` (`size` in px, default 16 = the old `h-4 w-4`; `color` sets the SVG's own `color` style, which `stroke="currentColor"` resolves against) and updated all 13 call sites across `WelcomeCarousel.tsx`, `RoutinesPage.tsx`, `HistoryPage.tsx`, `ProfilePage.tsx`, `ShareCard.tsx`, `FriendTrophyCard.tsx`, `CalorieBreakdown.tsx` (×2), `FavoritesPage.tsx`, `ExerciseDetail.tsx` (×2), `ExercisesPage.tsx` to pass numeric `size` (and `color="var(--color-muted)"` for the two call sites that previously added Tailwind's `text-muted`) instead. `AppLayout.tsx`'s own local nav icons (`DumbbellIcon`/`ClockIcon`/etc.) already used raw `width`/`height` SVG attributes from Wave 1 and needed no change.
- `src/components/FirstVisitTip.tsx`, `src/components/PingAckBanner.tsx` — both still had their original hand-rolled Tailwind markup (`glass-card`, `border-accent/30!`, `btn-glow`, etc.) since Wave 1 built `InlineNotice` for exactly this but never wired it in. Wired both up now: `FirstVisitTip` is a straight swap; `PingAckBanner` passes its "Start" button as `InlineNotice`'s `action` slot, using a plain `variant="contained"` `Button` — the rust glow it used to get from the `btn-glow` utility now comes for free from the `MuiButton` theme override built in Wave 1 (same mechanism every other primary button in the app already uses).
- `src/App.tsx` — the `AuthLoading` splash (`<div className="flex min-h-svh items-center justify-center text-muted">`) became a `Box` with equivalent `sx`.
- `src/components/ErrorBoundary.tsx` — the crash-fallback screen (emoji, heading, body text, reload button) converted to `Box`/`Typography`/`Button`. Confirmed safe to use MUI here since `main.tsx` mounts `ErrorBoundary` *inside* `ThemeProvider`, so `sx`/theme colors are available even when this fallback is what's rendering.
- `package.json` — removed `tailwindcss`, `@tailwindcss/postcss`, `autoprefixer`, `postcss` from devDependencies. The latter two turned out to be already-unused once `@tailwindcss/postcss` (their only actual wiring, via `postcss.config.js`) was gone — confirmed via repo-wide grep for direct `postcss`/`autoprefixer` imports before removing.
- `postcss.config.js` — deleted (no PostCSS processing needed at all once Tailwind's gone).
- `src/index.css` — emptied to a one-line comment. Everything it used to own (design tokens, `@theme` block, the five `@utility` classes) was already fully superseded by `src/theme/tokens.ts` + `src/theme/globalStyles.ts` back in Wave 1; kept the file itself (rather than deleting it and the import in `main.tsx`) purely so `main.tsx` needs zero changes.
- Ran `npm install` after the `package.json` edit to actually remove the packages from `node_modules` and refresh the lockfile.

**Verification**:
- `npm run build` clean — and the built CSS asset dropped to ~0 KB gzipped (was ~3.75 KB with Tailwind's generated utility CSS still in the bundle), confirming no Tailwind output survives in the shipped app.
- `npm test` — 157/157.
- `npm audit` — no new vulnerabilities introduced by the removal; the only remaining high-severity finding is the same pre-existing `react-router` RSC-mode CSRF advisory noted in Wave 1 (still not applicable — this is a client-only SPA, not using RSC mode), left as-is for the same reason.
- Repo-wide grep for `className=` (down to the two harmless generic pass-through props on `ProgressRing`/`ConsistencyRing`, both currently unused by any caller), for the string `tailwind` (only historical code comments referencing the *old* utility names remain, zero live usage), and for any `tailwind.config.*`/leftover `@tailwindcss` references at the repo root — all clean.
- Full live click-through via the dev server: home/workout tab (background glow + noise texture, `Start Empty Workout` glow), Favorites (`InlineNotice`-based `FirstVisitTip` render + dismiss), Exercises list + `ExerciseDetail` bottom sheet (icon sizing, `ProgressChart` SVG colors via the CSS-variable bridge), Profile (stat tile icons, "Suggest a feature" icon), My Stats (`FlameIcon` next to TDEE, sex `SegmentedControl`), Friends leaderboard (`ConsistencyRing`), Routines, History's Calendar tab (goal-progress rings — confirms the CSS-variable bridge fully replaced what Tailwind's `@theme` block used to publish, since that block is now gone from `index.css` entirely), and a full start-workout → open exercise picker `BottomSheet` → close → `Discard Workout` → `ConfirmDialog` → confirm flow. No visual regressions found anywhere.

**The MUI migration is now complete end to end**: zero Tailwind dependency anywhere in `src/`, zero `window.confirm()`/`window.alert()` calls, no lingering mixed-styling pages. `docs/mui-migration-progress.md` (this file) stays as the historical record of how it was done, wave by wave, if it's ever useful context again (e.g. onboarding, or auditing a specific component's migration rationale).
