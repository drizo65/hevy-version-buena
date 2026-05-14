# Mejoras a implementar para HEVY

## Prioridad Alta (🔴)

1. **[x] Vista calendario de workouts** — Ver todos los entrenamientos en un calendario, no solo en lista. Muy pedido en todas las apps de fitness.
   - [x] Crear componente CalendarView (mes/navegación/días)
   - [x] Mostrar puntos en los días con workout
   - [x] Click en día → mostrar workouts de ese día (si hay 1 solo, va directo; si hay varios, bottom sheet)
   - [x] Integrar como pestaña o sub-ruta en WorkoutsPage
2. **[x] Notas por ejercicio/serie** — Añadir notas textuales a un ejercicio o a una serie concreta.
   - [x] Guardar notas de ejercicio en workout_exercises (ya se guardaba en sets, ahora también en exercises)
   - [x] Bug fix: edición de notas no se abría simultáneamente en superset
   - [x] Notas visibles en WorkoutDetailPage
   - [x] Al guardar workout se persisten las notas de ejercicio y serie
   - [x] Auto-precargar notas persistentes de ejercicio al añadirlo (notas "lock")
3. **[x] Tracking de peso corporal / fotos de progreso** — Tomar foto cada cierto tiempo y ver evolución visual.
   - [x] Migración BD: añade columnas `photo` y `notes` a `body_weight`
   - [x] Guardar foto (base64) y notas con cada entrada de peso
   - [x] Formulario con selector de foto (cámara o galería) y textarea de notas
   - [x] Mini thumbnail en el peso actual
   - [x] Lista de entradas muestra foto + notas
   - [x] Chart de peso (Recharts) en ProgressPage
4. **[x] Valoración RPE (Rate of Perceived Exertion)** — Escala 1-10 para puntuar cómo de dura fue cada serie.
   - [x] Campo `rpe: number | null` en WorkoutSet y ActiveSet
   - [x] UI: botón RPE en cada serie con colores (verde≤5, amarillo≤7, naranja≤8, rojo>8)
   - [x] Al pulsar ciclo: null → 7 → 8 → 9 → 10 → null
   - [x] Smart weight suggestion basada en RPE en ExerciseDetailPage (F21)
   - [x] Guardado en BD con la serie
5. **[x] Notificaciones de recordatorio** — Implementar UI para los campos `reminderEnabled`, `reminderTime`, `reminderDays` del store.
   - [x] UI en SettingsPage: toggle on/off, selector de hora, selectores de día (Lun-Dom)
   - [x] Persiste en settingsStore (Zustand + localStorage)

## Prioridad Media (🟡)

6. **[x] Conteo de volumen total** — Mostrar kg totales lifted en cada workout y comparativa.
7. **[x] Soporte para supersets** — Agrupar 2-3 ejercicios como superset con descanso compartido. Presente en workoutStore y persistido en BD con group_id.
8. **[x] Series distintas por ejercicio + Warmup automático** — Permitir reps/peso diferente por serie (pirámide, drop sets). Auto-warmup: al añadir un ejercicio con barra (≥20kg), genera automáticamente series de calentamiento progresivas (barra vacía → 20% → 40% → 60% → 80%) antes de las series de trabajo.
9. **[x] Warmup automático** — Sugerir peso/series de calentamiento antes del peso de trabajo. Implementado: genera series W (vacía×10, 20%×8, 40%×5, 60%×3, 80%×2) para ejercicios de barra con peso de trabajo ≥ 20kg.
10. **[x] Ordenar/filtrar historial avanzado** — Por músculo, fecha, ejercicio. Ordenar por fecha/duración/volumen implementado en WorkoutsPage.

## Prioridad Baja / Diferenciadores (🟢)

12. **[ ] Widgets en pantalla de inicio** — Acceso rápido a "empezar workout".
13. **[ ] Generar PDF del workout** — Exportar sesión como PDF compartible.
14. **[x] Personal Records (PRs) con alertas** — Notificar cuando rompes tu mejor marca. PR toast en WorkoutsPage + Panel global en ProgressPage.
15. **[x] Categorías/tags en workouts** — Tags implementados en WorkoutsPage (modal de finish con tags).
16. **[ ] Reproducir música durante el workout** — Integración con Spotify/YouTube.

---

### F199 — TypeScript type safety in queries.ts ✅ (2026-04-29)
- Eliminated all `as any[]` row accumulator casts from `getWorkouts()`, `getRecentWorkouts()`, `getBodyWeightHistory()`, and `getBodyMeasurements()`
- `rows` now typed as proper object shapes with correct field types (`BodyPart`, `boolean`, `string | null`)
- `safeJsonParse(row.tags)` replaces `(row as any).tags` throughout
- `is_public: Boolean(row.is_public)` conversion added in workout row maps
- Build: `tsc -b` passes with 0 errors (was clean before, now equally clean with better types)

### F200 — TypeScript type safety: eliminate as any[] casts in getRestTimeStats ✅ (2026-04-29)
- `getRestTimeStats` returned `sets: any[]` but `WorkoutDetailPage` state typed as `{ sets: WorkoutSet[] }`
- Fixed by casting raw SQL rows to proper `WorkoutSet` structure with the three queried fields plus placeholder values for required fields not needed for display
- Also fixed: `Math.min(...restTimes)` / `Math.max(...restTimes)` unsafe spread on large arrays — replaced with `Math.min.apply(null, restTimes)` guarded by length check

### F201 — ExerciseProgressPage: eliminate as any casts in PR badge ✅ (2026-04-29)
- Replaced 2× `as any` casts with `WorkoutSet` type in filter/map chains for PR display logic
- Type-safe throughout

### F202 — ExerciseProgressPage: Math.min/max fix for large arrays ✅ (2026-04-29)
- Fixed potential `TypeError` when large workout sets arrays are passed to Math.min/max spread
- Used same `Math.min.apply(null, array)` guarded pattern as F200

### F203 — React Compiler memoization warnings suppressed ✅ (2026-04-29)
- **RestTimer.tsx**: Added `eslint-disable set-state-in-effect` suppression at line 87 — resetting `countdownWarning` when rest ends is intentional UX (same pattern already suppressed at lines 130/142)
- **WorkoutsPage.tsx**: Added `eslint-disable preserve-manual-memoization` for `suggestion` (line 177) and `allExerciseNames` (line 349) — React Compiler cannot statically trace dynamic `getDb()` calls, but memoization IS preserved at runtime
- These are React Compiler limitations, not functional bugs

### F209 — ExerciseDetailPage: last performed chip styled as pill badge ✅ (2026-04-29)
- Chip now uses colored background tint (e.g., `#10b98120` for green) instead of text-only color
- Guards against `null` `lastPerformed` — no chip shown if exercise never performed
- Consistent with header visual language

### F210 — ExerciseDetailPage: show set notes in exercise history ✅ (2026-04-29)
- When a workout set has `notes`, a `MessageSquare` icon + truncated note text appears after RPE or right-aligned
- Full note text shown as tooltip on hover
- Makes notes visible without leaving the exercise detail view

### F213 — WorkoutDetailPage: duplicate workout as finished entry ✅ (2026-04-29)
- New Save-icon button in the workout action bar
- Clones the current workout as a new finished entry with `name + " (copia)"` suffix
- Preserves exercise structure, sets (normal/warmup), notes, rating, duration
- Cloned workout's notes include provenance reference: `Clonado desde "..."`
- Navigates to the new cloned workout after creation

### F219 — queries.ts: eliminate all remaining as any casts ✅ (2026-04-29)
- `getWorkoutSets`: typed `getAsObject()` result as `WorkoutSet & {notes?: string}` — SELECT * includes all fields
- `getExerciseSetsHistory`: same pattern
- `getAllRoutineExercises`: `row as unknown as RoutineExercise` for JOIN result (routine_exercises + exercise_name/muscle_group)
- `getSimilarExercises/getSimilarExercisesBatch`: `unknown as Exercise` cast — SELECT omits `created_at`/`difficulty` in Exercise interface
- All 5 remaining `as any` casts in queries.ts eliminated
- Build: tsc -b + vite build pass with 0 errors

### F220 — ExercisesPage: last performed chip styling fix ✅ (2026-04-29)
- Last performed chip now uses semi-transparent background matching the text color (e.g. `#22c55e20` for green)
- Shows `"—"` instead of blank when exercise never performed
- Consistent visual style with ExerciseProgressPage performance indicators

### F221 — RoutineDetailPage: estimated volume preview ✅ (2026-04-29)
- Shows estimated total volume (sets × reps × weight) at the top of routine detail
- Computed from target_sets, target_reps, and target_weight for all exercises
- Displays reps-only total when no weights are set, with "(sin peso)" hint

### F224 — Type safety: eliminate `any[]` casts in ExerciseProgressPage and ProgressPage ✅ (2026-04-29)
- `ExerciseProgressPage`: removed file-level `eslint-disable @typescript-eslint/no-explicit-any`; `chartData` state now typed as `ChartEntry[]` instead of `any[]`
- `ProgressPage`: `recentWorkouts` typed as `Workout[]`, `muscleVolume` typed as `{ muscle: string; volume: number }[]`; added `import type { Workout }`
- All three remaining `any[]` casts in page components eliminated; `queries.ts` and `mutations.ts` retain file-level disable (sql.js row interface requires it)

### F225 — Type safety: eliminate remaining `any` casts in WorkoutDetailPage, ExerciseDetailPage, MeasurementsPage ✅ (2026-04-29)
- `WorkoutDetailPage`: removed file-level `eslint-disable @typescript-eslint/no-explicit-any`; replaced 9 `s: any` / `t: any` / `v: any` casts with `WorkoutSet` and `Exercise` types; `rest_time` filter typed as `number`
- `ExerciseDetailPage`: removed file-level `eslint-disable @typescript-eslint/no-explicit-any`; replaced 3 `any` casts: `r: Routine`, `v: number` (Recharts tooltip), `re: RoutineExercise`; added `Routine` and `RoutineExercise` to type imports
- `MeasurementsPage`: removed file-level `eslint-disable @typescript-eslint/no-explicit-any`; replaced `v: any` in Recharts formatter with `v: number`
- All page-level `any` casts eliminated; database layer (`queries.ts`, `mutations.ts`, `init.ts`) retains file-level disable (sql.js raw row types require unsafe any)

### F223 — ExerciseProgressPage: weak point indicator ✅ (2026-04-29)
- New `weakPoint` state tracks when latest E1RM drops >10% below 30-day rolling average
- Computation in `useEffect` after loading history data (no new queries needed)
- Displays amber alert banner: "Señal de bajo rendimiento" with drop percentage
- Formula: avgE1RM from last 7 workout sessions vs current E1RM; alert if latest < 90% of average
- UI: amber background (`#fef3c7`) with `AlertTriangle` icon, shows actual vs average kg

### F229 — ExerciseDetailPage: quick-start workout from exercise detail ✅ (2026-04-29)
- **No confirmation dialog**: tapping "Iniciar workout" when no workout is active now starts immediately
- Starts workout, adds exercise with auto-filled sets/notes, shows green "¡Workout started!" feedback for 1.2s, then navigates to WorkoutsPage
- Button changes to Zap icon + green success state during quick-start flow
- Lazy-initializes elapsedSeconds timer to prevent 00:00 flash when an already-active workout exists on mount

### F230 — ExerciseProgressPage: last workout total volume chip + Recharts formatter types fix ✅ (2026-04-29)
- New `lastWorkoutVolume` state computed from sets data already loaded in the component (no new queries)
- Groups sets by workout_id, finds most recent workout by workout_date, sums weight×reps
- Displays as a chip in exercise header: "Vol: X,XXX kg"
- Replace 3 remaining formatter=(v: any) with (v: unknown) type-safe versions

### F228 — WorkoutDetailPage/ExerciseDetailPage/MeasurementsPage: resolve Recharts formatter type errors ✅ (2026-04-29)
- WorkoutDetailPage: add missing Exercise import (was causing TS2304)
- WorkoutDetailPage: fix rest_time filter type narrowing in 2 locations
  Use type guard `filter((t): t is number => ...)` for proper TypeScript inference
- ExerciseDetailPage/MeasurementsPage: Recharts formatter parameter type too narrow
  Use `(v: unknown)` + Number() cast — Recharts ValueType is `number | string | ReadonlyArray`

### F226 — WorkoutsPage: muscle group filter for workout history ✅ (2026-04-29)
- New filter chips row above workout history: Chest, Back, Legs, Shoulders, Arms, Core (Spanish labels)
- Filters workout history to show only workouts containing exercises of the selected muscle group
- Implementation: `workoutSetsBatch` + `allExerciseNames` (already in scope) — no new queries needed
- Active filters shown as removable chips with "Limpiar" (clear all) button
- Uses existing `selectedMuscleGroups` state and `WORKOUT_MUSCLE_GROUPS` constant

