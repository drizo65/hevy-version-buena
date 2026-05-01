# HEVY App — Plan de Implementación de 14 Nuevas Funcionalidades

## Arquitectura Actual (referencia)

- **Stack**: React + Vite + TypeScript + Tailwind CSS + SQLite (sql.js vía localStorage) + Zustand
- **Persistencia**: localStorage (`hevy_db`), binary encoding con auto-save cada 2s
- **Estado**: Zustand stores (workoutStore, exerciseStore, settingsStore)
- **Rutas**: React Router ( WorkoutsPage, ExerciseDetailPage, ExerciseProgressPage, ProgressPage, RoutinesPage, RoutineDetailPage, SettingsPage)
- **UI**: Dark mode por defecto, diseño minimalista con acentos amarillos
- **BD**: 7 tablas (exercises, routines, routine_exercises, workouts, workout_sets, workout_exercises, personal_records, body_weight)

---

## FUNCIONALIDAD 1: 1RM Estimado por Ejercicio

### Estado actual
- `getMaxWeightForExercise` retorna el peso máximo
- `getExerciseStats` retorna { maxWeight, totalVolume, setCount }
- No se calcula 1RM en ningún sitio

### Implementación
**Ficheros a tocar**: `src/pages/ExerciseDetailPage.tsx`, `src/pages/ExerciseProgressPage.tsx`, `src/database/queries.ts`

**Fórmula Epley**: `1RM = weight × (1 + reps / 30)`

Añadir helper function en queries.ts:
```typescript
export function calculate1RM(weight: number, reps: number): number {
  if (reps === 1) return weight;
  if (reps <= 0 || weight <= 0) return 0;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}
```

Para 1RM más preciso, usar la fórmula de Brzycki también y promediar:
```typescript
export function calculate1RM(weight: number, reps: number): number {
  if (reps === 1) return weight;
  if (reps >= 12) reps = 12; // Limitar reps para evitar estimaciones absurdas
  const epley = weight * (1 + reps / 30);
  const brzycki = weight * (36 / (37 - reps));
  return Math.round(((epley + brzycki) / 2) * 10) / 10;
}
```

**ExerciseDetailPage.tsx**: En la sección de PR cards (líneas 114-148), añadir una card adicional:
```tsx
<div className="p-3 rounded-xl text-center" style={{ backgroundColor: 'var(--color-surface)' }}>
  <Trophy size={16} className="mx-auto mb-1" style={{ color: 'var(--color-primary)' }} />
  <p className="text-lg font-bold">{estimated1RM} kg</p>
  <p className="text-xs" style={{ color: 'var(--color-text-2)' }}>1RM estimado</p>
</div>
```

**ExerciseProgressPage.tsx**: En la sección PR cards, añadir 1RM estimado usando el set con más peso y sus reps.

---

## FUNCIONALIDAD 2: Duración Visible en Historial de Workouts

### Estado actual
- `duration_seconds` existe en la BD y en el tipo `Workout`
- `WorkoutDetailPage` ya muestra la duración en el header (línea 295)
- **Falta**: mostrar duración en cada card del historial en `WorkoutsPage`

### Implementación
**Ficheros a tocar**: `src/pages/WorkoutsPage.tsx`

En el render de las cards de workout completado ( WorkoutsPage.tsx, hacia las primeras líneas del return), añadir duración:

```tsx
{workout.finished_at && (
  <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-text-2)' }}>
    <Clock size={10} />
    <span>{formatDuration(
      workout.duration_seconds ||
      Math.floor((new Date(workout.finished_at).getTime() - new Date(workout.started_at).getTime()) / 1000)
    )}</span>
  </div>
)}
```

También añadir la duración en WorkoutsPage al lado del nombre del workout en el modal de "End Workout".

---

## FUNCIONALIDAD 3: Notas del Workout Post-Finish

### Estado actual
- `WorkoutDetailPage` YA tiene UI para editar notas (líneas 302-330)
- El workout es consultable por ID después de terminado
- **Verificado**: funciona correctamente

### Conclusión
**Esta funcionalidad YA EXISTE.** No hay que implementar nada.

---

## FUNCIONALIDAD 4: Panel de PRs Global + Auto-fill

### Estado actual
- Tabla `personal_records` existe en BD (init.ts línea 124)
- Tipo `PersonalRecord` existe (types.ts línea 82)
- Query `getPersonalRecords` existe (queries.ts línea 197) pero nunca se llama desde ninguna página
- La tabla NUNCA se llena automáticamente