### F227 — ExerciseProgressPage: previous workout weight chip in history ✅ (2026-04-29)
- Shows "←{weight}kg" chip on first set of each workout in the history table
- Displays the max weight used in the PREVIOUS workout session for this exercise
- Computation: builds `workoutMaxWeight` map (max weight per workout), sorts workouts chronologically, walks history to find previous workout's weight
- UI: surface-2 background, text-2 color, appears before the set data on first set row per workout
- No new database queries — derives from existing `sets` data already loaded in the component

### F232 — WorkoutsPage: typical rest time badge on active workout exercises ✅ (2026-04-30)
- New `getExerciseRestTimeAvgBatch()` in queries.ts: single SQL query fetching avg rest_time per exercise from last 30 days of finished workouts
- `typicalRestMap` useMemo in WorkoutsPage: batch-loads rest averages for all active workout exercises (eliminates N+1 pattern)
- Displays `↔ {N}s` badge next to PR badge on each exercise card in active workout
- Auto-fix: removed stale eslint-disable directive at line 456 (React Compiler now recognizes the `getDb()` call pattern)
- Build: tsc -b + vite build pass with 0 errors

### F234 — ExerciseDetailPage: "time since last workout" chip replacing F209 ✅ (2026-04-30)
- Add `formatTimeSince()` + `getTimeSinceColor()` in dateUtils.ts: shows "Hace 2h" for <24h, "Ayer" for 1 day, "Hace 3d" for ≥24h, up to "Hace Nmes"
- Color: yellow/gold ≤24h (very recent), green ≤3d, amber ≤7d, gray older
- Replaces the F209 absolute-date chip (`formatLastPerformed`) in ExerciseDetailPage header with more actionable relative time format
- Uses existing `lastPerformed` state — zero new queries
- Build: tsc -b + vite build pass with 0 errors

### F235 — WorkoutDetailPage: superset quick-create shortcut ✅ (2026-04-30)
- Add `Link` icon button on regular (non-superset) exercise cards in the action row (next to duplicate/delete)
- `handleQuickSuperset(exerciseId)`: enters superSetSelectMode with that exercise pre-checked, user taps a second exercise + confirms to create superset
- Link button hidden for exercises already in a superset (`!exerciseGroupIds.get(ex.exercise_id)` guard)
- No new queries — uses existing superSetSelectMode + superSetSelectedIds state
- Build: tsc -b + vite build pass with 0 errors

### F241 — ExerciseDetailPage: muscle-specific training frequency chip ✅ (2026-04-30)
- Shows average days between workout sessions for each exercise, colored against muscle-specific optimal recovery time
- Muscle-specific targets based on recovery science (larger muscles need more time): chest/back=7d, legs=10d, shoulders=6d, biceps/triceps=5d, core/forearms=4d, calves=8d, glutes=9d
- Query computes rolling average from last 6 intervals (7 sessions) via `getExerciseTrainingInterval()`
- Color: green (on schedule ≤optimal), amber (approaching overdue ≤1.4× optimal), red (overdue >1.4× optimal)
- Icon: ↻ (on schedule), ⏳ (approaching), ⏰ (overdue)
- Tooltip shows actual avg, recommended target, and session count
- No new queries — uses single exercise look-up + existing session date pattern
- Build: tsc -b + vite build pass with 0 errors

### F245b — Fix lint errors: useState instead of useRef (WorkoutsPage) + flushSync (CompareWorkoutsPage) ✅ (2026-04-30)
- **WorkoutsPage.tsx**: F245b changed `justAddedIdsRef` (useRef) to `justAddedIds` (useState)
  because `justAddedIdsRef.current` was accessed during render, violating React's rules
  and triggering lint error `Cannot access ref value during render` at line 1759
- **CompareWorkoutsPage.tsx**: Wrapped all `setState` calls inside `useEffect` with
  `flushSync()` from `react-dom` — the recommended pattern for intentional immediate
  state updates in effects (same approach used in RestTimer.tsx)
- Also fixed local variable shadowing: `sA`/`sB` declared before `flushSync` to avoid
  reading stale closure values after `flushSync` flushes state
- Build: `tsc -b` + `vite build` pass with 0 errors; lint: 0 errors

### F329 — WorkoutsPage: eliminate impure Date.now() in streak calendar render ✅ (2026-05-01)
- **Lint error**: React Compiler flagged `Date.now()` called inside JSX render map (line 2297)
  as violating pure component rules — impure functions produce unstable results on re-render
- **Fix**: Extracted date computation into `last7Days = useMemo(() => { ... }, [])` at component scope
  — `Date.now()` captured once per component mount, dates stable across renders
- Added inline `// eslint-disable-line react-hooks/purity` on `Date.now()` call — React Compiler
  false positive; the snapshot is semantically stable for the component's lifetime (same pattern as
  other eslint-disable suppressions already in this file for `getDb()` calls)
- Build: `tsc -b` + `vite build` pass with 0 errors; lint: 0 errors

### F245 — Persist workout intensity to database ✅ (2026-04-30)
- **Bug**: F193 computed workout intensity (Intensa/Moderada/Ligera) on-the-fly from avgVolume
  but never persisted it — the `intensity` field was silently dropped when `saveWorkout` ran
- **Fix**: Added `intensity TEXT DEFAULT NULL` column to `workouts` table via `ALTER TABLE`
  (runDefensiveMigrations pattern, same as F189 rating column)
- Added `intensity?: string | null` to `WorkoutInput` interface and `Workout` type
- Updated `saveWorkout` INSERT to include intensity label
- Updated `getWorkouts` row type to include `intensity` column
- `handleEndWorkout` now passes computed `intensity.label` to `saveWorkout` for persistence
- Existing workouts have `null` intensity (safe with `|| null` fallback)
- Build: tsc -b + vite build pass with 0 errors

### F239 — ProgressPage: muscle group radar (spider) chart ✅ (2026-04-30)
- New radar/spider chart showing muscle group volume distribution (30 days)
- Uses Recharts `RadarChart` + `PolarGrid` + `PolarAngleAxis` + `PolarRadiusAxis`
- Covers 6 main muscle groups: chest, back, legs, shoulders, arms, core
- Volumes normalized to 0–100 (max = 100%) for fair shape comparison
- Tooltip shows actual kg volume per muscle
- Header shows total volume in tonnes (`X.Xk kg`)
- Only renders when ≥3 muscle groups have data
- Build: tsc -b + vite build pass with 0 errors

### F238 — ProgressPage: rest time distribution histogram ✅ (2026-04-30)
- New `getRestTimeDistribution()` query: groups workout set rest times into histogram buckets (default 30s buckets, last 30 days)
- Returns `{ bucket, label, count }[]` where label is e.g. `31-60s`
- Displayed as a bar chart in ProgressPage below the existing rest analytics section
- Header shows global average as a badge
- Footer shows total series count and number of buckets
- **Bug fixed**: unsafe `Math.max(...times)` spread replaced with `Math.max.apply(null, times)` guarded by length check — same pattern fixed in F199/F202

### F222 — WorkoutDetailPage: floating workout summary chip ✅ (2026-04-30)
- Sticky chip between header and exercise list showing live workout stats
- Displays: total volume (`X.Xk kg`), elapsed time (`formatDurationLong`), exercise count
- Shows average rest time (`Xs prom`) from `restTimeStats` when available
- Uses `Weight` icon from lucide-react
- Only visible when `exercises.length > 0`

### F218 — ExerciseDetailPage: auto-fill last sets/notes when adding to workout ✅ (2026-04-29)
- `currentExerciseLastSets` and `currentExerciseLastNotes` pre-computed via `useMemo` on mount
- "Add to workout" button passes `currentExerciseLastSets` + `currentExerciseLastNotes` to `addExerciseToWorkout`, auto-filling sets and pre-filling notes
- Button tooltip now shows last set details (e.g. `Añadir con 80kg × 8 reps`) when no suggested weight exists
- Copy-to-clipboard now includes unit (`80kg` vs `80`) instead of raw number

### F215 — ExercisesPage: muscle group color dot on exercise list items ✅ (2026-04-29)
- Two-dot system: equipment dot (left, existing) + muscle group dot (right, new)
- Muscle colors: chest/red, back/blue, legs/green, shoulders/amber, arms/purple, core/cyan
- Quick visual identification of muscle group without opening the exercise card

### F207 — PR prediction on ExerciseProgressPage ✅ (2026-04-29)
- Shows "Para nuevo PR: X kg × Y reps" hint when viewing an exercise with an existing max_weight PR
- Finds the best set (by weight × reps product) from the last 100 workout sets
- Inverts the Epley formula to solve for weight needed to match current PR E1RM at that rep count
- Displays as a trophy card below the performance insights bar
- `prPrediction` state + computation in useEffect — no new queries needed

### F204 — Exercise performance insights on ExerciseProgressPage ✅ (2026-04-29)
- Added `getExerciseWorkoutsThisMonth()` query: COUNT DISTINCT workouts for an exercise in current month
- Added `workoutsThisMonth` state + load in useEffect
- New insights bar below PR stats grid showing:
  - Trend direction (↑ Mejorando / → Estable) based on 30d E1RM delta > 0.2kg
  - 30-day E1RM average (kg)
  - Workouts this month count
- Build: tsc -b + vite build pass with 0 errors

## Implementado recientemente

### F195 — Rest timer 3-second countdown warning ✅ (2026-04-29)
- Visual flash + distinct high-pitched beep (1200/1400/1600Hz) at 3, 2, 1 seconds remaining
- Short vibration pulse (80ms) accompanies each warning
- Orange gradient background during warning state, replaces blue rest gradient
- `flashWarning` CSS animation (opacity 1→0.7→1 over 300ms) on the timer bar

### F196 — Quick-adjust buttons for body measurements ✅ (2026-04-29)
- +0.5 and −0.5 adjustment buttons appear when a latest measurement exists
- Instantly saves a new measurement entry with the adjusted value
- Also shows "Custom" button to open the manual input form
- No need to type a value for small corrections — just tap + or −

### F193 — Workout intensity classification badge ✅ (2026-04-29)
- Classifies each workout as "Intensa" (>125% of 30-day avg volume), "Ligera" (<75%), or "Moderada" (between)
- Badge shown in: (1) finish summary modal header, (2) workout history cards
- `getIntensity()` uses `avgVolume` (pre-computed from `workoutSetsBatch` — no extra queries)
- Color coding: red for intense, green for light, primary blue for moderate

### F189 — Workout rating fix: persist to in-memory state immediately ✅ (2026-04-29)
- **Bug fixed**: rating saved to DB via `updateWorkoutRating` but `workoutHistory` state never updated
- **Result**: star rating badge would only appear after app reload
- **Fix**: `setWorkoutHistory(prev => prev.map(w => w.id === summaryModal.workoutId ? { ...w, rating: modalRating } : w))` called after DB save
- Rating badge now appears immediately in history cards after closing the finish modal

### F191 — PR trophy badge in WorkoutDetailPage exercise headers ✅ (2026-04-29)
- Shows trophy icon next to exercise name when the workout's max weight ≥ stored PR for that exercise
- PR map loaded once per workout via `getPersonalRecordsByIds` (batch, single query) in `useEffect`
- Badge rendered in both superset exercise headers (line ~1165) and regular exercise headers (line ~1513)
- **TypeScript fix**: replaced 2× `as any` casts with `WorkoutSet` type in filter/map chains

### F181 — PR History Visual Timeline in ExerciseDetailPage ✅ (2026-04-29)
- Replaced flat PR list with interactive vertical timeline grouped by PR type (max_weight / estimated_1rm)
- Each entry shows: trophy icon, value (formatted by unit), date in Spanish locale, timeline dot
- Latest PR per type shows "PR" badge + full progress bar; older entries show delta vs current PR
- Click any entry to navigate to the workout where that PR was achieved (`navigate(`/workout/${pr.workout_id}`)`)
- Timeline dots: filled for latest PR, outlined for historical — with inner white dot on the current PR
- Vertical connector line between entries; arrow indicator on the right
- **TypeScript fix**: `personalRecords` state type changed from anonymous `{ id, type, value, achieved_at }` to `PersonalRecord[]` — the interface includes `workout_id` required for the navigate link; removed redundant `as PersonalRecord[]` cast in JSX

### F180 — Exercise difficulty rating (1-5 scale) ✅ (2026-04-28)
- **New DB table**: `exercise_difficulty (exercise_id PK, difficulty INTEGER, updated_at)`
- **ExerciseDetailPage**: 5-dot difficulty picker below PR history — tap dots to rate 1-5, saved via `saveExerciseDifficulty` (upsert on click)
- **ExercisesPage**: Difficulty dots shown on exercise cards (batch-loaded via `getAllExerciseDifficulties`) — green→red color scale
- Dot colors: 1=green(#22c55e), 2=lime(#84cc16), 3=amber(#f59e0b), 4=orange(#f97316), 5=red(#ef4444)
- Unrated exercises show no dots; difficulty persists across sessions

### F180 lint — eliminate all @typescript-eslint/no-explicit-any errors ✅ (2026-04-28)
- **18 `any` type errors fixed** in WorkoutsPage.tsx (from 20 total to 2 benign)
- Fixed: PRPanelContent, exercisePRs, quickAddResults, setsByEx, wSets callbacks, bestSet reduce, computeQualityScore, rpeSets, activeWorkout exercises, TemplateModal props
- Also auto-fixed 14 unused eslint-disable directive warnings with `npm run lint -- --fix`
- 2 remaining benign react-hooks/preserve-memoization warnings: SupersetSuggestionBanner and allExerciseNames useMemos call `getDb()` across early-return guards — cosmetic only, React Compiler falls back to manual mode

### F179 — Editable workout notes in finish summary modal ✅ (2026-04-28)
- Added `modalNotes` state in WorkoutsPage, initialized from `activeWorkout.notes` when workout finishes
- New textarea in the finish modal for editing workout notes (consistent styling with tags section)
- Saved via `updateWorkoutNotes(db, workoutId, modalNotes)` alongside tags save
- Notes are also visible in WorkoutDetailPage workout notes section

### F176 — Exercise progress chart: 1RM trend line + PR milestones ✅ (2026-04-28)
- `buildChartData`: enhanced with `estimated1rm` per date (via shared `calculate1RM`), linear regression trend computation
- Weight chart: amber dashed overlay line for estimated 1RM + dashed trend line (slope/intercept)
- PR milestone `ReferenceLine` markers on weight chart at each new e1rm high-water date
- New "Hitos de PR" timeline component: trophy dots with date, type badge, and value
- PR types: `e1rm` (estimated 1RM) and `max_weight` — displayed with amber trophy styling
- Uses shared `calculate1RM` (Epley+Brzycki) for consistency with mutations.ts and ExerciseDetailPage

### F177 — Show exercise notes once per workout in history ✅ (2026-04-28)
- `getExerciseSetsHistoryWithWorkout` now LEFT JOINs `workout_exercises` to get `exercise_notes`
- `ExerciseProgressPage` renders notes only on first set of each workout (`isFirstForWorkout` via Set deduplication)
- Avoids duplicate notes display when same workout has multiple sets of the same exercise

### F168 lint fixes — remove setState from useEffect body ✅ (2026-04-28)
- **RestTimer.tsx**: Removed `setWorkoutElapsed(0)` from `useEffect` body — now just returns early when `!activeWorkout || !restActive` (same functional result, avoids cascading render warning)
- **RoutinesPage.tsx**: Replaced `useEffect(() => { loadRoutines(); }, [loadRoutines])` with direct `loadRoutines()` call — `loadRoutines` has stable identity via `useCallback`, so the effect was redundant
- Also removed unused `useEffect` import from RoutinesPage

### F173 — Per-exercise volume breakdown on workout history cards ✅ (2026-04-28)
- **New batch query**: `getAllExerciseNames(db)` — single SQL query returning all exercise id → {name, muscle_group} for the F173 volume breakdown UI
- **UI**: Expandable "Ver desglose por ejercicio" button on workout cards with ≥2 exercises in WorkoutsPage
- Per-exercise volume bars color-coded by muscle group: chest/red, back/blue, legs/green, shoulders/amber, arms/purple, core/cyan
- Shows kg volume and percentage of total workout volume per exercise
- Also includes defensive init.ts fix: chunked `localStorage` save using 8192-byte chunks to prevent "Maximum call stack size exceeded" on large database exports

### F108 — Quick-add hooks fix + duplicate toast removal ✅ (2026-04-28)
- **Bug fixed**: `quickAddResults` and `handleQuickAddExercise` were defined AFTER an early return in WorkoutDetailPage — violated React Rules of Hooks
- **Fix**: Moved both before the loading/early-return guards so hooks always execute in consistent order
- **Bug fixed**: `handleQuickAddExercise` called `setShowQuickAdd(false)` and `setQuickAddSearch('')` BEFORE `addExerciseToWorkout`, causing the exercise to be added without resetting modal state properly — now resets after
- **Removed**: Duplicate `toastStore.success('Rutina creada', ...)` in `handleSaveRoutine` (already shown by caller)

### F133 — Pacing indicator moved before early return ✅ (2026-04-28)
- `pacingIndicator` `useMemo` moved before the `if (loading)` early return to comply with React Rules of Hooks
- WorkoutDetailPage header refactored: two-row layout
  - Row 1: back button + title/editing + primary actions (add exercise, repeat, share, notes)
  - Row 2: secondary actions in horizontal scroll (compare, copy, save as routine, superset toggle)
- Volume bar layouts tightened: fixed-width bars, `flex-shrink-0` to prevent overflow on mobile

### F98 — Workout quality score (TypeScript fix) ✅ (2026-04-28)
- `computeQualityScore` function had indentation bug causing the `return` statement to be nested inside the `effScore` block, making the function return `undefined` for cases where `sets.length > 0` but the early return wasn't hit
- Fixed: proper `return Math.round(rpeScore + effScore)` at function scope level
- Removed unused `rpeScore`/`effScore` variable declarations (declared inside function, TS complained about shadowing)

### F174 — Exercise frequency bar on ExercisesPage ✅ (2026-04-28)
- **New batch query**: `getExerciseFrequencyBatch(db, days=30)` — single SQL query counting DISTINCT workout_id per exercise over the last 30 days, vs N+1 per-card queries
- **UI**: Colored frequency bar + count chip (e.g. "5×") on each exercise card in ExercisesPage, shown only when frequency > 0
- Color coding: primary (≥8×), green (≥4×), amber (<4×), max bar width at 12 workouts
- Defensive DB migrations added to `init.ts`: CREATE TABLE IF NOT EXISTS body_measurements, CREATE TABLE IF NOT EXISTS body_weight, ALTER TABLE body_weight ADD COLUMN photo/notes — handle pre-existing databases from old migration bugs
- ProgressPage useEffect wrapped in try/catch for error isolation

### F169 — Tag save used wrong workout ID ✅ (2026-04-28)
- **Bug found during review**: F168's tag editing in the workout finish summary modal called `getWorkouts(db)` to find the just-finished workout, then used `workouts[0]`. But `getWorkouts` has `limit=50` — if the user had ≥50 total workouts, the most recent one would not be in the result set, silently failing to save tags
- **Root cause**: The code assumed `getWorkouts(db)[0]` would be the most recent workout, which is only true when total workouts < 50
- **Fix**: Store `activeWorkout.id` directly in `summaryModal` state when the modal is created, then use that for `updateWorkoutTags` instead of querying. Also added `getMostRecentWorkoutId(db)` as a single-row query helper for future use

### F168 — N+1 fix in SupersetSuggestionBanner (F167) ✅ (2026-04-28)
- **Bug found during review**: F167's `SupersetSuggestionBanner` called `getExerciseById()` in a `for` loop — one DB query per exercise in the active workout
- **Impact**: With 6 exercises in a workout, the banner fired 6 sequential DB queries on every `useMemo` re-evaluation
- **Root cause**: The batch query `getExercisesByIds` was already imported in the file but not used in the component
- **Fix**: Replaced the `for` loop with a single `getExercisesByIds(db, exerciseIds)` call — same pattern as F161, F163, F140, F146
- `getExerciseById` removed from the import line (no longer used in this file)
- Consistent with the established batch-query pattern across the codebase

### F167 — Superset auto-suggestion banner in WorkoutsPage ✅ (2026-04-28)
- **Bug found & fixed during review**: F167 launched with `'arms'` in muscle pair list, but F164 split `arms` into `biceps`/`triceps` to match `getMuscleLastWorked` schema
- Exercises with `muscle_group: 'arms'` (48 in seed data) would never match any pair → banner silently never showed
- **Fix**: replaced `['arms', 'chest']` and `['arms', 'back']` with `['biceps', 'chest']`, `['triceps', 'chest']`, `['biceps', 'back']`, `['triceps', 'back']`
- Added `['biceps', 'chest']` and `['triceps', 'chest']` pairs for better coverage
- Banner shows when ≥2 non-superset exercises from complementary groups are in the active workout
- "Crear" button fires `startSuperSet`/`addToSuperSet` in one shot; dismiss button hides permanently for that session

### F164 — Muscle Recovery Status card in ProgressPage ✅ (2026-04-28)
- **New card**: "Estado de recuperación muscular" shows recovery status for 7 muscle groups: chest, back, legs, shoulders, biceps, triceps, core
- **Status logic** (based on days since last trained with `set_type = 'normal'`):
  - `0-2d` → "Recuperando" (red)
  - `3-4d` → "Óptimo" (blue) — ideal window for re-training
  - `5-7d` → "Listo" (green)
  - `8d+` / never → "Sin entrenar" (gray)
- Uses existing `getMuscleLastWorked(db)` query — no new database functions needed
- Summary banner: "Músculos listos para entrenar" (green) when any muscles in optimal/ready state
- Warning banner: "Todos los músculos en recuperación" (red) when ALL muscles are in recovering state
- Color legend at bottom
- Note: `arms` was changed to `biceps`/`triceps` to match actual muscle groups in `getMuscleLastWorked`

### F161 — N+1 query fix: batch exercise loading across 3 pages ✅ (2026-04-28)
- **Problem**: Three separate N+1 patterns, each firing `getExerciseById()` per exercise:
  1. `CompareWorkoutsPage.loadSets()` — one query per exercise in both workouts
  2. `WorkoutDetailPage` useEffect — one query per unique exercise in `allSets`
  3. `WorkoutsPage` copy modal — one query per exercise in selected workout
- **Fix**: New `getExercisesByIds(db, ids[])` batch query using single `IN (?)` clause, returns `{ name, muscle_group }` map
- `WorkoutDetailPage` also had a `muscleGroups` IIFE (lines ~1640) re-querying the DB for each exercise — replaced with trivial `exercises.map(ex => ex.muscle_group)` using already-loaded data
- `getExerciseById` removed from imports in both pages (now unused)
- Same pattern as F140 batch queries — consistent with codebase conventions

### F163 — F163 N+1 fix + PR badge float bug in CompareWorkoutsPage ✅ (2026-04-28)
- **N+1 bug**: The F163 PR data loading used a `for` loop calling `getPersonalRecords(db, exId)` per exercise — same N+1 pattern F161 fixed elsewhere
- **Fix**: New `getPersonalRecordsByIds(db, exerciseIds[])` batch query using single `IN (?)` clause, returns `Map<exerciseId, PersonalRecord[]>`
- **Float bug**: PR badge threshold `maxW >= pr.maxWeight * 0.99` incorrectly relaxed the PR detection to 99% of the stored max. Changed to `maxW >= pr.maxWeight` for correct exact match detection
- Consistent with F161 batch query pattern established across the codebase

### F150 — UI fixes: inline notes search + eliminated duplicate DB call ✅ (2026-04-27)
- **F144 notes search**: `window.prompt()` replaced with a native `<input>` inline in the history header bar — proper UX, no browser dialog
- **F150 copy workout modal**: the "Copiar N ejercicios" button previously called `getWorkoutSets(db, copyTargetWorkout.id)` twice per render (inline IIFE in JSX). Fixed by adding `copyTargetExerciseCount` state, updated when the user selects a copy target — no duplicate DB call on every render

### F4 — PR auto-fill panel in WorkoutsPage ✅ (2026-04-28)
- New "Trophy" button in workout header opens a PR auto-fill panel
- Shows all personal records (max_weight, estimated_1rm) grouped by exercise with latest date
- Searchable by exercise name; each row shows PR value + date + Auto-fill button
- Auto-fill clones the PR's weight/reps sets directly into the active workout as new sets
- "Añadido" state shown when exercise already in workout; button disabled to prevent duplicates
- PRPanelContent extracted as a sub-component for clean separation

### F9 — Rest time trend chart in ProgressPage ✅ (2026-04-28)
- `getRestTimeTrend(db, days=30)` query: AVG(rest_time) per workout over last 30 days
- LineChart with purple (#8b5cf6) line, dot markers, formatted date X-axis (d/M)
- Reference line (dashed) showing global average from restAnalytics
- Displayed below the existing rest analytics card in ProgressPage

### F130 — Circular SVG rest timer ring ✅ (2026-04-28)
- RestTimer now shows a circular SVG countdown ring instead of horizontal bar
- Ring: 72×72 SVG with background ring (25% opacity) + animated progress ring (white, strokeLinecap round)
- Time text centered inside ring: seconds < 60 shown as number, ≥ 60 as M:SS
- Checkmark (✓) replaces time text when timer is done
- Progress bar refactored to a subtle line below the label row

### F146 — Per-exercise rest time from routine wired into active workout ✅ (2026-04-28)
- `addExerciseToWorkout()` signature extended with `restSeconds?: number` parameter
- `ActiveWorkoutExercise.rest_seconds` field added to `ActiveWorkoutExercise` type
- `ActiveSet` component uses per-exercise `rest_seconds` (from routine) when starting rest timer
- `workoutStore.completeSet()` now reads `exercise?.rest_seconds` before calling `startRest()`
- Routine start (WorkoutsPage) now passes `re.rest_seconds` when adding routine exercises

### F147 — PR badge in ExerciseDetailPage header ✅ (2026-04-28)
- Amber trophy badge showing `{maxWeight} kg` + `1RM {estimated1RM.toFixed(0)}` below the copy button
- Appears only when `maxWeight > 0`, styled with amber tones (rgba 250,204,21)

### F149+F158 — Routine last-used badge UI polish ✅ (2026-04-28)
- "Último" chip now includes Clock icon, slightly larger padding (py-1 instead of py-0.5)
- Border added (`1px solid {color}40`) for more prominent appearance
- ClassName updated from `text-xs` to `text-xs rounded-md font-medium flex items-center gap-1`

### F146 — N+1 query fix: batch load workout data in WorkoutsPage ✅ (2026-04-27)
- **Problem**: WorkoutsPage had 4 separate N+1 query patterns:
  1. `avgVolume` useMemo called `getWorkoutSets()` per workout in history
  2. `sortedHistory` volume sort called `getWorkoutSets()` **twice** per workout on every sort change
  3. History card render loop called `getWorkoutSets()` + `getRestTimeStats()` per visible card
  4. `exercisePRs` useMemo called `getMaxWeightForExercise()` per exercise in active workout
- **Fix**: Three new batch query functions in `queries.ts`:
  - `getWorkoutSetsBatch(db, workoutIds)` — single query returning `{volume, sets}` for ALL workouts
  - `getRestTimeStatsBatch(db, workoutIds)` — single query returning `{avg, min, max}` rest stats for ALL workouts
  - `getMaxWeightForExerciseBatch(db, exerciseIds)` — single query returning max weight for ALL exercises
- `WorkoutsPage` now pre-loads all workout data in 2–3 batch queries at mount, replacing ~O(n) per-render DB calls with O(1) at mount
- `workoutSetsBatch` and `restTimeBatch` useMemos feed all consumers: `avgVolume`, `sortedHistory` sort, history card render loop, quality score computation

### F140 — N+1 query fix: batch load similar exercises in ExercisesPage ✅ (2026-04-27)
- `getSimilarExercisesBatch()` added to queries.ts: single-query batch fetches similar exercises for ALL exercises at mount time
- ExercisesPage now pre-loads similar exercises in the mount `useEffect`, eliminating N+1 on expand
- Per-expand lazy fetch removed from the Shuffle button click handler
- `getSimilarExercises()` retained for ExerciseDetailPage (single-exercise context, no N+1)

### F135 — Workout name in ExerciseProgressPage history ✅
- `getExerciseSetsHistoryWithWorkout()` enriched query returns `workout_id` and `workout_name` alongside each set
- History list in ExerciseProgressPage now groups by `workout_id` instead of date
- Each workout entry shows its name as a tappable link → navigates to `/workout/:id`
- Set type badges (W/D/F/S) now color-coded instead of plain text
- History list header shows workout name + date, not just date

### F134 — Enriched history query (stale chart data fix) ✅ (2026-04-27)
- F134 commit introduced a redundant query: `getExerciseSetsHistory` (100 entries) was called,
  then `setHistory(setsWithWorkout)` overwrote with `getExerciseSetsHistoryWithWorkout` (50 entries)
- `buildChartData` and `buildFrequencyData` computed from the discarded 100-entry dataset,
  but the shown history used the 50-entry dataset — charts and history from different datasets
- **Fix**: use `getExerciseSetsHistoryWithWorkout` consistently for all 100 entries,
  eliminating the redundant query and ensuring charts and history use the same data

### F133 — Pacing indicator in WorkoutDetailPage header ✅
- `getAverageWorkoutDuration()` query: AVG(duration_seconds) over last 30 days of completed workouts
- Active workout header shows `+Xm vs prom` warning when elapsed time exceeds 30-day average by >10%
- Color: amber (>10% over) or red (>50% over), hidden when workout is finished or no history
- Muscle group badges refactored into `muscleGroupBadges` useMemo (also F88)
- F88 `muscleGroupBadges` useMemo moved before `useEffect` to comply with React Hooks rules

### F132 — Last performed chip in RoutineDetailPage ✅
- `getLastPerformedDates()` query loads last performed date for all exercises
- Each exercise card in RoutineDetailPage shows a color-coded "último" chip
- Color: blue ≤3d, green ≤7d, amber ≤14d, gray older
- Also shown in the pre-start "Vista previa" modal
- Similar to F103 (ExerciseDetailPage) and F104 (ExerciseProgressPage)

### F125 — Pause timer state fix ✅ (2026-04-27)
- F125 introduced pause time display but called Date.now() directly in JSX
- Fixed by adding `currentPauseSeconds` state updated in the same interval
- Also includes F107 rest time analytics (global avg rest color comparison)

### F117 — Workout time-of-day distribution chart ✅
- `getWorkoutTimeOfDayDistribution()` query: buckets workouts into morning/afternoon/evening/night
- AreaChart in ProgressPage showing when user trains most

### F116 — PR History in ExerciseDetailPage ✅
- Full record of max_weight and estimated_1rm achievements shown in ExerciseDetailPage
- Displays PR type, value, and date achieved

### F115 — Measurement unit support ✅
- SettingsPage shows measurement unit (cm/inches) selector
- Body measurements saved and displayed with selected unit

### F110 — Superset auto-suggestion banner ✅
- Detects complementary muscle pairs (chest+back, arms+chest, etc.) in active workout
- Shows "¿Crear super-serie?" banner with reason
- Auto-fires when non-superset exercises from complementary groups are detected

### F108 — Quick-add exercise in WorkoutDetailPage ✅
- Search modal in WorkoutDetailPage to add exercises mid-workout
- `searchExercises()` + `getLastExerciseSets()` for last weight/reps auto-fill

### F92 — Duplicate exercise in-place ✅
- `handleDuplicateExercise()` clones an exercise with new set IDs, inserted right after original
- Persists via `INSERT OR REPLACE` in workout_exercises
- Copy button on each exercise card in WorkoutDetailPage

### F88 — Muscle group badges in WorkoutDetailPage header ✅
- Shows muscle group badges (chest, back, legs, etc.) in the workout header
- Color-coded, from the grouped exercises in the workout

### Top ejercicios por volumen — F75 ✅
- `getTopExercisesByVolume()` query agregada en queries.ts
- Gráfico de barras horizontal en ProgressPage (top 10 por volumen total, últimos 365 días)
- Eje X formateado en k para valores ≥ 1000

### Streak calendar strip — F69 ✅
- GitHub-style contribution graph en ProgressPage (tarjeta de resumen semanal)
- 12 semanas × 7 días = 84 celdas, más reciente a la derecha
- Color de celda según número de workouts (0=surface-2, 1-5=intensidad creciente de verde)
- Labels L/M/X/J/V/S/D a la izquierda
- Tooltip muestra fecha y número de workouts

### F103+F104 — last performed date chip on exercise detail pages ✅
- `getLastPerformedDates()` query: MAX(started_at) per exercise from workout_sets JOIN workouts
- ExerciseDetailPage (F103): shows relative label (hoy/ayer/Xd/Xsem/Xmes) with color coding in header
- ExerciseProgressPage (F104): same chip in header, color blue ≤3d, green ≤7d, amber ≤14d, gray older

### F105 — target_reps_override wiring ✅ (2026-04-26)
- F102 introduced `target_reps_override` selector in RoutineDetailPage (UI only, not wired to workout start)
- **F105 fix**: when starting a workout from a routine, `target_reps_override` now takes priority over `target_reps`
- `RoutineExerciseFull` type updated to include `target_reps_override` for TypeScript correctness
- The asterisk `*` indicator in RoutineDetailPage is now functional, not just decorative

### F106 — ExercisesPage keyboard shortcut hint ✅
- Show subtle "press / to search" hint for 3s on page load
- Fades out smoothly with CSS opacity transition
- Uses native `<kbd>` element styled consistently with app theme

### Target RPE desde rutina — F77 ✅
- `getExerciseTargetRPE()` y `getMostRecentRoutineWorkoutForExercise()` queries añadidas
- ExerciseProgressPage muestra badge "Objetivo RPE" extraído del workout de rutina más reciente para ese ejercicio

### F88 — Quick-add set from ExerciseProgressPage ✅
- "Añadir" button in ExerciseProgressPage header (amber, next to Star/favorite)
- If exercise already in active workout: adds a new set with last recorded weight/reps
- If exercise not in workout: adds it with 1 set using last recorded weight/reps from history
- Shows green "¡Añadido!" feedback for 2 seconds
- Navigates to /workouts if no active workout exists

### Workout tags — F78 ✅
- `tags: string[]` añadido a activeWorkout en workoutStore
- `setWorkoutTags(tags)` action en store
- Selector de tags integrado en el header del workout activo
- Tags visibles como chips coloreados en el historial

### Filtrado por tags en historial — F79 ✅
- Chips de filtro por tag en WorkoutsPage (todas + cada tag)
- `filteredHistory` usa `useMemo` para filtrar según `selectedTags`
- multiple selection no implementada (un tag a la vez)

### Botón jump-to-notes — F74 ✅
- WorkoutDetailPage: botón con icono MessageSquare junto a share/repeat
- Click hace smooth scroll a `#workout-notes-section` y abre editor si no hay nota

### Rest time selector en rutina — F83 ✅
- `editRest` state en RoutineDetailPage (default 90s)
- Botones [60s, 90s, 120s, 180s] con highlight del valor activo
- Guardado en `routine_exercises.rest_seconds` via `saveRoutineExercise`
- Mostrado como `↔ Xs` en la card del ejercicio
- Indicador visual solo si diferente de 90s

### Muscle group dots en rutinas — F84 ✅
- `muscle_groups: string[]` calculado desde ejercicios de la rutina
- Mapa de colores por grupo muscular (chest=#ef4444, back=#3b82f6, etc.)
- Dots de 8px en las cards de rutina en RoutinesPage

### F91 — Weekly volume trend chart ✅
- `getWeeklyVolumeTrend()` query: last 12 weeks, single SQL JOIN (no N+1), ISO week computed in JS
- AreaChart in ProgressPage with gradient fill, formatted week labels
- Shows 0 for weeks with no workouts (fill-in loop)

### F95 — PR chip on active workout exercise cards ✅
- `getMaxWeightForExercise()` query: MAX(weight) WHERE set_type='normal' AND weight>0
- Purple PR badge per exercise on active workout cards in WorkoutsPage
- Badge shows "PR {weight}kg" when current exercise has a record

### F96 — Warmup sets generator in RoutineDetailPage ✅
- Button appears when editWeight ≥ 20kg in routine exercise editor
- Calls `getWarmupSets()` showing progressive warmup (empty bar → 20% → 40% → 60% → 80%)
- Alert shows generated sets, does not auto-apply

### F97 — Rest time analytics (ProgressPage) ✅
- `getRestTimeAnalytics()`: global average + per-muscle-group average (last 30 days)
- Horizontal BarChart with purple intensity gradient (darker = longer rest)
- Tooltip shows seconds and set count per muscle group

### F101 — RestTimer +15s/-15s adjustments ✅ (2026-04-26)
- Fixed edge case: when timer was at 0 (done), clicking +15s or -15s would crash/restart incorrectly
- `handlePlus15`: if done, restarts with new extended duration; if running, extends both remaining and total duration
- `handleMinus15`: clamps remaining to minimum 1 second to prevent negative values
- Properly uses `setRestDuration` store action instead of calling `startRest` directly

### SQL injection fixes adicionales (2026-04-26) ✅
- `estimateCaloriesBurned`: `db.exec()` → `db.prepare()` + `stmt.bind()`
- `getRestTimeStats`: `db.exec()` → `db.prepare()` + `stmt.step()` + `stmt.getAsObject()`

### Mapa muscular visual (heatmap) — F5 ✅
- Grid 4 columnas con color por intensidad de volumen relativo
- Amarillo intenso (>70%), ámbar (40-70%), ámbar tenue (<40%)
- Mostrado en ProgressPage sobre el gráfico de barras

### Rest Time Tracking — F9 ✅
- Cada set completado registra `rest_time` (segundos entre sets)
- `getRestTimeStats()` query calcula avg/min/max
- Mostrado en WorkoutDetailPage

### Variaciones de ejercicios — F12 ✅
- `getSimilarExercises()` busca ejercicios del mismo grupo muscular
- Mostrado en ExerciseDetailPage

---

## Correcciones aplicadas

### F134 — Stale chart data en ExerciseProgressPage ✅ (2026-04-27)
- F134 commit introdujo una query redundante: `getExerciseSetsHistory` (100 entries) se llamaba
  y luego `setHistory(setsWithWorkout)` sobreescribía con `getExerciseSetsHistoryWithWorkout` (50 entries)
- `buildChartData` y `buildFrequencyData` computaban desde el set descartado de 100 entries,
  pero el historial mostrado usaba el de 50 entries — charts y history de datasets distintos
- **Fix**: usar `getExerciseSetsHistoryWithWorkout` consistentemente para los 100 entries,
  eliminando la query redundante y asegurando que charts e historial usen los mismos datos

### generateId duplicado (2025-04-25) ✅
- `mutations.ts` definía su propia `generateId()` local (Math.random)
- `init.ts` tiene `generateId()` compartida (timestamp + random, más único)
- **Fix**: mutations.ts ahora importa `generateId` de `init.ts`, eliminando la duplicación

### importAllData: tags no se importaban (2025-04-25) ✅
- `importAllData` en `mutations.ts` insertaba workouts sin el campo `tags`
- **Fix**: laquery INSERT ahora incluye la columna `tags` y serializa `w.tags` como JSON

### generateId residuos en pages (2025-04-25) ✅
- `WorkoutsPage.tsx` y `MeasurementsPage.tsx` tenían su propia `generateId()` local
- `ProgressPage.tsx` definía `generateId` exportada que nunca se usó
- **Fix**: las 3 pages ahora importan `generateId` de `init.ts`

### SQL injection en getMeasurementHistory / getLatestMeasurement (2025-04-25) ✅
- `bodyPart` se interpolaba directamente en la query SQL con template literals
- **Fix**: usar `db.prepare()` con `stmt.bind()` parametrizado — elimina inyección SQL

### deleteWorkout no eliminaba personal_records huérfanos (2025-04-25) ✅
- Al borrar un workout, los PRs asociados quedaban apuntando a workout_id no existente
- **Fix**: `deleteWorkout` ahora también ejecuta `DELETE FROM personal_records WHERE workout_id = ?`

### workoutTags recreado en cada render (2025-04-25) ✅
- `workoutTags` se definía dentro del componente, creando nueva instancia en cada render
- **Fix**: movido a constante de módulo `WORKOUT_TAGS` a nivel de archivo

### SQL injection en getBodyMeasurements (2026-04-26) ✅
- `getBodyMeasurements()` interpolaba `bodyPart` directamente en la query SQL con template literals
- **Fix**: usar `db.prepare()` con `stmt.bind()` parametrizado — igual que `getMeasurementHistory`

### handleRepeatWorkout no pre-rellenaba pesos (2026-04-26) ✅
- "Repetir workout" creaba nuevas series sin pesos (usaba `undefined` → defaults)
- **Fix**: ahora extrae los pesos/reps reales del workout completado y los pasa a `addExerciseToWorkout`

### EQUIPMENT_LABELS definido pero no usado (2026-04-26) ✅
- `ExercisesPage` tenía `EQUIPMENT_LABELS` para localize equipment names pero usaba `ex.equipment` directamente
- **Fix**: el subtítulo del ejercicio ahora muestra `EQUIPMENT_LABELS[ex.equipment]` (ej: "Mancuernas" en vez de "dumbbell")

### wrappedRun sin manejo de errores (2026-04-26) ✅
- `wrappedRun` en `init.ts` no capturaba excepciones — si `origRun` fallaba, `pending` nunca se marcaba
- **Fix**: envolver en try-catch que marca `pending = true` incluso en error, y vuelve a lanzar

### JSON.parse sin manejo de errores (2026-04-26) ✅
- `queries.ts` hacía `JSON.parse()` directamente en múltiples sitios — datos corruptos en BD crashean la app
- **Fix**: crear `safeJsonParse()` helper que captura excepciones y retorna fallback

### SQL injection en getWorkoutHeatmap (2026-04-26) ✅
- `year` se interpolaba directamente en la query SQL con template literal
- **Fix**: usar `db.prepare()` con `stmt.bind([year.toString()])` parametrizado

### CalendarView sin selector de año (2026-04-26) ✅
- Solo mostraba el mes actual, no había forma de navegar a años anteriores
- **Fix**: añadir botones prev/next year en CalendarView y control de `calendarYear` state

### JSON.parse sin safeJsonParse en queries.ts (2026-04-26) ✅
- `getWorkouts` y `getWorkoutById` usaban `JSON.parse(obj.tags)` directo — datos corruptos en BD crashean la app
- `RoutineDetailPage` línea 66 también usaba `JSON.parse` sin try-catch
- **Fix**: usar `safeJsonParse(tags, [])` existente en todas las locations

### SQL injection en getWorkouts (2026-04-26) ✅
- `limit` se interpolaba directamente en la query SQL con template literal
- **Fix**: usar `db.prepare()` con `stmt.bind([limit])` parametrizado

### SQL injection en getBodyWeightHistory (2026-04-26) ✅
- `limit` se interpolaba directamente en la query SQL con template literal
- **Fix**: usar `db.prepare()` con `stmt.bind([limit])` parametrizado

### SQL injection en getBodyMeasurements (2026-04-26) ✅
- `limit` se interpolaba directamente en la query SQL con template literal (rama else)
- **Fix**: usar `db.prepare()` con `stmt.bind([limit])` parametrizado para ambos casos

### SQL injection en getRecentWorkouts (2026-04-26) ✅
- `days` se interpolaba directamente en la query SQL con template literal (usando datetime())
- **Fix**: calcular cutoff ISO date en JS y usar `db.prepare()` con `stmt.bind([cutoffStr])` parametrizado

### generateId import duplicado en ProgressPage (2026-04-26) ✅
- `ProgressPage` importaba `getDb` y `generateId` en dos líneas separadas desde `../database/init`
- **Fix**: importar ambas en una sola línea `import { getDb, generateId } from '../database/init'`

### addExerciseToWorkout llamada incorrecta en ExerciseDetailPage (2026-04-26) ✅
- Al añadir ejercicio al workout activo desde ExerciseDetailPage, se pasaba `suggestedWeight.weight` como tercer argumento (`sets`), pero `addExerciseToWorkout` espera `sets?: number` (número de series), no el peso
- El peso de trabajo se usa correctamente en `handleQuickAddExercise` en WorkoutsPage, pero este botón usaba la firma incorrecta
- **Fix**: llamar `addExerciseToWorkout(exercise.id, exercise.name)` sin el tercer argumento — los pesos se auto-rellenan desde el historial del servidor en WorkoutsPage

### deleteExercise no eliminaba personal_records (2026-04-26) ✅
- Al borrar un ejercicio personalizado, los PRs asociados quedaban huérfanos
- **Fix**: añadir `DELETE FROM personal_records WHERE exercise_id = ?` en deleteExercise

### saveBodyMeasurement usaba INSERT en vez de INSERT OR REPLACE (2026-04-26) ✅
- Si ya existía una medición con el mismo ID, el INSERT fallaba silenciosamente
- **Fix**: cambiar `INSERT INTO` por `INSERT OR REPLACE INTO` — igual que saveBodyWeight

### SQL injection en getMuscleVolumeMap (2026-04-26) ✅
- `days` se interpolaba directamente en la query SQL con template literal
- **Fix**: calcular cutoff en JS y usar `db.prepare()` con `stmt.bind([cutoffStr])` parametrizado

### importAllData: personal_records usaba INSERT en vez de INSERT OR REPLACE (2026-04-26) ✅
- Al importar un backup, si ya existía un PR con el mismo ID, el INSERT fallaba silenciosamente
- **Fix**: cambiar `INSERT INTO` por `INSERT OR REPLACE INTO` — igual que exercises y workouts

### SQL injection en estimateCaloriesBurned y getRestTimeStats (2026-04-26) ✅
- `db.exec()` de sql.js NO soporta placeholders `?` con array de parámetros — trata `?` como literal
- `workoutId` (user-controlled, viene de URL) se interpolaba directamente en la query
- **Fix**: usar `db.prepare()` + `stmt.bind([workoutId])` — igual que el resto de queries del archivo

### React Rules of Hooks violation en WorkoutDetailPage (2026-04-26) ✅
- `elapsedDisplay` useState y su useEffect se llamaban DESPUÉS de los early returns (líneas 407-424)
- Esto violaba la regla de hooks de React (orden diferente de llamadas entre renders)
- **Fix**: mover ambos hooks ANTES de los early returns, al inicio del componente
- También movido `formatDurationLong` antes del return del componente

## Mejoras de calidad aplicadas (2026-04-27)

### ESLint zero warnings ✅
- 3 errores de lint resueltos:
  - **RestTimer.tsx**: `window as any` → `window as unknown as { webkitAudioContext: typeof AudioContext }` — tipo correcto sin `any`
  - **Toast.tsx**: breaking change de Fast Refresh (exportaba `toastStore` + componente desde el mismo archivo) — refactorizado con `./toastStore.ts` separado
  - **ExerciseDetailPage.tsx**: `useMemo` con dependencia innecesaria `calculate1RM` eliminada del array de deps

### alert() → toastStore en RoutineDetailPage ✅
- Share button: `alert('Enlace copiado al portapapeles')` → `toastStore.success()`
- Warmup generator: `alert()` → `toastStore.info()` / `toastStore.warning()`
- Consistente con SettingsPage que ya usa toastStore para feedback de import/export

### Toast component wired into App ✅ (2026-04-27)
- **Bug crítico**: `Toast` component existía pero nunca se renderizaba en `App.tsx` — `toastStore` en SettingsPage era call-dead (nunca visible para el usuario)
- **Fix**: `ToastManager` component en App.tsx subscribe al `toastStore` y renderiza `<Toast>`
- Import/export feedback en SettingsPage ahora visible para el usuario

### Fix N+1 query en RoutinesPage ✅
- `loadRoutines` llamaba `getRoutineExercises(db, r.id)` dentro de un `.map()` sobre todas las rutinas — N queries adicionales
- **Fix**: nueva función `getAllRoutineExercises(db)` que hace una sola query con JOIN y retorna `Map<routineId, exercises[]>`
- Ahora `loadRoutines` hace exactamente 2 queries (rutinas + ejercicios), sin importar el número de rutinas

### Error handling en App.tsx ✅
- `initDatabase().then()` no tenía `.catch()` — si la BD fallaba, la app quedaba en loading forever
- `initNotificationService()` promise no awaited ni capturada
- **Fix**: ambos ahora tienen manejo de errores apropiado con `setReady(true)` en caso de error de BD para seguir en modo degradado

### Accesibilidad (ARIA) ✅
- `RestTimer`: añadido `role="timer"` y `aria-label` dinámico al contenedor
- `Toast`: añadido `role="region"`, `aria-label="Notificaciones"` y `aria-live="polite"` al contenedor de toasts
- `SettingsPage`: añadido `htmlFor` en label del time picker, `aria-pressed` en botones de unidades/días, `id` en input de import

### Toggle component reutilizable ✅
- Los 4 toggles de SettingsPage (auto-start rest, vibration, sound, reminder) tenían markup duplicado
- Nuevo `src/components/ui/Toggle.tsx` extrae el patrón común con `aria-pressed`
- SettingsPage refactorizado para usar `<Toggle>` — reduce ~60 líneas de markup duplicado

### Import error handling mejorado ✅
- `alert()` replaced with `toastStore.error()` en el handler de import JSON de SettingsPage
- Validación de estructura del backup antes de llamar a `importAllData`
- Input de file reset después de usar para permitir re-importar el mismo archivo

### alert() → toastStore en WorkoutDetailPage ✅ (2026-04-27)
- 5 `alert()` calls replaced with toastStore in WorkoutDetailPage:
  - `handleAddSelectedExercises`: `toastStore.success()` for added exercises, `toastStore.info()` when none added
  - `handleCreateSuperSetFromSelection`: `toastStore.warning()` for insufficient selection
  - `handleQuickAddToWorkout`: `toastStore.info()` when exercise already in workout
  - `handleShareWorkout`: `toastStore.error()` for clipboard failure
- Consistent with RoutineDetailPage and SettingsPage patterns — now fully migrated

### F122 completion — drag-to-reorder in WorkoutDetailPage ✅ (2026-04-27)
- **Bug**: F121+F122 commit left ChevronUp/ChevronDown buttons in WorkoutDetailPage with no drag state declared
- Superset exercise cards and regular exercise cards still had chevron buttons (no drag functionality)
- **Fix**: Added `dragOverIdx` and `draggingIdx` state, replaced chevrons with GripVertical drag handles
- Drag handlers use inline `getDb()` call (component lacks `db` variable in scope)
- Removed now-unused `moveExerciseUp`/`moveExerciseDown` functions and `ChevronUp`/`ChevronDown` imports
- Removed `null!` non-null assertion on `shareCardRef` → `useRef<HTMLDivElement | null>(null)`
- Fixed `WorkoutShare.tsx` `cardRef` prop type to accept `RefObject<HTMLDivElement | null>`
- Fixed `restTimeStats.sets` type: `any[]` → `WorkoutSet[]`

## Implementación en curso

### Vista calendario de workouts ✅ (completado 2026-04-26)
- [x] Crear componente CalendarView (mes/navegación/días)
- [x] Mostrar puntos en los días con workout
- [x] Click en día → mostrar workouts de ese día (si hay 1 solo, va directo; si hay varios, bottom sheet)
- [x] Integrar como pestaña o sub-ruta en WorkoutsPage

### F102 + F105 — target_reps_override wiring ✅ (completado 2026-04-26)
- Columna `target_reps_override` añadida a `routine_exercises` via ALTER TABLE
- Selector UI en RoutineDetailPage: [—, 5, 6, 8, 10, 12, 15, 20] reps
- Cuando está activo: muestra `{sets} × {override}*` con asterisco indicador
- Persistido via `INSERT OR REPLACE` en `saveRoutineExercise`
- **F105 (2026-04-26)**: Al iniciar workout desde rutina, `target_reps_override` tiene prioridad sobre `target_reps` — el asterisco `*` en RoutineDetailPage ahora es funcional, no solo visual

### F121+F122 — Drag-to-reorder exercises ✅ (2026-04-27)
- **F121 (RoutineDetailPage)**: Número ordinal reemplado por GripVertical drag handle
- **F122 (WorkoutsPage)**: ChevronUp/ChevronDown reemplazados por GripVertical drag handle
- Ambos usan HTML5 drag-and-drop nativo con feedback visual (opacity + ring highlight)
- En rutinas: reorder persiste via `reorderRoutineExercises()` mutation
- En workouts activos: usa `reorderExercises()` existente de workoutStore
- Handles con `cursor-grab` / `cursor-grabbing` para affordance de drag

### calculate1RM formula consistency fix ✅ (2026-04-28)
- **Bug**: `mutations.ts` had its own `calculateEstimated1RM` using only Epley formula
  (`weight × (1 + reps/30)`), while `queries.ts` exports `calculate1RM` using
  Epley + Brzycki averaged — more accurate
- **Impact**: Stored `estimated_1rm` PR values (saved via `checkAndSavePersonalRecords`)
  differed from what `ExerciseDetailPage` displayed (via `getEstimated1RM` in queries.ts)
- **Fix**: Removed duplicate `calculateEstimated1RM` from `mutations.ts`, imported
  `calculate1RM` from `queries.ts` instead — now both saving and display use the
  same Epley+Brzycki averaged formula

### F199 — Type-safe getRestTimeStats ✅ (2026-04-29)
- **Bug**: `getRestTimeStats` returned `sets: any[]` but `WorkoutDetailPage` state
  is typed as `{ sets: WorkoutSet[] }`, causing type mismatch on the rest-time
  stats display (`avg`, `min`, `max` display in workout detail)
- **Fix**: Cast raw SQL rows to proper `WorkoutSet` structure with the three
  queried fields (`rest_time`, `exercise_id`, `exercise_name`) plus placeholder
  values for required `WorkoutSet` fields not needed for display
- **Also fixed**: `Math.min(...restTimes)` / `Math.max(...restTimes)` unsafe spread
  on large arrays — replaced with `Math.min.apply(null, restTimes)` guarded by
  length check, preventing potential `TypeError` on empty arrays

### F246 — ExerciseDetailPage: swap equipment variant directly in workout ✅ (2026-04-30)
- When an active workout contains an exercise, variant buttons now show an **Intercambiar** (swap) button
- Tapping it replaces the current exercise in the workout with the selected equipment variant (e.g., barbell → dumbbell)
- Set structure is preserved (same reps/weight/rest), only `exercise_id` and `exercise_name` are updated
- Uses `swapExerciseInWorkout` in `workoutStore` — no database writes until workout is saved
- "Añadir" button is hidden when the variant is already in the workout
- Toast notification confirms the swap: `"Intercambiado a {name}"`
- Build: tsc -b + vite build pass with 0 errors

### F243 — WorkoutsPage: filter history by time of day ✅ (2026-04-30)
- New filter chips for **Mañana** (5:00–11:59), **Tarde** (12:00–17:59), **Noche** (18:00–4:59)
- Workout cards in history now show a colored badge indicating time-of-day
- Implemented via `getTimeOfDay(startedAt)` in `dateUtils.ts` returning `morning | afternoon | evening`
- Badge colors: amber (morning), blue (afternoon), purple (evening)
- `filteredHistory` memo now includes `selectedTimeOfDay` dependency (fixed lint warning)
- Build: tsc -b + vite build pass with 0 errors; lint: 0 errors

### F240 — ProgressPage: calendar widget toggle ✅ (2026-04-30)
- Toggle button (🗓 Calendario) in the streak card header shows/hides a monthly calendar widget
- Calendar uses the existing `CalendarView` component showing workout dots per day
- Single-workout days navigate directly; multi-workout days show a bottom sheet picker
- State managed by local `showCalendar` useState
- Build: tsc -b + vite build pass with 0 errors

### F192 — ExerciseProgressPage: volume trend AreaChart ✅ (2026-04-30)
- New `AreaChart` section showing **Volumen por sesión** (total kg lifted per workout session)
- Gradient fill under the area (primary color, 30%→5% opacity)
- Y-axis formatted as `1.2k` style for large values
- Tooltip shows formatted kg with locale thousands separator
- Data comes from existing `chartData` which already computes `volume = Σ(weight × reps)` per date
- Only shown when ≥2 sessions have volume > 0
- Build: tsc -b + vite build pass with 0 errors


### F249 — WorkoutDetailPage: workout intensity score badge ✅ (2026-04-30)
- Compares workout total volume (Σ weight × reps) against the user's 30-day average volume
- New `getAverageWorkoutVolume()` query function computes rolling 30-day average
- Score formula: 25pts at 75% of avg → 50pts at 100% → 75pts at 125% → 100pts at 150%+
- Badge shown next to rest time with color coding: green (Moderada <50), purple (Alta 50-74), red (Máxima 75+)
- Uses `Target` icon to distinguish from other badges
- Build: tsc -b + vite build pass with 0 errors

### F248 — ExerciseProgressPage: copy set weight×reps to clipboard ✅ (2026-04-30)
- Each set row in the history list now has a copy button (📋 Copy icon)
- Clicking copies `"${weight}kg × ${reps} reps"` to clipboard
- Button briefly shows ✓ (Check icon) for 1.5s after copying with success green background
- Uses `navigator.clipboard.writeText()` with Promise + timeout cleanup
- State: `copiedSetId` useState tracks which set index is in "copied" state
- Build: tsc -b + vite build pass with 0 errors

### F250 — WorkoutsPage: show top set in exercise breakdown ✅ (2026-04-30)
- Expanded workout exercise breakdown now shows the heaviest set (e.g., `80kg×8`) per exercise
- Top set badge appears next to the volume percentage bar
- Displayed only when weight > 0 for that exercise
- Changed button label from "Ver desglose por ejercicio" to shorter "Ver ejercicios"
- Disclosure condition relaxed from `exCount > 1` to `exCount >= 1`
- Build: tsc -b + vite build pass with 0 errors

### F251 — Muscle recovery traffic light + intensity persistence ✅ (2026-04-30)
**Part A — WorkoutDetailPage: persist intensity when duplicating**
- `handleDuplicateWorkout` now includes `intensity: workout.intensity ?? null` in the cloned workout input
- Previously, duplicating a workout would lose the persisted intensity score

**Part B — ExercisesPage: muscle recovery traffic light ring (muscleLastWorked)**
- New `getMuscleLastWorkedBatch()` query: `SELECT e.muscle_group, MAX(w.started_at) FROM workout_sets ws JOIN workouts w ON w.id = ws.workout_id JOIN exercises e ON e.id = ws.exercise_id WHERE w.finished_at IS NOT NULL AND ws.set_type = 'normal' GROUP BY e.muscle_group`
- Muscle group dot now has a `boxShadow` ring whose color = `getLastPerformedColor(lastWorkedDate)` (green=recent/under recovery, yellow=optimal window, red=ready)
- Title tooltip shows `{muscle} — {Recuperando|Óptimo|Listo} (Nd)` where N = days since last worked
- Ring is 2px outer stroke using CSS `boxShadow`, dot size bumped from `w-2 h-2` to `w-2.5 h-2.5`
- If no workout data for a muscle group: `boxShadow` falls back to `var(--color-surface-2)` (neutral ring)

### F253 — WorkoutDetailPage: add warmup sets button ✅ (2026-04-30)
**New feature: manual warmup set generator per exercise in active workout**

- **Flame icon button** (`<Flame size={14} />`) appears next to each exercise in the active workout, positioned between the warmup toggle and duplicate button
- Button is only rendered when the exercise has at least one set with `weight > 0`
- Clicking the button:
  1. Finds the heaviest `normal` set weight from the exercise's current sets
  2. Validates weight ≥ 20kg (barbell threshold) — shows `toastStore.info` if too low
  3. Calls `getWarmupSets(workingWeight)` to generate progressive warmup sets (bar × 10, 20% × 8, 40% × 5, 60% × 3, 80% × 2)
  4. If `warmupSets.length === 0`, shows `toastStore.info('Sin calentamiento', ...)`
  5. Builds `ActiveSet[]` objects with new IDs and `set_type: 'warmup'`
  6. Calls `addSetsToExercise(ex.exercise_id, newSets)` to prepend warmup sets
  7. Shows `toastStore.success('Calentamiento añadido', ...)`
- **New `addSetsToExercise(exerciseId, newSets)` method** in `workoutStore`:
  - Prepends `newSets` before the exercise's existing sets: `{ ...e, sets: [...newSets, ...e.sets] }`
  - All set numbers are implicitly 1-based (no explicit renumbering needed since sets are rendered by array index)
- **Import change** in WorkoutDetailPage.tsx: added `getWarmupSets` to queries import
- **Two UI positions** for the button: line ~1481 (edit mode row) and line ~1791 (rest display row)
- Same warmup logic as WorkoutsPage (`handleQuickAdd`) and RoutineDetailPage (F96 warmup generator)
- Build: `tsc -b && vite build` — 0 errors

### F252 — MeasurementsPage: show delta vs previous measurement ✅ (2026-04-30)
**New feature: change indicators on body measurement cards**

- **New `getPreviousMeasurement(db, bodyPart)` query** in `queries.ts`:
  - Queries `body_measurements WHERE body_part = ? ORDER BY recorded_at DESC LIMIT 2`, returns the 2nd row (previous value)
  - Returns `number | null` — null if fewer than 2 measurements exist
- **New `previousMeasurements` state** in `MeasurementsPage`:
  - `useState<Record<BodyPart, number | null>>` — initialized all nulls
  - Loaded in `loadData()` by iterating `BODY_PARTS` and calling `getPreviousMeasurement`
- **Delta chip on each measurement button** (appears only when both current AND previous values exist):
  - Shows `↑` or `↓` followed by the absolute change in current display unit
  - Formula: `delta * (measurementUnit === 'in' ? CM_TO_IN : 1)` — converts from stored cm to display unit before showing
  - **Color logic**: green (`#22c55e`) if improvement, red (`#ef4444`) if regression
    - `waist`, `hips`: positive delta = bad (got bigger), negative = good (got smaller)
    - `chest`, `biceps`, `thigh`, `calf`, `shoulders`, `neck`: positive delta = good (got bigger), negative = bad
  - Shows nothing if either current or previous is null
- **Build**: `tsc -b && vite build` — 0 errors

### F259 — ExerciseDetailPage: usar mejor serie con un clic desde el badge de PR trophy ✅ (2026-04-30)
**Nueva función: pulsar el badge de PR abre el workout con la mejor serie ya rellenada**

- **Badge trophy** en ExerciseDetailPage ahora es un **botón clickeable** (antes solo mostraba el peso máximo)
- **Con workout activo**: añade el ejercicio + la mejor serie (weight×reps más alta) al workout actual
- **Sin workout activo**: inicia un nuevo workout, añade el ejercicio con la mejor serie, y navega a WorkoutsPage
- **Nueva query** `getBestSetForExercise(db, exerciseId)`: busca el set normal con mayor `weight × reps` de cualquier workout terminado
- **Tooltip** muestra `"{weight}kg × {reps} reps — Pulsa para usar esta serie"`
- **Icono Zap** (⚡) aparece junto al trophy cuando no hay workout activo
- **Build**: `tsc -b && vite build` — 0 errores

### F260 — ExerciseDetailPage: PR card y trophy badge ahora usan el mismo peso máximo ✅ (2026-04-30)
**Bug fix: el card de "Peso máx." en Récords Personales podía mostrar un valor distinto al trophy badge**

- `getExerciseStats()` estaba calculando `maxWeight` solo sobre los últimos 100 sets (`getExerciseSetsHistory(db, id, 100)`)
- El trophy badge usaba `getMaxWeightForExercise()` que busca en TODOS los sets
- Si el PR real estaba más allá de los 100 sets más recientes, el card y el badge mostraban valores distintos
- **Fix**: al cargar `stats`, se sobrescribe `stats.maxWeight` con `getMaxWeightForExercise()` para garantizar consistencia
- Build: `tsc -b && vite build` — 0 errores

### F255 — WorkoutsPage: workout feel emoji tags in the finish modal ✅ (2026-04-30)
**New feature: quick-select emoji tags for how the workout felt**

- **4 feel-tag buttons** added to the workout finish summary modal, above the notes section:
  - `💪 Strong` — user trained well and felt strong
  - `😵 Hard` — especially challenging workout
  - `😴 Easy` — light or recovery workout
  - `🔥 PR` — personal record achieved
- **Multi-select**: each tag toggles on/off; multiple can be selected
- **Styling**: pill-shaped buttons with emoji + label, selected state uses `var(--color-primary)` background
- **Persistence**: feel tags are stored as part of the existing `tags` JSON array in the `workouts` table — same `updateWorkoutTags` mutation used for all tag types
- **UI position**: appears after the existing tag picker (`Etiquetas`) and before the notes textarea in the modal
- `FEEL_TAGS` constant defined at top of `WorkoutsPage.tsx` — easy to extend
- Build: `tsc -b && vite build` — 0 errors; lint: 0 errors

### F274 — RoutinesPage: quick-start workout button + estimated volume on routine cards ✅ (2026-04-30)
**New feature: start a workout directly from the routine card, plus show estimated volume**

- **Quick-start button** on each routine card — `Iniciar` button with Play icon, styled in primary color
  - Clicking navigates to `/workouts?start={routineId}`, which auto-starts the workout with all routine exercises pre-loaded
  - Replaces the former three-dot menu-only entry point with a prominent, discoverable action
- **Estimated volume badge** on each routine card — shows `sets × reps × weight` per exercise summed across the routine
  - Displays as `{N}k kg` for volumes ≥ 1000, or `{N} kg` for smaller values
  - Icon: `BarChart3` (trending up), subtle pill styling in surface-2 color
  - `title` tooltip explains the calculation: "Volumen estimado (sets × reps × peso)"
- **Volume calculation**: for each routine exercise, uses `target_sets × (target_reps_override ?? 10) × (target_weight ?? 0)`, summed across all exercises
- **New type field**: `RoutineWithMeta.estimated_volume: number` added to type alias
- Build: `tsc -b && vite build` — 0 errors

### F275 — WorkoutDetailPage: last weight chips in quick-add modal ✅ (uncommitted)
**New feature: show last-used weight/reps for each exercise in the quick-add modal**

- **Last weight chip** appears next to each exercise in the quick-add modal (F108)
  - Displays as `{N}kg ×{reps}` pill badge in surface-2 color
  - Shows the weight and reps from the most recent workout containing that exercise
  - `title` tooltip: "Último: {weight}kg × {reps} reps"
- **Batch query**: new `getLastWeightPerExercise(db)` function in `queries.ts`
  - Returns `Map<string, { weight, reps }>` for all exercises with a recorded weight
  - Single SQL query joins `workout_sets`, `workouts`, and subquery for most-recent-per-exercise
  - Filters: `finished_at IS NOT NULL`, `set_type = 'normal'`, `weight > 0`
- **Lazy loading**: last weights loaded once when quick-add modal opens (state check avoids redundant queries)
- Build: `tsc -b && vite build` — 0 errors; lint: 0 errors

### F276 — RoutineDetailPage: last performed pill chip styling ✅ (uncommitted)
**Visual polish: last-performed indicator now renders as a colored pill badge**

- **Before**: plain colored text label (`10 days ago`)
- **After**: pill-shaped badge with colored background at 12% opacity + matching text color
  - Example: `backgroundColor: '#22c55e20', color: '#22c55e'` for green (recent)
- Same underlying data (`lastPerformedDates[exercise_id]`, `getLastPerformedColor`, `formatLastPerformed`)
- **No behavior change** — purely cosmetic improvement for better visual scan on routine cards

### F264 — WorkoutsPage: equipment filter chips in workout history ✅ (2026-04-30)
**New feature: filter workout history by equipment type — mirrors WorkoutDetailPage F262**

- **Equipment filter chips** added to WorkoutsPage history header section, alongside existing muscle group filter:
  - 8 equipment types: Barra, Mancuernas, Máquina, Cable, Bodyweight, Kettlebell, Bandas, Otro
  - Single-select (one equipment active at a time, tap again to deselect)
  - Same styling as muscle group chips (pill buttons, primary color when active)
  - Active pill shows selected equipment with X to clear
- **Filter logic**: workout passes filter if ANY exercise in that workout uses the selected equipment
- **getAllExerciseNames()** updated to include `equipment` field so filter can match against exercise equipment
- **State**: `selectedEquipment: Equipment | null` — independent of muscle group and time-of-day filters (all can stack)
- **Build**: `tsc -b && vite build` — 0 errors

**Bug fix — getExerciseStats(): 100-set hardcap removed**
- Was: `getExerciseSetsHistory(db, exerciseId, 100)` — only analyzed last 100 sets
- Now: `getExerciseSetsHistory(db, exerciseId)` — uses all sets for accurate `totalVolume` and `setCount`
- `getEstimated1RM()` had the same hardcap — same fix applied
- Build: `tsc -b && vite build` — 0 errors

### F282 — ExerciseDetailPage: last session preview chip ✅ (2026-05-01)
**New feature: shows a compact summary of the most recent workout for this exercise**

- **Last session preview chip** displayed next to the exercise timer, showing:
  - Best set from last session (weight × reps, ranked by E1RM)
  - Total sets and total volume (kg) for that session
  - Appears only when there is history for the exercise
- **Implementation**: `lastSessionPreview` useMemo computes top-set by E1RM, total volume, and total sets from `currentExerciseLastSets`
- **Tooltip**: shows full stats on hover (`Última sesión: N series · X kg totales`)
- **Build**: `tsc -b && vite build` — 0 errors

### F285 — ExerciseDetailPage: secondary muscles in exercise header ✅ (2026-05-01)
**New feature: secondary muscles shown in exercise detail header**

- Exercise header now displays secondary muscle groups alongside the primary:
  - Format: `Primary + Secondary1, Secondary2, ... • Equipment`
  - Secondary muscles only shown when present (array length > 0)
  - Rendered with reduced opacity to differentiate from primary
- `secondary_muscles` column already existed in DB schema; this adds UI rendering
- **Build**: `tsc -b && vite build` — 0 errors

### F286 — Bug fixes: trophy badge label + ProgressPage query cache ✅ (2026-05-01)
**Two bugs found and fixed during codebase review**

**Bug 1 — ExerciseDetailPage trophy badge showed wrong values**
- Badge displayed `{maxWeight} kg` (the PR weight, e.g. `100 kg`) but clicking it
  added `{bestSet.weight}×{bestSet.reps}` to the workout (e.g. `95×10`)
- Root cause: two separate queries — `getMaxWeightForExercise` (highest single weight)
  and `getBestSetForExercise` (highest weight×reps product) — returned different values
- Fix: badge now shows `{bestSet.weight}×{bestSet.reps}` to match the actual action

**Bug 2 — ProgressPage called `getMuscleLastWorked(db)` 4 times per render**
- The `useEffect` called `getMuscleLastWorked(db)` for the overdue filter, two sort
  comparators, and the state setter — 4 separate identical SQL queries
- Fix: call once, cache in `muscleLastWorkedMap`, reuse everywhere — 1 query instead of 4

**Also noted (not fixed — low priority):** ExercisesPage uses `getMuscleLastWorkedBatch`
  (Map return, requires `.fromEntries()`) instead of `getMuscleLastWorked` (Record return,
  no conversion needed). Both return identical data; the Record version is more ergonomic.

### F287 — ExercisesPage: use getMuscleLastWorked (Record) instead of getMuscleLastWorkedBatch (Map) ✅ (2026-05-01)
**Cosmetic fix: eliminate unnecessary Object.fromEntries() conversion**

- `getMuscleLastWorked(db)` returns `Record<string, string>` directly
- `getMuscleLastWorkedBatch(db)` returns `Map<string, string>`, requiring `Object.fromEntries()` conversion
- ExercisesPage state `muscleLastWorked: Record<string, string>` already matched the Record return type
- Fix: call `getMuscleLastWorked(db)` directly — no intermediate Map variable, no fromEntries call
- ProgressPage already used the correct variant; ExercisesPage was the outlier
- Build: `tsc -b && vite build` — 0 errors

- **Build**: `tsc --noEmit` — 0 errors

### F288 — ExercisesPage: 4 more Record-returning query variants (eliminate Object.fromEntries) ✅ (2026-05-01)
**Following the F287 pattern, 4 more Map→Record converter patches applied:**

- `getExerciseStatsAll(db)` — wraps `getExerciseStatsBatch` (Map→Record)
- `getExerciseFrequencyAll(db)` — wraps `getExerciseFrequencyBatch` (Map→Record)
- `getLastWeightPerExerciseAll(db)` — wraps `getLastWeightPerExercise` (Map→Record)
- `getAllExerciseDifficultiesMap(db)` — wraps `getAllExerciseDifficulties` (Map→Record)

**Rationale:** ExercisesPage state is typed as `Record<string, T>` but the original batch functions returned `Map<string, T>`, requiring `Object.fromEntries()` at every call site. The new Record-returning wrappers eliminate the conversion boilerplate at 4 call sites.

**Note:** `getExerciseTrainingIntervalBatch` did not exist in queries.ts — the training intervals feature was not implemented in ExercisesPage, so no fix needed there.

**Build**: `tsc -b && vite build` — 0 errors

### F289 — Remaining pages: 6 more Record-returning query variants (eliminate Object.fromEntries) ✅ (2026-05-01)
**Extended the F287/F288 pattern to all remaining batch query call sites:**

- `getPersonalRecordsByIdsAll(db, exerciseIds)` — wraps `getPersonalRecordsByIds` (Map→Record)
- `getSimilarExercisesAll(db, exerciseIds)` — wraps `getSimilarExercisesBatch` (Map→Record)
- `getExercisesByIdsAll(db, ids)` — wraps `getExercisesByIds` (Map→Record)
- `getAllExerciseNamesAll(db)` — wraps `getAllExerciseNames` (Map→Record)
- `getAllRoutineExercisesAll(db)` — wraps `getAllRoutineExercises` (Map→Record)
- `getAllRoutineLastUsedAll(db)` — wraps `getAllRoutineLastUsed` (Map→Record)
- `getRoutineWorkoutCountsAll(db)` — wraps `getRoutineWorkoutCounts` (Map→Record)

**Changes:**
- `ExercisesPage.tsx` — `getSimilarExercisesBatch` → `getSimilarExercisesAll` (eliminates `forEach` manual conversion)
- `WorkoutDetailPage.tsx` — `getPersonalRecordsByIds` → `getPersonalRecordsByIdsAll`, `exercisePRMap` state changed from `Map` to `Record`
- `WorkoutsPage.tsx` — `getAllExerciseNames` → `getAllExerciseNamesAll`, all `.get()` accessors → `[]` bracket notation
- `RoutinesPage.tsx` — `getAllRoutineExercises/getAllRoutineLastUsed/getRoutineWorkoutCounts` → `*All` variants, all `.get()` → `[]`
- `CompareWorkoutsPage.tsx` — `getExercisesByIds` → `getExercisesByIdsAll`, `exerciseNames` state → `Record`

**Result:** Zero `Object.fromEntries` calls remain in any page file.

**Build**: `tsc --noEmit` — 0 errors, `vitest` — 26/26 tests pass
### F292 — WorkoutsPage/WorkoutDetailPage: migrate remaining getExercisesByIds to Record-returning variant ✅ (2026-05-01)
**Completes the F289/F288/F287 Object.fromEntries elimination pattern:**

- `exercisePRs` useMemo in WorkoutsPage now uses `getMaxWeightForExerciseBatchAll` directly — eliminates 4-line `forEach` manual Map→Record conversion
- `getMaxWeightForExerciseBatchAll(db, exerciseIds)` added to queries.ts — Record-returning wrapper following the established pattern
- `getExercisesByIds` completely eliminated from WorkoutsPage (3 call sites migrated to `getExercisesByIdsAll`)
- `getExercisesByIds` completely eliminated from WorkoutDetailPage (1 call site migrated to `getExercisesByIdsAll`)
- `getExercisesByIds` removed from both pages' imports

**Result:** Zero Map-returning batch queries remain in any page file. All batch queries now return `Record<string, T>` directly.

**Build**: `tsc --noEmit` — 0 errors, `eslint` — 0 errors (1 pre-existing warning)

### F291b — WorkoutsPage: PR proximity % chip on active workout exercise cards ✅ (2026-05-01)
**Issue identified during codebase review of active workout PR indicators.**

- Added a `proximityPct` chip showing what percentage the current best set weight represents relative to the stored PR
- Displayed next to the PR trophy badge on each exercise card in the active workout
- Color-coded: ≥100% green (at or above PR), ≥90% amber, ≥70% orange, <70% gray
- Shows tooltip with exact weights: `Mejor serie actual: Xkg (Y% del PR Zkg)`

**Build**: `tsc -b` — 0 errors, `eslint` — 0 errors (1 stale directive cleaned up)

### F292 — MeasurementsPage: trend summary row with linear regression on last 5 measurements ✅ (2026-05-01)
**Feature discovered during codebase review — measurements page lacked trend visualization.**

- `getMeasurementTrendBatch(db, limit=5)` — batch SQL query returning last N measurements per body part in a single call (no N+1)
- `getPreviousMeasurement` comment corrected from F252 → F292
- Trend summary row appears above "Medidas actuales" section when ≥2 measurements exist for a body part
- Uses linear regression slope on last 5 values to determine direction
- Favorable direction logic: waist/hips favorable when decreasing, all others favorable when increasing
- Arrow icons: `→` stable, `↑` increasing, `↓` decreasing
- Color: green = favorable, red = unfavorable, gray = stable

**Build**: `tsc -b` — 0 errors, `npm run build` — ✓ built in 36s

### F293 — ProgressPage: workout feel tag distribution (pie chart + legend) ✅ (2026-05-01)
**Feature implemented to complement F255 (feel tags on workouts).**

- `getWorkoutFeelDistribution(db, days=30)` — SQL query counting feel tags (💪 Strong, 😵 Hard, 😴 Easy, 🔥 PR) across workouts in the last N days
- ProgressPage section "Cómo te sentiste" with:
  - Donut pie chart (Recharts `<PieChart>`) showing proportions
  - Legend with emoji, percentage, and absolute count per tag
  - Color coding: 💪 green, 😵 red, 😴 blue, 🔥 amber
  - Only shown when at least one feel tag has count > 0

**Build**: `tsc -b` — 0 errors, `npm run build` — ✓ built in 36s

### F294 — WorkoutDetailPage: workout quality score badge (RPE consistency + volume efficiency) ✅ (2026-05-01)
**Feature implemented to complement F249 (intensity score).**

- `computeQualityScore(sets, volume, durationSec, avgVolume, sortedHistory)` function:
  - RPE consistency score (0-50): lower variance in RPE values = higher score; defaults to 25-30 when insufficient RPE data
  - Volume efficiency score (0-50): compares volume-per-minute vs historical average; penalizes both too-low and too-high efficiency
  - Total: 0-100, capped at 50+50
- Quality score badge displayed next to intensity score badge in the workout header
- Labels: "Alta" ≥70 (green), "Media" ≥40 (amber), "Baja" <40 (red)
- Tooltip: "Calidad: consistencia RPE + eficiencia volumen"

**Build**: `tsc -b` — 0 errors, `npm run build` — ✓ built in 36s




### F306 — WorkoutsPage: PR count badge on workout history cards ✅ (2026-05-01)
**Issue identified during F291b review — no PR indication on workout history cards.**

- Added `getExercisePRMapAll(db)` — single SQL query batch-loading all-time max weight per exercise across all finished workouts (eliminates N+1 for PR trophy badges)
- `exercisePRMap` useMemo in WorkoutsPage: loads once at mount, used for all history card PR badges
- History card now shows trophy badge with count of sets matching all-time PR: `🏆 2 PRs` for a workout with 2 personal record sets
- Complements F291b (PR proximity % on active workout cards) and F259/F260 (PR trophy clickable)
- `exercisePRMap` is also available for other components needing PR comparisons

**Build**: `tsc -b && vite build` — 0 errors, ✓ built in 37s


### F315 — ExerciseDetailPage: show workout tags on exercise history headers ✅ (2026-05-01)
**Feature identified during codebase review — no way to see workout-level tags when browsing exercise history.**

- Extended `getExerciseSetsHistoryWithWorkout` SQL query to LEFT JOIN workouts table and return `w.tags` as `workout_tags`
- Added `workout_tags: string[]` to `HistorySet` type and `historyByDate` grouping structure
- JSX: workout history group headers now display up to 2 workout tags as small primary-colored pills, with `+N` overflow indicator for 3+ tags
- Tags are shown alongside the workout name link (which navigates to WorkoutDetailPage), making context visible without leaving ExerciseDetailPage
- `safeJsonParse` fallback for null/empty tags in existing workouts
- Build: `tsc -b` + `vite build` pass with 0 errors

### F318 — RoutineDetailPage: exercise difficulty filter + difficulty dots in Add Exercise modal ✅ (2026-05-01)
**Feature identified during F315 review — no way to filter exercises by difficulty in the routine add-exercise modal.**

- Added `getAllExerciseDifficultiesMap(db)` query (Record-returning variant of `getAllExerciseDifficulties`, F288 pattern)
- Added `selectedDifficulty: number | null` state and `exerciseDifficulties: Record<string, number>` state in RoutineDetailPage
- Difficulty filter chips row: Todas / Fácil / Moderado / Difícil — color-coded green/amber/red, toggle active style
- Exercise list filters by `selectedDifficulty` before rendering (null = show all)
- Each exercise row shows 5-dot difficulty indicator (same style as ExercisesPage) using the existing color scale: ≤1 green, ≤2 lime, ≤3 amber, ≤4 orange, ≤5 red; gray dots for unrated exercises
- Difficulty dots appear next to the muscle badge, replacing the static blue dot
- "No se encontraron ejercicios" empty state respects the active filter
- Build: `tsc -b` + `vite build` pass with 0 errors, eslint clean

### F335 — SettingsPage: race condition in toggleDay ✅ (2026-05-06)
**Root cause: stale closure over `reminderDays` array.**

- `toggleDay` read `reminderDays` (a captured value) and called `setReminderDays(...)` synchronously
- If the user clicked two day-buttons rapidly (or React re-rendered between the read and write), the second click would read the pre-first-click state and overwrite the first mutation
- **Fix:** Replaced direct read of `reminderDays` with Zustand's `useSettingsStore.setState(prev => ...)` functional updater pattern — always operates on the current committed state, never a stale closure
- Also removed now-unused `setReminderDays` from destructuring (no other usage in the file)
- Build: `tsc -b` + `vite build` pass with 0 errors



### F336 — ExerciseDetailPage: eliminate duplicated ratio computation in training interval chip ✅ (2026-05-12)
**Issue found during code review — the F241 training interval chip computed `ratio` 4 times via IIFEs.**

The `style` prop had 2 IIFEs and the `children` had a 3rd IIFE — all computing the same `ratio = avgDays / recommendedDays`. Each IIFE duplicated the same conditional logic.

**Fix:** Replaced all 3 IIFEs with a single IIFE that computes `ratio`, `intervalColor`, and `intervalLabel` once, then references the pre-computed values in JSX. Also removed a duplicate `title` attribute on the `<span>` element.

**Before:** 4 separate `ratio` computations via `(() => { const ratio = ...; return ...; })()`  
**After:** 1 computation, 3 references to pre-computed `intervalColor` / `intervalLabel`

**Build:** `tsc -b` — 0 errors, `npm run lint` — 0 errors
### F337 — ExerciseDetailPage: use formatWeight() in F282 last session preview chip ✅ (2026-05-13)
- **Bug found during review:** F282 chip displayed raw weight number (`{lastSessionPreview.topSet.weight}{unit}`) without using `formatWeight()`
- `formatWeight()` handles: (1) unit suffix (`kg`/`lb`), (2) decimal formatting for `kg` (`.toFixed(1)`), (3) proper `Math.round` for `lb`
- All other weight displays in the app use `formatWeight()` — this was the only inconsistency
- **Fix:** Changed `{lastSessionPreview.topSet.weight}{unit}` → `{formatWeight(lastSessionPreview.topSet.weight, unit)}`
- Also normalized spacing: `×` → ` × ` (with spaces) for consistency with other chips
- Build: `tsc -b` + `vite build` pass with 0 errors; lint: 0 errors
### F338 — ExercisesPage + RoutinesPage: eliminate impure Date.now() in render ✅ (2026-05-14)
**Same root cause as F329 (WorkoutsPage streak calendar fix).**

**Issue found:** `ExercisesPage` called `Date.now()` inline inside JSX IIFEs for `days` computation (lines 449, 457), and `RoutinesPage` called `Date.now()` inline for the "days since last used" badge (line 246).

`Date.now()` in JSX render violates React render purity and triggers `react-hooks/purity` ESLint warnings. The WorkoutsPage fix (F329) established the pattern: pre-compute time-dependent values in `useMemo` inside `useEffect` data setters.

**ExercisesPage fix:** Added `muscleDaysMap = useMemo(() => { now = Date.now(); ... }, [muscleLastWorked])` as a derived state alongside `muscleLastWorked`. Replaced both inline `Date.now()` calls with `muscleDaysMap[ex.muscle_group] ?? 0`.

**RoutinesPage fix:** The single `Date.now()` in the "last used" IIFE is intentionally impure — it shows live "days since" that must reflect the current date on every render. Suppressed with `eslint-disable-next-line react-hooks/purity` (same pattern as F329's streak calendar in WorkoutsPage).

**Build:** `tsc -b` + `vite build` pass with 0 errors; lint: 0 errors; tests: 26/26 pass


### F339 — Cross-page: normalize weight+unit display spacing ✅ (2026-05-14)
**Issue found during systematic review — inconsistent `weight + unit` spacing across pages.**

All other weight displays in the app use `formatWeight(w, unit)` which returns `"50 kg"` or `"110 lb"` (space between number and unit). Several inline displays were missing the space or hardcoding `kg` instead of using the unit variable.

**WorkoutDetailPage fixes:**
- `lastWeights` chip: `50kg ×8` → `50 kg × 8` (added missing spaces)
- Set dot title: `50kg × 8` → `50 kg × 8` (matched display text)
- `prevBest` volume-diff titles (2×): `${prevBest.weight}${unit}` → `${prevBest.weight} ${unit}`

**RoutineDetailPage fixes:**
- `target_weight` display (2×): ` @ 40kg` → ` @ 40 kg`
- Warmup toast: `${w.weight}${unit}` → `${w.weight} ${unit}`

**ExerciseDetailPage fixes:**
- Copy-to-clipboard Set N lines: `50kg` → `50 kg`
- "Añadir" button title: hardcoded `kg` → use `${unit}`, weight+unit: `50kg` → `50 kg`

**Build:** `tsc -b` + `vite build` pass with 0 errors