### Implementación
**Ficheros a tocar**: `src/database/mutations.ts`, `src/pages/ProgressPage.tsx`, `src/pages/ExerciseDetailPage.tsx`

**Paso 1**: Añadir función para detectar y guardar PRs en `mutations.ts`:

```typescript
export function checkAndSavePRs(db: any, workoutId: string) {
  // Para cada ejercicio del workout, comparar con PRs existentes
  // Tipos: 'max_weight', 'max_volume', 'max_reps'
  const sets = getWorkoutSets(db, workoutId);
  const byExercise = new Map<string, typeof sets>();
  for (const s of sets) {
    if (!byExercise.has(s.exercise_id)) byExercise.set(s.exercise_id, []);
    byExercise.get(s.exercise_id)!.push(s);
  }

  for (const [exerciseId, exSets] of byExercise) {
    const maxWeight = Math.max(...exSets.filter(s => s.weight > 0).map(s => s.weight));
    const maxReps = Math.max(...exSets.map(s => s.reps));
    const totalVolume = exSets.reduce((acc, s) => acc + s.weight * s.reps, 0);

    // Obtener PRs actuales
    const existing = getPersonalRecords(db, exerciseId);
    const prMaxWeight = existing.find(p => p.type === 'max_weight');
    const prMaxVolume = existing.find(p => p.type === 'max_volume');
    const prMaxReps = existing.find(p => p.type === 'max_reps');

    const now = new Date().toISOString();

    if (!prMaxWeight || maxWeight > prMaxWeight.value) {
      const id = generateId();
      if (prMaxWeight) {
        db.run('UPDATE personal_records SET value=?, achieved_at=?, workout_id=? WHERE id=?',
          [maxWeight, now, workoutId, prMaxWeight.id]);
      } else {
        db.run('INSERT INTO personal_records (id, exercise_id, type, value, achieved_at, workout_id) VALUES (?,?,?,?,?,?)',
          [id, exerciseId, 'max_weight', maxWeight, now, workoutId]);
      }
    }
    // ... similar para max_volume y max_reps
  }
}
```

**Paso 2**: Llamar `checkAndSavePRs` en `saveWorkout` de `mutations.ts` después de guardar las series.

**Paso 3**: Añadir sección "Récords Personales" en `ProgressPage.tsx`:
- Card que muestra todos los PRs agrupados por ejercicio
- Cada PR muestra: ejercicio, tipo, valor, fecha
- Botón para ir a ExerciseProgressPage de ese ejercicio

---

## FUNCIONALIDAD 5: Heatmap de Músculos Visual

### Estado actual
- `getMuscleVolumeMap` retorna datos de volumen por músculo (30 días)
- ProgressPage muestra barras horizontales (líneas 278-305)
- No hay representación visual de heatmap

### Implementación
**Ficheros a tocar**: `src/pages/ProgressPage.tsx`

Reemplazar las barras de volumen por un grid de muscle groups con color según volumen relativo:

```tsx
{/* Muscle Heatmap */}
<div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
  <h3 className="text-sm font-semibold mb-3">Mapa muscular (30 días)</h3>
  <div className="grid grid-cols-4 gap-2">
    {muscleVolume.map(({ muscle, volume }) => {
      const max = Math.max(...muscleVolume.map(m => m.volume));
      const intensity = max > 0 ? volume / max : 0; // 0-1
      const bg = intensity > 0.7 ? 'var(--color-primary)'
        : intensity > 0.4 ? '#3d2a00aa'
        : intensity > 0 ? '#3d2a0066'
        : 'var(--color-surface-2)';
      return (
        <div key={muscle} className="p-2 rounded-lg text-center" style={{ backgroundColor: bg }}>
          <p className="text-xs font-medium capitalize" style={{ color: intensity > 0.4 ? '#000' : 'var(--color-text-2)' }}>
            {muscle.replace('_', '\n')}
          </p>
          <p className="text-[10px]" style={{ color: intensity > 0.4 ? '#000' : 'var(--color-text-2)', opacity: 0.7 }}>
            {(volume/1000).toFixed(1)}k
          </p>
        </div>
      );
    })}
  </div>
</div>
```

Alternativa más visual: usar un SVG de cuerpo humano y colorear las zonas. Pero esto requiere más trabajo de diseño.

---

## FUNCIONALIDAD 6: Tags para Workouts

### Estado actual
- workouts tienen `notes` pero no `tags`
- No hay sistema de categorización

### Implementación
**Ficheros a tocar**: `src/database/init.ts`, `src/database/mutations.ts`, `src/pages/WorkoutsPage.tsx`, `src/types.ts`

**Paso 1**: Añadir columna a la tabla:
```sql
ALTER TABLE workouts ADD COLUMN tags TEXT DEFAULT '[]';
```

**Paso 2**: En WorkoutsPage, cuando se termina un workout (modal de finish), permitir seleccionar tags:
```typescript
const workoutTags = ['piernas', 'upper body', 'full body', 'cardio', 'stretch'];
// UI: botones de tags seleccionables
```

**Paso 3**: En el historial de workouts, filtrar por tag:
```typescript
const [filterTag, setFilterTag] = useState<string | null>(null);
// Mostrar filtro de tags encima de la lista
```

**Paso 4**: Añadir TagsBadge component para mostrar tags en cards.

---

## FUNCIONALIDAD 7: Mediciones Corporales (Perímetros)

### Estado actual
- Solo existe `body_weight` para peso corporal
- No hay tabla de mediciones por zona

### Implementación
**Ficheros a tocar**: `src/database/init.ts`, `src/database/mutations.ts`, `src/database/queries.ts`, nueva página `MeasurementsPage.tsx`

**Paso 1**: Crear tabla `body_measurements`:
```sql
CREATE TABLE IF NOT EXISTS body_measurements (
  id TEXT PRIMARY KEY,
  body_part TEXT NOT NULL, -- 'neck', 'shoulders', 'chest', 'biceps', 'forearms', 'waist', 'hips', 'thighs', 'calves'
  value REAL NOT NULL,
  recorded_at TEXT NOT NULL
);
```

**Paso 2**: Añadir queries y mutations para mediciones.

**Paso 3**: Crear `MeasurementsPage.tsx`:
- Lista de partes del cuerpo con su última medición
- Botón + para añadir nueva medición
- Historial por parte del cuerpo
- Gráfico de evolución por zona (recharts)

**Paso 4**: Añadir ruta en App.tsx y link en BottomNav.

---

## FUNCIONALIDAD 8: Quick-add Inline en Workout

### Estado actual
- Para añadir ejercicio hay que ir a ExercisesPage, buscar, volver
- No hay búsqueda inline en la página de workout

### Implementación
**Ficheros a tocar**: `src/pages/WorkoutsPage.tsx`

En la sección "Añade ejercicios" ( WorkoutsPage), sustituir el botón "Copiar" por un input con autocompletado:

```tsx
{/* Quick add search */}
<div className="relative">
  <input
    type="text"
    value={quickAddSearch}
    onChange={e => {
      setQuickAddSearch(e.target.value);
      if (e.target.value.length >= 2) {
        const results = searchExercises(db, e.target.value);
        setQuickAddResults(results.slice(0, 8));
      } else {
        setQuickAddResults([]);
      }
    }}
    placeholder="Buscar ejercicio..."
    className="w-full rounded-lg px-3 py-2 text-sm"
    style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
  />
  {quickAddResults.length > 0 && (
    <div className="absolute z-10 w-full mt-1 rounded-lg overflow-hidden" style={{ backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
      {quickAddResults.map(ex => (
        <button key={ex.id} onClick={() => {
          addExerciseToWorkout(ex.id, ex.name);
          setQuickAddSearch('');
          setQuickAddResults([]);
        }} className="w-full text-left px-3 py-2 text-sm hover:opacity-80" style={{ borderBottom: '1px solid var(--color-border)' }}>
          {ex.name}
        </button>
      ))}
    </div>
  )}
</div>
```

---

## FUNCIONALIDAD 9: Análisis de Tiempo de Descanso

### Estado actual
- RestTimer existe y hace tickdown
- No se guarda el tiempo de descanso por serie

### Implementación
**Ficheros a tocar**: `src/database/init.ts`, `src/database/mutations.ts`, `src/database/queries.ts`, `src/store/workoutStore.ts`, `src/pages/WorkoutsPage.tsx`, `src/pages/ProgressPage.tsx`

**Paso 1**: Añadir columna a `workout_sets`:
```sql
ALTER TABLE workout_sets ADD COLUMN rest_time INTEGER;
```

**Paso 2**: En `workoutStore.ts`, guardar tiempo de descanso cuando se completa una serie:
```typescript
completeSet: (exerciseId, setId) => {
  // ... existing code to mark complete
  const restTime = get().restTimeRemaining; // tiempo que quedaba cuando completó
  // guardar en el set
  updateSet(exerciseId, setId, { rest_time: get().restDuration - restTime });
  get().startRest();
}
```

**Paso 3**: Query para proedio de descanso:
```typescript
export function getAverageRestTime(db: any, workoutId: string): number {
  const result = db.exec(`SELECT AVG(rest_time) FROM workout_sets WHERE workout_id = ? AND rest_time IS NOT NULL`, [workoutId]);
  return result[0]?.values[0]?.[0] || 0;
}
```

**Paso 4**: Mostrar en WorkoutDetailPage y ProgressPage como estadística.

---

## FUNCIONALIDAD 10: Comparar Workouts

### Estado actual
- No existe funcionalidad de comparación

### Implementación
**Ficheros a tocar**: nueva página o modal en `src/pages/WorkoutDetailPage.tsx`

Crear componente `WorkoutCompareModal`:
- Selector de workouts del mismo nombre
- Side-by-side: ejercicios, volúmenes por ejercicio, duraciones
- Diferencia en % entre workouts

```tsx
function WorkoutCompareModal({ workoutId, workoutName, onClose }) {
  const [compareTo, setCompareTo] = useState<Workout | null>(null);
  const [candidates, setCandidates] = useState<Workout[]>([]);
  // ...
  // Mostrar tabla comparativa
}
```

Se accede desde WorkoutDetailPage con botón "Comparar".

---

## FUNCIONALIDAD 11: Recordatorios / Notificaciones

### Estado actual
- No existe sistema de notificaciones

### Implementación
**Ficheros a tocar**: `src/pages/SettingsPage.tsx`, `src/store/settingsStore.ts`, `src/store/settingsStore.ts`

**Paso 1**: Añadir en settingsStore:
```typescript
reminderEnabled: boolean;
reminderDays: number[]; // [1,3,5] = lun, mie, vie
reminderTime: string; // "09:00"
```

**Paso 2**: En SettingsPage, añadir sección:
```tsx
<div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
  <h3 className="text-sm font-semibold mb-3">Recordatorios</h3>
  <label className="flex items-center gap-2">
    <input type="checkbox" checked={reminderEnabled} onChange={e => setReminderEnabled(e.target.checked)} />
    <span className="text-sm">Activar recordatorios</span>
  </label>
  {reminderEnabled && (
    <div className="mt-2 space-y-2">
      <p className="text-xs" style={{ color: 'var(--color-text-2)' }}>Días:</p>
      <div className="flex gap-1">
        {['L','M','X','J','V','S','D'].map((d,i) => (
          <button key={i} onClick={() => toggleDay(i)}
            style={{ backgroundColor: reminderDays.includes(i) ? 'var(--color-primary)' : 'var(--color-surface-2)', color: reminderDays.includes(i) ? '#000' : 'var(--color-text-2)' }}
            className="w-8 h-8 rounded-full text-xs font-bold">{d}</button>
        ))}
      </div>
      <input type="time" value={reminderTime} onChange={e => setReminderTime(e.target.value)} />
    </div>
  )}
</div>
```

**Paso 3**: Implementar scheduling con `setInterval` que comprueba cada minuto si debe mostrar notificación (solo funciona si el usuario ha dado permisos de Notification API).

---

## FUNCIONALIDAD 12: Variaciones de Ejercicios

### Estado actual
- No hay sugerencia de ejercicios relacionados

### Implementación
**Ficheros a tocar**: `src/pages/ExerciseDetailPage.tsx`

En ExerciseDetailPage, después de la sección de PRs, añadir sección "Variaciones":

```tsx
<div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
  <h3 className="text-sm font-semibold mb-3">Variaciones</h3>
  {(() => {
    const sameMuscle = exercises.filter(ex =>
      ex.muscle_group === exercise.muscle_group && ex.id !== exercise.id
    ).slice(0, 4);
    const sameEquipment = exercises.filter(ex =>
      ex.equipment === exercise.equipment && ex.id !== exercise.id && ex.muscle_group !== exercise.muscle_group
    ).slice(0, 4);
    return (
      <div className="space-y-3">
        {sameMuscle.length > 0 && (
          <div>
            <p className="text-xs mb-1" style={{ color: 'var(--color-text-2)' }}>Mismo músculo</p>
            <div className="flex gap-2 flex-wrap">
              {sameMuscle.map(ex => (
                <button key={ex.id} onClick={() => navigate(`/exercise/${ex.id}`)}
                  className="px-2 py-1 rounded text-xs" style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)' }}>
                  {ex.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  })()}
</div>
```

---

## FUNCIONALIDAD 13: Gráfico de Peso Corporal

### Estado actual
- `getBodyWeightHistory` retorna datos
- ProgressPage solo muestra lista de valores (líneas 215-240)
- No hay chart

### Implementación
**Ficheros a tocar**: `src/pages/ProgressPage.tsx`

Usando recharts (ya importado en ExerciseProgressPage):

```tsx
<ResponsiveContainer width="100%" height={120}>
  <LineChart data={bodyWeightHistory.slice(0, 30).reverse()} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
    <XAxis
      dataKey="recorded_at"
      tickFormatter={d => format(new Date(d), 'd/M')}
      tick={{ fontSize: 10, fill: 'var(--color-text-2)' }}
      interval="preserveStartEnd"
    />
    <YAxis
      tick={{ fontSize: 10, fill: 'var(--color-text-2)' }}
      domain={['dataMin - 2', 'dataMax + 2']}
    />
    <Tooltip
      contentStyle={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px', fontSize: 12 }}
      labelFormatter={d => format(new Date(d), 'd MMM')}
      formatter={(v: any) => [`${v} kg`, 'Peso']}
    />
    <Line
      type="monotone"
      dataKey="weight"
      stroke="var(--color-primary)"
      strokeWidth={2}
      dot={{ r: 2, fill: 'var(--color-primary)' }}
    />
  </LineChart>
</ResponsiveContainer>
```

Sustituir la lista simple de pesos por el chart + lista abajo.

---

## FUNCIONALIDAD 14: Ordenar Historial de Workouts

### Estado actual
- WorkoutsPage muestra historial por fecha desc
- No hay opción de ordenar

### Implementación
**Ficheros a tocar**: `src/pages/WorkoutsPage.tsx`

Añadir selector de ordenación:

```tsx
const [sortBy, setSortBy] = useState<'date' | 'duration' | 'volume'>('date');

// En la query de workouts, aplicar sort:
const sortedHistory = [...workoutHistory].sort((a, b) => {
  if (sortBy === 'date') return new Date(b.started_at).getTime() - new Date(a.started_at).getTime();
  if (sortBy === 'duration') return (b.duration_seconds || 0) - (a.duration_seconds || 0);
  if (sortBy === 'volume') {
    const volA = getWorkoutSets(db, a.id).reduce((acc, s) => acc + s.weight * s.reps, 0);
    const volB = getWorkoutSets(db, b.id).reduce((acc, s) => acc + s.weight * s.reps, 0);
    return volB - volA;
  }
  return 0;
});
```

UI: Añadir un `<select>` o botones de ordenación encima de la lista de workouts.

---

## Resumen de dependencias entre funcionalidades

```
F1 (1RM) ──────────────► ExerciseDetailPage
                        ExerciseProgressPage
                        queries.ts (helper)

F2 (Duración visible) ──► WorkoutsPage.tsx

F3 (Notas post-finish) ─► ✅ YA EXISTE

F4 (PRs global) ───────► mutations.ts (checkAndSavePRs)
                        ProgressPage.tsx (PRs section)
                        mutations.ts (llamar en saveWorkout)

F5 (Heatmap músculos) ─► ProgressPage.tsx

F6 (Tags workouts) ────► init.ts (ALTER TABLE)
                        mutations.ts (tag handling)
                        WorkoutsPage.tsx (tag UI)

F7 (Mediciones) ───────► init.ts (body_measurements)
                        mutations.ts
                        queries.ts
                        MeasurementsPage.tsx (NEW)
                        App.tsx (ruta)
                        BottomNav.tsx

F8 (Quick-add) ─────────► WorkoutsPage.tsx

F9 (Rest time) ─────────► init.ts (ALTER TABLE)
                        workoutStore.ts
                        mutations.ts
                        queries.ts
                        ProgressPage.tsx

F10 (Comparar) ─────────► WorkoutDetailPage (modal)
                        queries.ts (helper)

F11 (Notificaciones) ───► SettingsPage.tsx
                        settingsStore.ts

F12 (Variaciones) ──────► ExerciseDetailPage.tsx

F13 (Gráfico peso) ─────► ProgressPage.tsx

F14 (Ordenar) ──────────► WorkoutsPage.tsx
```

## Orden recomendado de implementación

1. F2 (trivial, 5 min) → F3 (ya existe) → F13 (trivial) → F14 (15 min)
2. F1 (1RM, 30 min)
3. F8 (Quick-add, 45 min)
4. F5 (Heatmap, 30 min)
5. F6 (Tags, 45 min)
6. F4 (PRs, 60 min)
7. F9 (Rest time, 45 min)
8. F7 (Mediciones, 90 min)
9. F10 (Comparar, 60 min)
10. F11 (Notificaciones, 45 min)
11. F12 (Variaciones, 30 min)
