/* eslint-disable @typescript-eslint/no-explicit-any */
// Todas las queries SQL de la aplicación

import type { Exercise, Routine, Workout, WorkoutSet, PersonalRecord, RoutineExercise, Equipment } from '../types';
import { getISOWeek } from 'date-fns';

function safeJsonParse<T>(val: string | null | undefined, fallback: T): T {
  if (!val) return fallback;
  try { return JSON.parse(val); } catch { return fallback; }
}

export function getAllExercises(db: any): Exercise[] {
  const stmt = db.prepare('SELECT * FROM exercises ORDER BY name');
  const rows: any[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows.map(r => ({
    ...r,
    secondary_muscles: safeJsonParse(r.secondary_muscles, []),
    is_custom: Boolean(r.is_custom),
    is_favorite: Boolean(r.is_favorite),
  })) as Exercise[];
}

export function getExercisesByMuscle(db: any, muscle: string): Exercise[] {
  const stmt = db.prepare('SELECT * FROM exercises WHERE muscle_group = ? ORDER BY name');
  stmt.bind([muscle]);
  const rows: any[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows.map(r => ({ ...r, secondary_muscles: safeJsonParse(r.secondary_muscles, []), is_custom: Boolean(r.is_custom), is_favorite: Boolean(r.is_favorite) })) as Exercise[];
}

export function searchExercises(db: any, query: string): Exercise[] {
  const q = `%${query}%`;
  const stmt = db.prepare('SELECT * FROM exercises WHERE name LIKE ? OR muscle_group LIKE ? ORDER BY name LIMIT 50');
  stmt.bind([q, q]);
  const rows: any[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows.map(r => ({ ...r, secondary_muscles: safeJsonParse(r.secondary_muscles, []), is_custom: Boolean(r.is_custom), is_favorite: Boolean(r.is_favorite) })) as Exercise[];
}

export function getExerciseById(db: any, id: string): Exercise | null {
  const stmt = db.prepare('SELECT * FROM exercises WHERE id = ?');
  stmt.bind([id]);
  if (!stmt.step()) { stmt.free(); return null; }
  const r = stmt.getAsObject();
  stmt.free();
  return { ...r, secondary_muscles: safeJsonParse(r.secondary_muscles, []), is_custom: Boolean(r.is_custom), is_favorite: Boolean(r.is_favorite) } as Exercise;
}

// F161 — Batch query to avoid N+1 in CompareWorkoutsPage and WorkoutDetailPage
export function getExercisesByIds(db: any, ids: string[]): Map<string, { name: string; muscle_group: string }> {
  const result = new Map<string, { name: string; muscle_group: string }>();
  if (!ids.length) return result;
  const placeholders = ids.map(() => '?').join(',');
  const stmt = db.prepare(`SELECT id, name, muscle_group FROM exercises WHERE id IN (${placeholders})`);
  stmt.bind(ids);
  while (stmt.step()) {
    const row = stmt.getAsObject() as { id: string; name: string; muscle_group: string };
    result.set(row.id, { name: row.name, muscle_group: row.muscle_group });
  }
  stmt.free();
  return result;
}

// F289 — Record-returning variant of getExercisesByIds
export function getExercisesByIdsAll(db: any, ids: string[]): Record<string, { name: string; muscle_group: string }> {
  const m = getExercisesByIds(db, ids);
  const r: Record<string, { name: string; muscle_group: string }> = {};
  m.forEach((v: any, k: any) => { r[k] = v; });
  return r;
}

// F173 — Lightweight batch: all exercise names for volume breakdown in history cards
export function getAllExerciseNames(db: any): Map<string, { name: string; muscle_group: string; equipment: Equipment }> {
  const result = new Map<string, { name: string; muscle_group: string; equipment: Equipment }>();
  const stmt = db.prepare('SELECT id, name, muscle_group, equipment FROM exercises');
  while (stmt.step()) {
    const row = stmt.getAsObject() as { id: string; name: string; muscle_group: string; equipment: Equipment };
    result.set(row.id, { name: row.name, muscle_group: row.muscle_group, equipment: row.equipment });
  }
  stmt.free();
  return result;
}

// F289 — Record-returning variant of getAllExerciseNames
export function getAllExerciseNamesAll(db: any): Record<string, { name: string; muscle_group: string; equipment: Equipment }> {
  const m = getAllExerciseNames(db);
  const r: Record<string, { name: string; muscle_group: string; equipment: Equipment }> = {};
  m.forEach((v: any, k: any) => { r[k] = v; });
  return r;
}

// Routines
export function getAllRoutines(db: any): Routine[] {
  const stmt = db.prepare('SELECT * FROM routines ORDER BY updated_at DESC');
  const rows: any[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows as Routine[];
}

export function getRoutineById(db: any, id: string): Routine | null {
  const stmt = db.prepare('SELECT * FROM routines WHERE id = ?');
  stmt.bind([id]);
  if (!stmt.step()) { stmt.free(); return null; }
  const r = stmt.getAsObject();
  stmt.free();
  return r as Routine;
}

// F149 — Find the most recent workout that was started from a given routine
export function getLastRoutineUsage(db: any, routineId: string): string | null {
  const stmt = db.prepare('SELECT started_at FROM workouts WHERE routine_id = ? ORDER BY started_at DESC LIMIT 1');
  stmt.bind([routineId]);
  if (!stmt.step()) { stmt.free(); return null; }
  const r = stmt.getAsObject() as { started_at: string };
  stmt.free();
  return r.started_at || null;
}

// F149 — Batch version: get last_used for all routines in one query
export function getAllRoutineLastUsed(db: any): Map<string, string | null> {
  const result = new Map<string, string | null>();
  const stmt = db.prepare(`
    SELECT w.routine_id, MAX(w.started_at) as last_used
    FROM workouts w
    WHERE w.routine_id IS NOT NULL
    GROUP BY w.routine_id
  `);
  while (stmt.step()) {
    const r = stmt.getAsObject() as { routine_id: string; last_used: string };
    result.set(r.routine_id, r.last_used || null);
  }
  stmt.free();
  return result;
}

// F289 — Record-returning variant of getAllRoutineLastUsed
export function getAllRoutineLastUsedAll(db: any): Record<string, string | null> {
  const m = getAllRoutineLastUsed(db);
  const r: Record<string, string | null> = {};
  m.forEach((v: any, k: any) => { r[k] = v; });
  return r;
}

// F165 — Batch workout count per routine
export function getRoutineWorkoutCounts(db: any): Map<string, number> {
  const result = new Map<string, number>();
  const stmt = db.prepare(`
    SELECT w.routine_id, COUNT(*) as count
    FROM workouts w
    WHERE w.routine_id IS NOT NULL AND w.finished_at IS NOT NULL
    GROUP BY w.routine_id
  `);
  while (stmt.step()) {
    const r = stmt.getAsObject() as { routine_id: string; count: number };
    result.set(r.routine_id, r.count);
  }
  stmt.free();
  return result;
}

// F289 — Record-returning variant of getRoutineWorkoutCounts
export function getRoutineWorkoutCountsAll(db: any): Record<string, number> {
  const m = getRoutineWorkoutCounts(db);
  const r: Record<string, number> = {};
  m.forEach((v: any, k: any) => { r[k] = v; });
  return r;
}

export function getRoutineExercises(db: any, routineId: string): RoutineExercise[] {
  const stmt = db.prepare(`
    SELECT re.*, e.name as exercise_name, e.muscle_group as muscle_group
    FROM routine_exercises re
    JOIN exercises e ON e.id = re.exercise_id
    WHERE re.routine_id = ?
    ORDER BY re.order_index
  `);
  stmt.bind([routineId]);
  const rows: RoutineExercise[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject() as RoutineExercise);
  stmt.free();
  return rows;
}

// Batch version: fetch exercises for ALL routines in a single query
// Fixes N+1 query pattern in RoutinesPage (was calling getRoutineExercises per routine)
export function getAllRoutineExercises(db: any): Map<string, RoutineExercise[]> {
  const stmt = db.prepare(`
    SELECT re.routine_id, re.*, e.name as exercise_name, e.muscle_group as muscle_group
    FROM routine_exercises re
    JOIN exercises e ON e.id = re.exercise_id
    ORDER BY re.order_index
  `);
  const result = new Map<string, RoutineExercise[]>();
  while (stmt.step()) {
    const row = stmt.getAsObject() as { routine_id: string; order_index: number; exercise_id: string; exercise_name: string; muscle_group: string; target_sets?: number; target_reps?: number; target_rpe?: number; rest_seconds?: number; notes: string };
    const routineId = row.routine_id;
    if (!result.has(routineId)) result.set(routineId, []);
    result.get(routineId)!.push(row as unknown as RoutineExercise);
  }
  stmt.free();
  return result;
}

// F289 — Record-returning variant of getAllRoutineExercises
export function getAllRoutineExercisesAll(db: any): Record<string, RoutineExercise[]> {
  const m = getAllRoutineExercises(db);
  const r: Record<string, RoutineExercise[]> = {};
  m.forEach((v: any, k: any) => { r[k] = v; });
  return r;
}

// F77 — Get target_rpe for a specific exercise in a given routine
export function getExerciseTargetRPE(db: any, routineId: string, exerciseId: string): number | null {
  const stmt = db.prepare('SELECT target_rpe FROM routine_exercises WHERE routine_id = ? AND exercise_id = ?');
  stmt.bind([routineId, exerciseId]);
  if (!stmt.step()) { stmt.free(); return null; }
  const row = stmt.getAsObject() as { target_rpe: number | null };
  stmt.free();
  return row.target_rpe ?? null;
}

// F93 — Batch get target_rpe for all exercises in a routine, returns Map<exerciseId, targetRpe>
export function getRoutineExerciseTargetRPEMap(db: any, routineId: string, exerciseIds: string[]): Map<string, number> {
  const result = new Map<string, number>();
  if (!routineId || exerciseIds.length === 0) return result;
  const placeholders = exerciseIds.map(() => '?').join(',');
  const stmt = db.prepare(`SELECT exercise_id, target_rpe FROM routine_exercises WHERE routine_id = ? AND exercise_id IN (${placeholders})`);
  stmt.bind([routineId, ...exerciseIds]);
  while (stmt.step()) {
    const row = stmt.getAsObject() as { exercise_id: string; target_rpe: number | null };
    if (row.target_rpe != null) result.set(row.exercise_id, row.target_rpe);
  }
  stmt.free();
  return result;
}

// F77 — Get the most recent workout that was started from a routine, for a given exercise
export function getMostRecentRoutineWorkoutForExercise(db: any, exerciseId: string): string | null {
  const stmt = db.prepare(`
    SELECT w.routine_id
    FROM workouts w
    JOIN workout_exercises we ON we.workout_id = w.id
    WHERE w.routine_id IS NOT NULL AND we.exercise_id = ?
    ORDER BY w.started_at DESC
    LIMIT 1
  `);
  stmt.bind([exerciseId]);
  if (!stmt.step()) { stmt.free(); return null; }
  const row = stmt.getAsObject() as { routine_id: string };
  stmt.free();
  return row.routine_id;
}

// Workouts
export function getWorkouts(db: any, limit = 50): Workout[] {
  const stmt = db.prepare('SELECT * FROM workouts ORDER BY started_at DESC LIMIT ?');
  stmt.bind([limit]);
  const rows: { id: string; name: string; notes: string; tags: string | null; started_at: string; finished_at: string | null; duration_seconds: number | null; is_public: boolean; routine_id: string | null; intensity: string | null }[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject() as typeof rows[number]);
  stmt.free();
  return rows.map(row => ({ ...row, is_public: Boolean(row.is_public), tags: safeJsonParse(row.tags, []) }));
}

export function getWorkoutById(db: any, id: string): Workout | null {
  const stmt = db.prepare('SELECT * FROM workouts WHERE id = ?');
  stmt.bind([id]);
  if (!stmt.step()) { stmt.free(); return null; }
  const r: any = stmt.getAsObject();
  stmt.free();
  r.tags = safeJsonParse(r.tags, []);
  return r as Workout;
}

export function getWorkoutSets(db: any, workoutId: string): WorkoutSet[] {
  const stmt = db.prepare('SELECT * FROM workout_sets WHERE workout_id = ? ORDER BY completed_at');
  stmt.bind([workoutId]);
  const rows: WorkoutSet[] = [];
  while (stmt.step()) {
    const r = stmt.getAsObject() as WorkoutSet & { notes?: string };
    rows.push({ ...r, notes: r.notes || '' } as WorkoutSet);
  }
  stmt.free();
  return rows;
}

// F168 — Get the most recent workout ID (single-row query, no limit cap)
export function getMostRecentWorkoutId(db: any): string | null {
  const stmt = db.prepare('SELECT id FROM workouts WHERE finished_at IS NOT NULL ORDER BY started_at DESC LIMIT 1');
  if (stmt.step()) {
    const r = stmt.getAsObject() as { id: string };
    stmt.free();
    return r.id;
  }
  stmt.free();
  return null;
}


export function getWorkoutExerciseOrder(db: any, workoutId: string): Map<string, { order_index: number; notes: string; group_id: string }> {
  const stmt = db.prepare('SELECT exercise_id, order_index, notes, group_id FROM workout_exercises WHERE workout_id = ?');
  stmt.bind([workoutId]);
  const map = new Map<string, { order_index: number; notes: string; group_id: string }>();
  while (stmt.step()) {
    const r = stmt.getAsObject() as { exercise_id: string; order_index: number; notes: string; group_id: string };
    map.set(r.exercise_id, { order_index: r.order_index, notes: r.notes || '', group_id: r.group_id || '' });
  }
  stmt.free();
  return map;
}

export function getExerciseSetsHistory(db: any, exerciseId: string, limit = 10): WorkoutSet[] {
  const stmt = db.prepare(`
    SELECT ws.*, w.started_at as workout_date
    FROM workout_sets ws
    JOIN workouts w ON w.id = ws.workout_id
    WHERE ws.exercise_id = ? AND ws.set_type = 'normal'
    ORDER BY w.started_at DESC
    LIMIT ?
  `);
  stmt.bind([exerciseId, limit]);
  const rows: WorkoutSet[] = [];
  while (stmt.step()) {
    const r = stmt.getAsObject() as WorkoutSet & { notes?: string };
    rows.push({ ...r, notes: r.notes || '' } as WorkoutSet);
  }
  stmt.free();
  return rows;
}

/** Returns the sets from the most recent workout for an exercise, grouped by set_number
 *  (averages weight/reps across sets with the same number). Used for auto-fill. */
export function getLastExerciseSets(db: any, exerciseId: string): WorkoutSet[] {
  const stmt = db.prepare(`
    SELECT ws.set_number, ws.set_type,
           ROUND(AVG(ws.reps)) as reps,
           ROUND(AVG(ws.weight * 10) / 10, 1) as weight
    FROM workout_sets ws
    JOIN workouts w ON w.id = ws.workout_id
    WHERE ws.exercise_id = ?
      AND w.finished_at IS NOT NULL
      AND ws.set_type = 'normal'
    GROUP BY ws.set_number, ws.set_type
    ORDER BY ws.set_number
    LIMIT 20
  `);
  stmt.bind([exerciseId]);
  const rows: WorkoutSet[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as WorkoutSet);
  }
  stmt.free();
  return rows;
}

/** Returns sets WITH RPE data from the most recent workout for an exercise.
 *  Used for RPE-based weight suggestions when starting a workout from a routine. */
export function getLastExerciseSetsWithRpe(db: any, exerciseId: string): { set_number: number; reps: number; weight: number; rpe: number | null }[] {
  // Get the most recent workout for this exercise
  const workoutStmt = db.prepare(`
    SELECT w.id
    FROM workouts w
    JOIN workout_sets ws ON ws.workout_id = w.id
    WHERE ws.exercise_id = ?
      AND w.finished_at IS NOT NULL
    ORDER BY w.started_at DESC
    LIMIT 1
  `);
  workoutStmt.bind([exerciseId]);
  if (!workoutStmt.step()) {
    workoutStmt.free();
    return [];
  }
  const workoutId = workoutStmt.getAsObject().id as string;
  workoutStmt.free();

  const stmt = db.prepare(`
    SELECT ws.set_number, ws.reps, ws.weight, ws.rpe
    FROM workout_sets ws
    WHERE ws.workout_id = ?
      AND ws.exercise_id = ?
      AND ws.set_type = 'normal'
    ORDER BY ws.set_number
    LIMIT 20
  `);
  stmt.bind([workoutId, exerciseId]);
  const rows: { set_number: number; reps: number; weight: number; rpe: number | null }[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as { set_number: number; reps: number; weight: number; rpe: number | null });
  }
  stmt.free();
  return rows;
}

/** Returns the sets from the workout BEFORE the specified workoutId for an exercise,
 *  used to show "última vez" comparison in WorkoutDetailPage. */
export function getPreviousExerciseSets(db: any, exerciseId: string, currentWorkoutId: string): { sets: WorkoutSet[]; workoutDate: string } | null {
  // Find the workout just before the current one (by started_at)
  const prevWorkoutStmt = db.prepare(`
    SELECT w.id, w.started_at
    FROM workouts w
    WHERE w.finished_at IS NOT NULL
      AND w.started_at < (SELECT started_at FROM workouts WHERE id = ?)
    ORDER BY w.started_at DESC
    LIMIT 1
  `);
  prevWorkoutStmt.bind([currentWorkoutId]);
  if (!prevWorkoutStmt.step()) {
    prevWorkoutStmt.free();
    return null;
  }
  const prevWorkout = prevWorkoutStmt.getAsObject() as { id: string; started_at: string };
  prevWorkoutStmt.free();

  const setsStmt = db.prepare(`
    SELECT ws.set_number, ws.set_type,
           ROUND(AVG(ws.reps)) as reps,
           ROUND(AVG(ws.weight * 10) / 10, 1) as weight
    FROM workout_sets ws
    WHERE ws.workout_id = ?
      AND ws.exercise_id = ?
      AND ws.set_type = 'normal'
    GROUP BY ws.set_number, ws.set_type
    ORDER BY ws.set_number
  `);
  setsStmt.bind([prevWorkout.id, exerciseId]);
  const rows: WorkoutSet[] = [];
  while (setsStmt.step()) {
    rows.push(setsStmt.getAsObject() as WorkoutSet);
  }
  setsStmt.free();
  return { sets: rows, workoutDate: prevWorkout.started_at };
}

// Stats
export function getWorkoutCount(db: any): number {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM workouts WHERE finished_at IS NOT NULL');
  if (!stmt.step()) { stmt.free(); return 0; }
  const row = stmt.getAsObject() as { count: number };
  stmt.free();
  return row.count ?? 0;
}

export function getRecentWorkouts(db: any, days = 7): Workout[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  const stmt = db.prepare('SELECT * FROM workouts WHERE finished_at IS NOT NULL AND started_at >= ? ORDER BY started_at DESC');
  stmt.bind([cutoffStr]);
  const rows: { id: string; name: string; notes: string; tags: string | null; started_at: string; finished_at: string | null; duration_seconds: number | null; is_public: boolean; routine_id: string | null }[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject() as typeof rows[number]);
  stmt.free();
  return rows.map(row => ({ ...row, is_public: Boolean(row.is_public), tags: safeJsonParse(row.tags, []) }));
}

export function getPersonalRecords(db: any, exerciseId: string): PersonalRecord[] {
  const stmt = db.prepare('SELECT * FROM personal_records WHERE exercise_id = ? ORDER BY achieved_at DESC');
  stmt.bind([exerciseId]);
  const rows: PersonalRecord[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject() as PersonalRecord);
  stmt.free();
  return rows;
}

// F163 — Batch version: get PRs for multiple exercises in one query, returns Map<exerciseId, PersonalRecord[]>
export function getPersonalRecordsByIds(db: any, exerciseIds: string[]): Map<string, PersonalRecord[]> {
  if (!exerciseIds.length) return new Map();
  const placeholders = exerciseIds.map(() => '?').join(',');
  const stmt = db.prepare(`SELECT * FROM personal_records WHERE exercise_id IN (${placeholders}) ORDER BY exercise_id, achieved_at DESC`);
  stmt.bind(exerciseIds);
  const rows: PersonalRecord[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject() as PersonalRecord);
  stmt.free();
  const map = new Map<string, PersonalRecord[]>();
  for (const row of rows) {
    if (!map.has(row.exercise_id)) map.set(row.exercise_id, []);
    map.get(row.exercise_id)!.push(row);
  }
  return map;
}

// F289 — Record-returning variant of getPersonalRecordsByIds
export function getPersonalRecordsByIdsAll(db: any, exerciseIds: string[]): Record<string, PersonalRecord[]> {
  const m = getPersonalRecordsByIds(db, exerciseIds);
  const r: Record<string, PersonalRecord[]> = {};
  m.forEach((v: any, k: any) => { r[k] = v; });
  return r;
}

// Get all personal records across all exercises, with exercise names and muscle group
export function getAllPersonalRecords(db: any): { exercise_id: string; exercise_name: string; type: string; value: number; achieved_at: string; workout_id: string; muscle_group: string }[] {
  const stmt = db.prepare(`
    SELECT pr.exercise_id, e.name as exercise_name, pr.type, pr.value, pr.achieved_at, pr.workout_id, e.muscle_group
    FROM personal_records pr
    JOIN exercises e ON e.id = pr.exercise_id
    WHERE pr.type IN ('max_weight', 'estimated_1rm')
    ORDER BY pr.achieved_at DESC
  `);
  const rows: any[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

export function getMaxWeightForExercise(db: any, exerciseId: string): number | null {
  const stmt = db.prepare(`
    SELECT MAX(ws.weight) as max_w
    FROM workout_sets ws
    WHERE ws.exercise_id = ? AND ws.weight > 0 AND ws.set_type = 'normal'
  `);
  stmt.bind([exerciseId]);
  if (!stmt.step()) { stmt.free(); return null; }
  const r = stmt.getAsObject();
  stmt.free();
  return r.max_w || null;
}

export function getExerciseStats(db: any, exerciseId: string) {
  const sets = getExerciseSetsHistory(db, exerciseId); // F264 fix: was hardcoded to 100 sets, now uses all sets
  if (!sets.length) return null;

  const weights = sets.map(s => s.weight).filter(w => w > 0);
  const maxWeight = Math.max(...weights);
  const totalVolume = sets.reduce((acc, s) => acc + (s.weight * s.reps), 0);

  return { maxWeight, totalVolume, setCount: sets.length };
}

export function getMuscleVolumeMap(db: any, days = 30) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  const stmt = db.prepare(`
    SELECT e.muscle_group, SUM(ws.weight * ws.reps) as volume
    FROM workout_sets ws
    JOIN workouts w ON w.id = ws.workout_id
    JOIN exercises e ON e.id = ws.exercise_id
    WHERE w.started_at >= ?
    AND ws.set_type = 'normal'
    GROUP BY e.muscle_group
    ORDER BY volume DESC
  `);
  stmt.bind([cutoffStr]);
  const rows: any[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  if (!rows.length) return [];
  return rows.map((row: any) => ({
    muscle: row.muscle_group,
    volume: row.volume || 0,
  }));
}

// Returns the most recent date each muscle group was trained (as YYYY-MM-DD strings)
export function getMuscleLastWorked(db: any): Record<string, string> {
  const stmt = db.prepare(`
    SELECT e.muscle_group, MAX(date(w.started_at)) as last_date
    FROM workout_sets ws
    JOIN workouts w ON w.id = ws.workout_id
    JOIN exercises e ON e.id = ws.exercise_id
    WHERE ws.set_type = 'normal' AND w.finished_at IS NOT NULL
    GROUP BY e.muscle_group
  `);
  const map: Record<string, string> = {};
  while (stmt.step()) {
    const row = stmt.getAsObject() as { muscle_group: string; last_date: string };
    map[row.muscle_group] = row.last_date;
  }
  stmt.free();
  return map;
}

export function getWorkoutHeatmap(db: any, year: number) {
  const stmt = db.prepare(`
    SELECT date(started_at) as day, COUNT(*) as count
    FROM workouts
    WHERE finished_at IS NOT NULL
    AND started_at LIKE ?
    GROUP BY date(started_at)
  `);
  stmt.bind([year.toString() + '%']);
  const map: Record<string, number> = {};
  while (stmt.step()) {
    const r = stmt.getAsObject();
    map[r.day as string] = r.count as number;
  }
  stmt.free();
  return map;
}

// Full export queries
export function getAllWorkoutSets(db: any): WorkoutSet[] {
  const stmt = db.prepare('SELECT * FROM workout_sets');
  const rows: WorkoutSet[] = [];
  while (stmt.step()) {
    const r = stmt.getAsObject() as WorkoutSet;
    rows.push({ ...r, notes: r.notes || '' });
  }
  stmt.free();
  return rows;
}


export function getAllWorkoutExercises(db: any): { id: string; workout_id: string; exercise_id: string; order_index: number; notes: string }[] {
  const stmt = db.prepare('SELECT * FROM workout_exercises');
  const rows: any[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows.map(r => ({ ...r, notes: r.notes || '' }));
}

// Body weight
export function getBodyWeightHistory(db: any, limit = 30): { id: string; weight: number; recorded_at: string; photo: string | null; notes: string }[] {
  const stmt = db.prepare('SELECT * FROM body_weight ORDER BY recorded_at DESC LIMIT ?');
  stmt.bind([limit]);
  const rows: { id: string; weight: number; recorded_at: string; photo: string | null; notes: string }[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject() as typeof rows[number]);
  stmt.free();
  return rows;
}

export function getLatestBodyWeight(db: any): number | null {
  const stmt = db.prepare('SELECT weight FROM body_weight ORDER BY recorded_at DESC LIMIT 1');
  if (!stmt.step()) { stmt.free(); return null; }
  const row = stmt.getAsObject() as { weight: number };
  stmt.free();
  return row.weight ?? null;
}

// Body measurements (F7)
export type BodyPart = 'waist' | 'chest' | 'biceps' | 'thigh' | 'calf' | 'hips' | 'shoulders' | 'neck';

export function getBodyMeasurements(db: any, bodyPart?: BodyPart, limit = 30): { id: string; body_part: BodyPart; value: number; recorded_at: string }[] {
  if (bodyPart) {
    const stmt = db.prepare('SELECT * FROM body_measurements WHERE body_part = ? ORDER BY recorded_at DESC LIMIT ?');
    stmt.bind([bodyPart, limit]);
    const rows: { id: string; body_part: BodyPart; value: number; recorded_at: string }[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject() as typeof rows[number]);
    stmt.free();
    return rows;
  }
  const stmt = db.prepare('SELECT * FROM body_measurements ORDER BY recorded_at DESC LIMIT ?');
  stmt.bind([limit]);
  const rows: { id: string; body_part: BodyPart; value: number; recorded_at: string }[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject() as typeof rows[number]);
  stmt.free();
  return rows;
}

export function getMeasurementHistory(db: any, bodyPart: BodyPart, limit = 30): { id: string; value: number; recorded_at: string }[] {
  const stmt = db.prepare('SELECT id, value, recorded_at FROM body_measurements WHERE body_part = ? ORDER BY recorded_at DESC LIMIT ?');
  stmt.bind([bodyPart, limit]);
  const rows: { id: string; value: number; recorded_at: string }[] = [];
  while (stmt.step()) {
    const r = stmt.getAsObject();
    rows.push({ id: r.id as string, value: r.value as number, recorded_at: r.recorded_at as string });
  }
  stmt.free();
  return rows;
}

// F175 — Get measurement history for ALL body parts in a single query (for ProgressPage trend chart)
export function getAllMeasurementHistory(db: any, days = 30): Record<string, { date: string; value: number }[]> {
  const result: Record<string, { date: string; value: number }[]> = {};
  const bodyParts = ['waist', 'chest', 'biceps', 'thigh', 'calf', 'hips', 'shoulders', 'neck'];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString();

  const stmt = db.prepare(`
    SELECT body_part, value, recorded_at
    FROM body_measurements
    WHERE recorded_at >= ?
    ORDER BY body_part, recorded_at ASC
  `);
  stmt.bind([cutoffStr]);
  while (stmt.step()) {
    const r = stmt.getAsObject() as { body_part: string; value: number; recorded_at: string };
    if (!result[r.body_part]) result[r.body_part] = [];
    result[r.body_part].push({ date: r.recorded_at.split('T')[0], value: r.value });
  }
  stmt.free();
  // Initialize empty arrays for parts with no data
  for (const part of bodyParts) {
    if (!result[part]) result[part] = [];
  }
  return result;
}

export function getLatestMeasurement(db: any, bodyPart: BodyPart): number | null {
  const stmt = db.prepare('SELECT value FROM body_measurements WHERE body_part = ? ORDER BY recorded_at DESC LIMIT 1');
  stmt.bind([bodyPart]);
  let result: number | null = null;
  if (stmt.step()) {
    result = stmt.getAsObject().value as number | null;
  }
  stmt.free();
  return result;
}

// F292 — Get the previous (second-latest) measurement for a body part, for delta display
export function getPreviousMeasurement(db: any, bodyPart: BodyPart): number | null {
  const stmt = db.prepare('SELECT value FROM body_measurements WHERE body_part = ? ORDER BY recorded_at DESC LIMIT 2');
  stmt.bind([bodyPart]);
  let result: number | null = null;
  let count = 0;
  while (stmt.step()) {
    count++;
    if (count === 2) {
      result = stmt.getAsObject().value as number | null;
    }
  }
  stmt.free();
  return result;
}

// F292 — Batch query: get last N measurements for all body parts in one SQL call
// Returns Record<BodyPart, {values: number[], dates: string[]}[]> for trend analysis
export function getMeasurementTrendBatch(db: any, limit = 5): Record<string, { values: number[]; dates: string[] }> {
  const bodyParts = ['waist', 'chest', 'biceps', 'thigh', 'calf', 'hips', 'shoulders', 'neck'];
  const result: Record<string, { values: number[]; dates: string[] }> = {};
  for (const part of bodyParts) {
    result[part] = { values: [], dates: [] };
  }
  const stmt = db.prepare(`
    SELECT body_part, value, recorded_at
    FROM body_measurements
    WHERE body_part IN ('waist', 'chest', 'biceps', 'thigh', 'calf', 'hips', 'shoulders', 'neck')
    ORDER BY body_part, recorded_at DESC
    LIMIT ?
  `);
  stmt.bind([limit * bodyParts.length]);
  while (stmt.step()) {
    const r = stmt.getAsObject() as { body_part: string; value: number; recorded_at: string };
    if (result[r.body_part] && result[r.body_part].values.length < limit) {
      result[r.body_part].values.unshift(r.value);
      result[r.body_part].dates.unshift(r.recorded_at);
    }
  }
  stmt.free();
  return result;
}

// F293 — Get feel tag distribution from workouts in the last N days
// Returns {tag: count} for tags that are feel tags (💪 Strong, 😵 Hard, 😴 Easy, 🔥 PR)
export function getWorkoutFeelDistribution(db: any, days = 30): Record<string, number> {
  const FEEL_TAGS = ['💪 Strong', '😵 Hard', '😴 Easy', '🔥 PR'];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString();
  const stmt = db.prepare('SELECT tags FROM workouts WHERE finished_at IS NOT NULL AND started_at >= ?');
  stmt.bind([cutoffStr]);
  const distribution: Record<string, number> = {};
  for (const t of FEEL_TAGS) distribution[t] = 0;
  while (stmt.step()) {
    const r = stmt.getAsObject() as { tags: string | null };
    if (!r.tags) continue;
    try {
      const tags = JSON.parse(r.tags) as string[];
      for (const t of FEEL_TAGS) {
        if (tags.includes(t)) distribution[t]++;
      }
    } catch { /* ignore malformed JSON */ }
  }
  stmt.free();
  return distribution;
}

// F7 — Get latest measurement for all body parts at once (single query, no N+1)
export function getAllLatestMeasurements(db: any): Record<string, number | null> {
  const result: Record<string, number | null> = {};
  const bodyParts = ['waist', 'chest', 'biceps', 'thigh', 'calf', 'hips', 'shoulders', 'neck'];
  // Single query: latest per body_part using GROUP BY with MAX
  const stmt = db.prepare(`
    SELECT body_part, value FROM (
      SELECT body_part, value, recorded_at,
             ROW_NUMBER() OVER (PARTITION BY body_part ORDER BY recorded_at DESC) as rn
      FROM body_measurements
    )
    WHERE rn = 1
  `);
  while (stmt.step()) {
    const row = stmt.getAsObject() as { body_part: string; value: number };
    result[row.body_part] = row.value;
  }
  stmt.free();
  // Initialize nulls for body parts with no measurements
  for (const part of bodyParts) {
    if (result[part] === undefined) result[part] = null;
  }
  return result;
}

// Streak — consecutive days with at least one workout
export function getStreak(db: any): number {
  const stmt = db.prepare(`
    SELECT date(started_at) as day
    FROM workouts
    WHERE finished_at IS NOT NULL
    GROUP BY date(started_at)
    ORDER BY day DESC
  `);
  const days: string[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as { day: string };
    days.push(row.day);
  }
  stmt.free();
  if (days.length === 0) return 0;

  days.sort((a: string, b: string) => b.localeCompare(a));
  let streak = 0;
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  // Must have trained today or yesterday to have an active streak
  if (days[0] !== today && days[0] !== yesterday) return 0;

  let current = new Date(days[0]);
  for (const day of days) {
    const d = new Date(day);
    const diff = Math.round((current.getTime() - d.getTime()) / 86400000);
    if (diff <= 1) {
      streak++;
      current = d;
    } else {
      break;
    }
  }
  return streak;
}

// F331 — Get weekly volume comparison (this week vs last week, total kg lifted)
export function getWeeklyVolumeComparison(db: any): { thisWeek: number; lastWeek: number; thisWeekWorkouts: number; lastWeekWorkouts: number } {
  const today = new Date();
  const startOfThisWeek = new Date(today);
  startOfThisWeek.setDate(today.getDate() - today.getDay()); // Sunday
  startOfThisWeek.setHours(0, 0, 0, 0);
  const startOfLastWeek = new Date(startOfThisWeek);
  startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

  const thisWeekStr = startOfThisWeek.toISOString().split('T')[0];
  const lastWeekStr = startOfLastWeek.toISOString().split('T')[0];

  const stmt = db.prepare(`
    SELECT date(w.started_at) as day, SUM(ws.weight * ws.reps) as volume, COUNT(DISTINCT w.id) as workout_count
    FROM workouts w
    JOIN workout_sets ws ON ws.workout_id = w.id
    WHERE w.finished_at IS NOT NULL
      AND date(w.started_at) >= ?
      AND ws.set_type = 'normal' AND ws.completed_at IS NOT NULL
    GROUP BY date(w.started_at)
  `);
  stmt.bind([lastWeekStr]);

  let thisWeek = 0, lastWeek = 0, thisWeekWorkouts = 0, lastWeekWorkouts = 0;
  const seenThisWeek = new Set<string>();
  const seenLastWeek = new Set<string>();

  while (stmt.step()) {
    const row = stmt.getAsObject() as { day: string; volume: number; workout_count: number };
    const vol = row.volume || 0;
    if (row.day >= thisWeekStr) {
      thisWeek += vol;
      if (!seenThisWeek.has(row.day)) { thisWeekWorkouts += row.workout_count; seenThisWeek.add(row.day); }
    } else {
      lastWeek += vol;
      if (!seenLastWeek.has(row.day)) { lastWeekWorkouts += row.workout_count; seenLastWeek.add(row.day); }
    }
  }
  stmt.free();
  return { thisWeek, lastWeek, thisWeekWorkouts, lastWeekWorkouts };
}

// F329 — Get workout dates in the last N days (for streak calendar display)
export function getWorkoutDatesLast7Days(db: any): Set<string> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const stmt = db.prepare(`
    SELECT DISTINCT date(started_at) as day
    FROM workouts
    WHERE finished_at IS NOT NULL AND date(started_at) >= ?
    ORDER BY day ASC
  `);
  stmt.bind([sevenDaysAgo]);
  const dates = new Set<string>();
  while (stmt.step()) {
    const row = stmt.getAsObject() as { day: string };
    dates.add(row.day);
  }
  stmt.free();
  return dates;
}

// Longest streak — longest run of consecutive days with at least one workout
export function getLongestStreak(db: any): number {
  const stmt = db.prepare(`
    SELECT date(started_at) as day
    FROM workouts
    WHERE finished_at IS NOT NULL
    GROUP BY date(started_at)
    ORDER BY day ASC
  `);
  const days: string[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as { day: string };
    days.push(row.day);
  }
  stmt.free();
  if (days.length === 0) return 0;

  let longest = 1;
  let current = 1;
  for (let i = 1; i < days.length; i++) {
    const prev = new Date(days[i - 1]);
    const curr = new Date(days[i]);
    const diff = Math.round((curr.getTime() - prev.getTime()) / 86400000);
    if (diff === 1) {
      current++;
      if (current > longest) longest = current;
    } else {
      current = 1;
    }
  }
  return longest;
}

// Weekly summary — workouts this week vs last week
export function getWeeklySummary(db: any): { thisWeek: number; lastWeek: number; volumeThisWeek: number; volumeLastWeek: number; streak: number; longestStreak: number } {
  const thisWeekStmt = db.prepare(`
    SELECT COUNT(*), COALESCE(SUM(duration_seconds), 0)
    FROM workouts
    WHERE finished_at IS NOT NULL
    AND started_at >= datetime('now', 'weekday 0', '-7 days')
  `);
  thisWeekStmt.step();
  const thisWeek = ((thisWeekStmt.getAsObject() as Record<string, number>)['COUNT(*)']) ?? 0;
  thisWeekStmt.free();

  const lastWeekStmt = db.prepare(`
    SELECT COUNT(*), COALESCE(SUM(duration_seconds), 0)
    FROM workouts
    WHERE finished_at IS NOT NULL
    AND started_at >= datetime('now', 'weekday 0', '-14 days')
    AND started_at < datetime('now', 'weekday 0', '-7 days')
  `);
  lastWeekStmt.step();
  const lastWeek = ((lastWeekStmt.getAsObject() as Record<string, number>)['COUNT(*)']) ?? 0;
  lastWeekStmt.free();

  const volThisWeekStmt = db.prepare(`
    SELECT COALESCE(SUM(ws.weight * ws.reps), 0) as vol
    FROM workout_sets ws
    JOIN workouts w ON w.id = ws.workout_id
    WHERE ws.set_type = 'normal'
    AND w.started_at >= datetime('now', 'weekday 0', '-7 days')
  `);
  volThisWeekStmt.step();
  const volumeThisWeek = (volThisWeekStmt.getAsObject() as { vol: number }).vol ?? 0;
  volThisWeekStmt.free();

  const volLastWeekStmt = db.prepare(`
    SELECT COALESCE(SUM(ws.weight * ws.reps), 0) as vol
    FROM workout_sets ws
    JOIN workouts w ON w.id = ws.workout_id
    WHERE ws.set_type = 'normal'
    AND w.started_at >= datetime('now', 'weekday 0', '-14 days')
    AND w.started_at < datetime('now', 'weekday 0', '-7 days')
  `);
  volLastWeekStmt.step();
  const volumeLastWeek = (volLastWeekStmt.getAsObject() as { vol: number }).vol ?? 0;
  volLastWeekStmt.free();

  return {
    thisWeek,
    lastWeek,
    volumeThisWeek,
    volumeLastWeek,
    streak: getStreak(db),
    longestStreak: getLongestStreak(db),
  };
}

// Calories estimation (MET-based, very rough)
export function estimateCaloriesBurned(db: any, workoutId: string): number {
  const stmt = db.prepare(`
    SELECT COALESCE(SUM(ws.weight * ws.reps), 0) as total_volume
    FROM workout_sets ws
    WHERE ws.workout_id = ? AND ws.set_type = 'normal'
  `);
  stmt.bind([workoutId]);
  let volume = 0;
  if (stmt.step()) {
    volume = stmt.getAsObject().total_volume as number || 0;
  }
  stmt.free();
  // Rough: 1 kcal per kg lifted = metabolic equivalent approximation
  return Math.round(volume * 0.2);
}

// 1RM estimation using Epley + Brzycki average
export function calculate1RM(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  if (reps === 1) return weight;
  if (reps > 12) reps = 12; // Cap at 12 to avoid ridiculous estimates
  const epley = weight * (1 + reps / 30);
  const brzycki = weight * (36 / (37 - reps));
  return Math.round(((epley + brzycki) / 2) * 10) / 10;
}

/** Generate automatic warmup sets for barbell exercises.
 * Uses a standard progressive warmup: empty bar → 20% → 40% → 60% → 80%.
 * Returns null if no warmup sets should be generated (not a barbell or weight too low). */
export function getWarmupSets(workingWeight: number): { weight: number; reps: number; set_type: 'warmup' }[] {
  if (workingWeight < 20) return []; // Only for barbell exercises with meaningful weight

  const rounds: { weight: number; reps: number; set_type: 'warmup' }[] = [];

  // Empty bar — always included for technique check
  rounds.push({ weight: 0, reps: 10, set_type: 'warmup' });

  // 20% — sets of 8
  const w20 = Math.round(workingWeight * 0.2 / 2.5) * 2.5; // Round to nearest 2.5kg
  if (w20 > 0) rounds.push({ weight: w20, reps: 8, set_type: 'warmup' });

  // 40% — sets of 5
  const w40 = Math.round(workingWeight * 0.4 / 2.5) * 2.5;
  if (w40 > w20) rounds.push({ weight: w40, reps: 5, set_type: 'warmup' });

  // 60% — sets of 3
  const w60 = Math.round(workingWeight * 0.6 / 2.5) * 2.5;
  if (w60 > w40) rounds.push({ weight: w60, reps: 3, set_type: 'warmup' });

  // 80% — sets of 2
  const w80 = Math.round(workingWeight * 0.8 / 2.5) * 2.5;
  if (w80 > w60) rounds.push({ weight: w80, reps: 2, set_type: 'warmup' });

  return rounds;
}

// Get the most recent exercise notes from any past workout — used to pre-fill notes when adding exercise to a new workout
export function getLastExerciseNotes(db: any, exerciseId: string): string {
  const stmt = db.prepare(`
    SELECT we.notes
    FROM workout_exercises we
    JOIN workouts w ON w.id = we.workout_id
    WHERE we.exercise_id = ?
      AND we.notes IS NOT NULL
      AND we.notes != ''
      AND w.finished_at IS NOT NULL
    ORDER BY w.started_at DESC
    LIMIT 1
  `);
  stmt.bind([exerciseId]);
  let notes = '';
  if (stmt.step()) {
    notes = (stmt.getAsObject().notes as string) || '';
  }
  stmt.free();
  return notes;
}

// F325 — Batch version: last notes for all exercises in a single query
export function getLastExerciseNotesAll(db: any, exerciseIds: string[]): Record<string, string> {
  if (!exerciseIds.length) return {};
  const placeholders = exerciseIds.map(() => '?').join(',');
  // Subquery: for each exercise, get the most recent non-empty notes from a finished workout
  const stmt = db.prepare(`
    SELECT we.exercise_id, we.notes
    FROM workout_exercises we
    JOIN (
      SELECT exercise_id, MAX(w.started_at) as max_started
      FROM workout_exercises we2
      JOIN workouts w ON w.id = we2.workout_id
      WHERE we2.exercise_id IN (${placeholders})
        AND we2.notes IS NOT NULL AND we2.notes != ''
        AND w.finished_at IS NOT NULL
      GROUP BY we2.exercise_id
    ) latest ON latest.exercise_id = we.exercise_id
    JOIN workouts w ON w.id = we.workout_id
    WHERE we.exercise_id IN (${placeholders})
      AND we.notes IS NOT NULL AND we.notes != ''
      AND w.finished_at IS NOT NULL
      AND w.started_at = latest.max_started
  `);
  const allParams = [...exerciseIds, ...exerciseIds];
  stmt.bind(allParams);
  const result: Record<string, string> = {};
  while (stmt.step()) {
    const row = stmt.getAsObject() as { exercise_id: string; notes: string };
    if (row.notes) result[row.exercise_id] = row.notes;
  }
  stmt.free();
  return result;
}

// Get the last workout's RPE and weight for an exercise — used for smart weight suggestion
export function getLastWorkoutRPEForExercise(db: any, exerciseId: string): { rpe: number | null; weight: number; reps: number } | null {
  const stmt = db.prepare(`
    SELECT ws.rpe, ws.weight, ws.reps, w.started_at
    FROM workout_sets ws
    JOIN workouts w ON w.id = ws.workout_id
    WHERE ws.exercise_id = ?
      AND ws.set_type = 'normal'
      AND w.finished_at IS NOT NULL
    ORDER BY w.started_at DESC
    LIMIT 1
  `);
  stmt.bind([exerciseId]);
  if (!stmt.step()) { stmt.free(); return null; }
  const r = stmt.getAsObject() as { rpe: number | null; weight: number; reps: number; started_at: string };
  stmt.free();
  return { rpe: r.rpe, weight: r.weight, reps: r.reps };
}

// Get estimated 1RM from best set in an exercise's history
export function getEstimated1RM(db: any, exerciseId: string): number {
  const sets = getExerciseSetsHistory(db, exerciseId); // F264 fix: was hardcoded to 100 sets, now uses all sets for accurate 1RM
  let best1RM = 0;
  for (const s of sets as WorkoutSet[]) {
    if (s.weight > 0 && s.reps > 0 && s.set_type === 'normal') {
      const estimated = calculate1RM(s.weight, s.reps);
      if (estimated > best1RM) best1RM = estimated;
    }
  }
  return best1RM;
}

// Get rest time stats for a workout
export function getRestTimeStats(db: any, workoutId: string) {
  const stmt = db.prepare(`
    SELECT ws.rest_time, ws.exercise_id, e.name as exercise_name
    FROM workout_sets ws
    LEFT JOIN exercises e ON e.id = ws.exercise_id
    WHERE ws.workout_id = ? AND ws.rest_time > 0
    ORDER BY ws.completed_at
  `);
  stmt.bind([workoutId]);
  const sets: WorkoutSet[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as { rest_time: number; exercise_id: string; exercise_name: string };
    sets.push({
      id: '',
      workout_id: workoutId,
      exercise_id: row.exercise_id,
      set_number: 0,
      set_type: 'normal',
      reps: 0,
      weight: 0,
      rpe: null,
      notes: '',
      completed_at: '',
      rest_time: row.rest_time,
    });
  }
  stmt.free();
  if (!sets.length) return { avg: 0, min: 0, max: 0, sets: [] as WorkoutSet[] };
  const restTimes = sets.map(s => s.rest_time as number);
  const avg = restTimes.length > 0 ? Math.round(restTimes.reduce((a, b) => a + b, 0) / restTimes.length) : 0;
  return { avg, min: restTimes.length > 0 ? Math.min.apply(null, restTimes) : 0, max: restTimes.length > 0 ? Math.max.apply(null, restTimes) : 0, sets };
}

// Get similar exercises (same muscle group, different equipment) for exercise variation suggestions
export function getSimilarExercises(db: any, exerciseId: string, limit = 3): Exercise[] {
  const stmt = db.prepare(`
    SELECT e.* FROM exercises e
    WHERE e.muscle_group = (SELECT muscle_group FROM exercises WHERE id = ?)
      AND e.id != ?
    ORDER BY
      CASE e.equipment
        WHEN 'barbell' THEN 1
        WHEN 'dumbbell' THEN 2
        WHEN 'machine' THEN 3
        WHEN 'cable' THEN 4
        WHEN 'bodyweight' THEN 5
        WHEN 'kettlebell' THEN 6
        WHEN 'bands' THEN 7
        ELSE 8
      END
    LIMIT ?
  `);
  stmt.bind([exerciseId, exerciseId, limit]);
  const rows: Exercise[] = [];
  while (stmt.step()) {
    const obj = stmt.getAsObject() as { id: string; name: string; muscle_group: string; secondary_muscles: string; equipment: string; is_custom: number; is_favorite: number };
    rows.push({ ...obj, secondary_muscles: safeJsonParse(obj.secondary_muscles, []), is_custom: Boolean(obj.is_custom), is_favorite: Boolean(obj.is_favorite) } as unknown as Exercise);
  }
  stmt.free();
  return rows;
}

// Batch version of getSimilarExercises — single query for ALL exercises, returns Map<exerciseId, Exercise[]>
// Fixes N+1 query pattern where getSimilarExercises was called per exercise on expand
export function getSimilarExercisesBatch(db: any, exerciseIds: string[], limitPerExercise = 3): Map<string, Exercise[]> {
  if (exerciseIds.length === 0) return new Map();

  // Get muscle groups for all target exercises
  const placeholders = exerciseIds.map(() => '?').join(',');
  const muscleStmt = db.prepare(`SELECT id, muscle_group FROM exercises WHERE id IN (${placeholders})`);
  muscleStmt.bind(exerciseIds);
  const muscleMap = new Map<string, string>();
  while (muscleStmt.step()) {
    const row = muscleStmt.getAsObject() as { id: string; muscle_group: string };
    muscleMap.set(row.id, row.muscle_group);
  }
  muscleStmt.free();

  // Get all similar exercises grouped by muscle group (excluding the exercises themselves)
  const allMuscleGroups = [...new Set([...muscleMap.values()])];
  const result = new Map<string, Exercise[]>();

  // Initialize empty arrays for each exercise
  exerciseIds.forEach(id => result.set(id, []));

  if (allMuscleGroups.length === 0) return result;

  const groupPlaceholders = allMuscleGroups.map(() => '?').join(',');
  const similarStmt = db.prepare(`
    SELECT e.*,
      CASE e.equipment
        WHEN 'barbell' THEN 1
        WHEN 'dumbbell' THEN 2
        WHEN 'machine' THEN 3
        WHEN 'cable' THEN 4
        WHEN 'bodyweight' THEN 5
        WHEN 'kettlebell' THEN 6
        WHEN 'bands' THEN 7
        ELSE 8
      END as eq_order
    FROM exercises e
    WHERE e.muscle_group IN (${groupPlaceholders})
      AND e.id NOT IN (${placeholders})
    ORDER BY e.muscle_group, eq_order
  `);
  similarStmt.bind([...allMuscleGroups, ...exerciseIds]);

  // Group results by target exercise's muscle group, limited per group
  const groupCounts = new Map<string, number>();
  while (similarStmt.step()) {
    const obj = similarStmt.getAsObject() as { id: string; name: string; muscle_group: string; secondary_muscles: string; equipment: string; is_custom: number; is_favorite: number };
    const exMuscle = obj.muscle_group;

    // Find which target exercises have this muscle group
    for (const [targetId, targetMuscle] of muscleMap.entries()) {
      if (targetMuscle === exMuscle) {
        const currentCount = groupCounts.get(targetId) || 0;
        if (currentCount < limitPerExercise) {
          const exercise: Exercise = {
            ...obj,
            secondary_muscles: safeJsonParse(obj.secondary_muscles, []),
            is_custom: Boolean(obj.is_custom),
            is_favorite: Boolean(obj.is_favorite),
          } as unknown as Exercise;
          result.get(targetId)!.push(exercise);
          groupCounts.set(targetId, currentCount + 1);
        }
      }
    }
  }
  similarStmt.free();

  return result;
}

// F289 — Record-returning variant of getSimilarExercisesBatch
export function getSimilarExercisesAll(db: any, exerciseIds: string[], limitPerExercise = 3): Record<string, Exercise[]> {
  const m = getSimilarExercisesBatch(db, exerciseIds, limitPerExercise);
  const r: Record<string, Exercise[]> = {};
  m.forEach((v: any, k: any) => { r[k] = v; });
  return r;
}

// F259 — Get the single best set (highest weight × reps volume) for an exercise from the workout where it occurred
export function getBestSetForExercise(db: any, exerciseId: string): { workout_id: string; workout_name: string; weight: number; reps: number; achieved_at: string } | null {
  const stmt = db.prepare(`
    SELECT ws.workout_id, w.name as workout_name, ws.weight, ws.reps, w.started_at as achieved_at
    FROM workout_sets ws
    JOIN workouts w ON w.id = ws.workout_id
    WHERE ws.exercise_id = ?
      AND ws.set_type = 'normal'
      AND ws.weight > 0
      AND w.finished_at IS NOT NULL
    ORDER BY (ws.weight * ws.reps) DESC
    LIMIT 1
  `);
  stmt.bind([exerciseId]);
  if (!stmt.step()) { stmt.free(); return null; }
  const row = stmt.getAsObject() as { workout_id: string; workout_name: string; weight: number; reps: number; achieved_at: string };
  stmt.free();
  return { workout_id: row.workout_id, workout_name: row.workout_name, weight: row.weight, reps: row.reps, achieved_at: row.achieved_at };
}

// F33 — Get last performed date for each exercise (for "last performed" chip in ExercisesPage)
export function getLastPerformedDates(db: any): Record<string, string> {
  const stmt = db.prepare(`
    SELECT ws.exercise_id, MAX(w.started_at) as last_performed
    FROM workout_sets ws
    JOIN workouts w ON w.id = ws.workout_id
    WHERE w.finished_at IS NOT NULL
    GROUP BY ws.exercise_id
  `);
  const map: Record<string, string> = {};
  while (stmt.step()) {
    const row = stmt.getAsObject() as { exercise_id: string; last_performed: string };
    map[row.exercise_id] = row.last_performed;
  }
  stmt.free();
  return map;
}

// F139 — Batch exercise stats: single query returning max_weight, workout_count, and best_set for ALL exercises at once.
// Used by ExercisesPage to populate quick-stats in the expanded view without N+1 queries.
export function getExerciseStatsBatch(db: any): Map<string, { maxWeight: number; workoutCount: number; bestSet: { weight: number; reps: number } | null }> {
  const result = new Map<string, { maxWeight: number; workoutCount: number; bestSet: { weight: number; reps: number } | null }>();

  // Sub-query: max weight and workout count per exercise
  const stmt = db.prepare(`
    SELECT
      ws.exercise_id,
      MAX(ws.weight) as max_weight,
      COUNT(DISTINCT ws.workout_id) as workout_count
    FROM workout_sets ws
    JOIN workouts w ON w.id = ws.workout_id
    WHERE w.finished_at IS NOT NULL
      AND ws.set_type = 'normal'
      AND ws.weight > 0
    GROUP BY ws.exercise_id
  `);
  while (stmt.step()) {
    const row = stmt.getAsObject() as { exercise_id: string; max_weight: number; workout_count: number };
    result.set(row.exercise_id, { maxWeight: row.max_weight || 0, workoutCount: row.workout_count || 0, bestSet: null });
  }
  stmt.free();

  // Best set (highest weight × reps volume) per exercise — need to find the set with max(weight * reps)
  const bestSetStmt = db.prepare(`
    SELECT ws.exercise_id, ws.weight, ws.reps
    FROM workout_sets ws
    JOIN workouts w ON w.id = ws.workout_id
    WHERE w.finished_at IS NOT NULL
      AND ws.set_type = 'normal'
      AND ws.weight > 0
  `);
  while (bestSetStmt.step()) {
    const row = bestSetStmt.getAsObject() as { exercise_id: string; weight: number; reps: number };
    const volume = row.weight * row.reps;
    const existing = result.get(row.exercise_id);
    if (existing) {
      const existingBestVolume = existing.bestSet ? existing.bestSet.weight * existing.bestSet.reps : 0;
      if (volume > existingBestVolume) {
        existing.bestSet = { weight: row.weight, reps: row.reps };
      }
    }
  }
  bestSetStmt.free();

  return result;
}

// F288 — Record-returning variant of getExerciseStatsBatch (eliminates Object.fromEntries in ExercisesPage)
export function getExerciseStatsAll(db: any): Record<string, { maxWeight: number; workoutCount: number; bestSet: { weight: number; reps: number } | null }> {
  const m = getExerciseStatsBatch(db);
  const r: Record<string, { maxWeight: number; workoutCount: number; bestSet: { weight: number; reps: number } | null }> = {};
  m.forEach((v: any, k: any) => { r[k] = v; });
  return r;
}


// F174 — Batch query: workout frequency per exercise over the last 30 days (for ExercisesPage frequency bar)
// Returns a Map of exerciseId -> number of distinct workouts containing that exercise in the last 30 days
export function getExerciseFrequencyBatch(db: any, days = 30): Map<string, number> {
  const result = new Map<string, number>();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const stmt = db.prepare(`
    SELECT ws.exercise_id, COUNT(DISTINCT ws.workout_id) as workout_count
    FROM workout_sets ws
    JOIN workouts w ON w.id = ws.workout_id
    WHERE w.finished_at IS NOT NULL
      AND w.started_at >= ?
      AND ws.set_type = 'normal'
      AND ws.weight > 0
    GROUP BY ws.exercise_id
  `);
  stmt.bind([cutoff.toISOString()]);
  while (stmt.step()) {
    const row = stmt.getAsObject() as { exercise_id: string; workout_count: number };
    result.set(row.exercise_id, row.workout_count || 0);
  }
  stmt.free();
  return result;
}

// F288 — Record-returning variant of getExerciseFrequencyBatch (eliminates Object.fromEntries in ExercisesPage)
export function getExerciseFrequencyAll(db: any, days = 30): Record<string, number> {
  const m = getExerciseFrequencyBatch(db, days);
  const r: Record<string, number> = {};
  m.forEach((v: any, k: any) => { r[k] = v; });
  return r;
}


// F172 — Batch query: last used weight per exercise (for ExercisesPage weight chip when workout is active)
// Returns a Map of exerciseId -> { weight, reps } from the most recent workout containing that exercise
export function getLastWeightPerExercise(db: any): Map<string, { weight: number; reps: number }> {
  const result = new Map<string, { weight: number; reps: number }>();

  // Sub-query: get the most recent workout for each exercise
  // For each exercise, find the single most recent workout that contains it
  const stmt = db.prepare(`
    SELECT ws.exercise_id, ws.weight, ws.reps
    FROM workout_sets ws
    JOIN workouts w ON w.id = ws.workout_id
    JOIN (
      SELECT ws2.exercise_id, MAX(w2.started_at) as last_workout
      FROM workout_sets ws2
      JOIN workouts w2 ON w2.id = ws2.workout_id
      WHERE w2.finished_at IS NOT NULL AND ws2.set_type = 'normal' AND ws2.weight > 0
      GROUP BY ws2.exercise_id
    ) recent ON recent.exercise_id = ws.exercise_id AND w.started_at = recent.last_workout
    WHERE ws.set_type = 'normal' AND ws.weight > 0
  `);

  while (stmt.step()) {
    const row = stmt.getAsObject() as { exercise_id: string; weight: number; reps: number };
    // Keep first set's weight/reps per exercise (most recent workout's first normal set)
    if (!result.has(row.exercise_id)) {
      result.set(row.exercise_id, { weight: Math.round(row.weight * 10) / 10, reps: row.reps });
    }
  }
  stmt.free();
  return result;
}

// F288 — Record-returning variant of getLastWeightPerExercise (eliminates Object.fromEntries in ExercisesPage)
export function getLastWeightPerExerciseAll(db: any): Record<string, { weight: number; reps: number }> {
  const m = getLastWeightPerExercise(db);
  const r: Record<string, { weight: number; reps: number }> = {};
  m.forEach((v: any, k: any) => { r[k] = v; });
  return r;
}


// F75 — Get top exercises by total volume across all workouts (for ProgressPage chart)
export function getTopExercisesByVolume(db: any, limit = 10): { exercise_id: string; exercise_name: string; total_volume: number; workout_count: number }[] {
  const stmt = db.prepare(`
    SELECT
      ws.exercise_id,
      e.name as exercise_name,
      SUM(ws.weight * ws.reps) as total_volume,
      COUNT(DISTINCT ws.workout_id) as workout_count
    FROM workout_sets ws
    JOIN exercises e ON e.id = ws.exercise_id
    JOIN workouts w ON w.id = ws.workout_id
    WHERE w.finished_at IS NOT NULL
      AND ws.set_type = 'normal'
      AND ws.weight > 0
    GROUP BY ws.exercise_id
    ORDER BY total_volume DESC
    LIMIT ?
  `);
  stmt.bind([limit]);
  type VolumeRow = { exercise_id: string; exercise_name: string; total_volume: number; workout_count: number };
  const rows: VolumeRow[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject() as VolumeRow);
  stmt.free();
  return rows;
}

// F91 — Get weekly total volume trend (last 12 weeks) for ProgressPage LineChart
export function getWeeklyVolumeTrend(db: any): { week: string; label: string; volume: number }[] {
  const today = new Date();
  const twelveWeeksAgo = new Date(today);
  twelveWeeksAgo.setDate(today.getDate() - 84); // ~12 weeks ago

  // Single SQL query: join workouts + sets, group by ISO week, filter by date range
  // Note: we fetch raw started_at dates and compute ISO week in JS to ensure
  // consistency with getISOWeek() used in the fill-in loop below.
  const stmt = db.prepare(`
    SELECT
      w.started_at,
      ws.weight * ws.reps AS set_volume
    FROM workout_sets ws
    JOIN workouts w ON w.id = ws.workout_id
    WHERE w.finished_at IS NOT NULL
      AND ws.set_type = 'normal'
      AND ws.weight > 0
      AND w.started_at >= ?
  `);
  stmt.bind([twelveWeeksAgo.toISOString()]);

  const weekMap: Record<string, number> = {};
  while (stmt.step()) {
    const row = stmt.getAsObject() as { started_at: string; set_volume: number };
    const d = new Date(row.started_at);
    const year = d.getFullYear();
    const weekNum = getISOWeek(d);
    const key = `${year}-W${weekNum.toString().padStart(2, '0')}`;
    weekMap[key] = (weekMap[key] || 0) + Math.round(row.set_volume as number);
  }
  stmt.free();

  // Fill in all 12 weeks, including weeks with no workouts (volume = 0)
  const result: { week: string; label: string; volume: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i * 7);
    const year = d.getFullYear();
    const weekNum = getISOWeek(d);
    const key = `${year}-W${weekNum.toString().padStart(2, '0')}`;
    result.push({ week: key, label: `S${weekNum}`, volume: weekMap[key] || 0 });
  }
  return result;
}

// F204 — Get number of workouts containing a specific exercise in the current month
export function getExerciseWorkoutsThisMonth(db: any, exerciseId: string): number {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const stmt = db.prepare(`
    SELECT COUNT(DISTINCT ws.workout_id) as count
    FROM workout_sets ws
    JOIN workouts w ON w.id = ws.workout_id
    WHERE ws.exercise_id = ?
      AND w.started_at >= ?
      AND w.finished_at IS NOT NULL
  `);
  stmt.bind([exerciseId, startOfMonth]);
  if (!stmt.step()) { stmt.free(); return 0; }
  const r = stmt.getAsObject() as { count: number };
  stmt.free();
  return r.count ?? 0;
}



// F305 — Get muscle group frequency for a specific exercise over the last 12 weeks
// Returns which muscle groups were trained on each workout day containing this exercise
export function getMuscleFrequencyForExercise(db: any, exerciseId: string, weeks = 12): { date: string; muscleGroups: string[] }[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - weeks * 7);
  const stmt = db.prepare(`
    SELECT DISTINCT date(w.started_at) as workout_date, e.muscle_group
    FROM workout_sets ws
    JOIN workouts w ON w.id = ws.workout_id
    JOIN exercises e ON e.id = ws.exercise_id
    WHERE ws.exercise_id = ?
      AND w.finished_at IS NOT NULL
      AND w.started_at >= ?
    ORDER BY w.started_at ASC
  `);
  stmt.bind([exerciseId, cutoff.toISOString()]);
  const dateMap: Record<string, Set<string>> = {};
  while (stmt.step()) {
    const row = stmt.getAsObject() as { workout_date: string; muscle_group: string };
    if (!dateMap[row.workout_date]) dateMap[row.workout_date] = new Set();
    dateMap[row.workout_date].add(row.muscle_group);
  }
  stmt.free();
  return Object.entries(dateMap).map(([date, muscles]) => ({
    date,
    muscleGroups: [...muscles],
  }));
}

// F97 — Get rest time analytics: global average + per-muscle-group average (last 30 days)
export function getRestTimeAnalytics(db: any): { globalAvg: number; perMuscle: { muscle: string; avg: number; count: number }[] } {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Global average rest time
  const globalStmt = db.prepare(`
    SELECT AVG(ws.rest_time) as avg_rest
    FROM workout_sets ws
    JOIN workouts w ON w.id = ws.workout_id
    WHERE w.finished_at IS NOT NULL
      AND ws.rest_time > 0
      AND w.started_at >= ?
  `);
  globalStmt.bind([thirtyDaysAgo.toISOString()]);
  let globalAvg = 0;
  if (globalStmt.step()) {
    const row = globalStmt.getAsObject() as { avg_rest: number | null };
    globalAvg = row.avg_rest ? Math.round(row.avg_rest) : 0;
  }
  globalStmt.free();

  // Per-muscle-group average rest time
  const muscleStmt = db.prepare(`
    SELECT e.muscle_group, AVG(ws.rest_time) as avg_rest, COUNT(*) as count
    FROM workout_sets ws
    JOIN workouts w ON w.id = ws.workout_id
    JOIN exercises e ON e.id = ws.exercise_id
    WHERE w.finished_at IS NOT NULL
      AND ws.rest_time > 0
      AND w.started_at >= ?
    GROUP BY e.muscle_group
    ORDER BY avg_rest DESC
  `);
  muscleStmt.bind([thirtyDaysAgo.toISOString()]);
  const perMuscle: { muscle: string; avg: number; count: number }[] = [];
  while (muscleStmt.step()) {
    const row = muscleStmt.getAsObject() as { muscle_group: string; avg_rest: number | null; count: number };
    if (row.avg_rest) {
      perMuscle.push({ muscle: row.muscle_group, avg: Math.round(row.avg_rest), count: row.count });
    }
  }
  muscleStmt.free();

  return { globalAvg, perMuscle };
}

// F134 — Get exercise sets history with workout name and ID (for enriched history display in ExerciseProgressPage)
// F177 — Also joins workout_exercises to get per-workout exercise notes
export function getExerciseSetsHistoryWithWorkout(db: any, exerciseId: string, limit = 50): (WorkoutSet & { workout_date: string; workout_id: string; workout_name: string; exercise_notes: string; workout_tags: string[] })[] {
  const stmt = db.prepare(`
    SELECT ws.*, w.started_at as workout_date, w.id as workout_id, w.name as workout_name, we.notes as exercise_notes, w.tags as workout_tags
    FROM workout_sets ws
    JOIN workouts w ON w.id = ws.workout_id
    LEFT JOIN workout_exercises we ON we.workout_id = w.id AND we.exercise_id = ws.exercise_id
    WHERE ws.exercise_id = ?
    ORDER BY w.started_at DESC
    LIMIT ?
  `);
  stmt.bind([exerciseId, limit]);
  const rows: (WorkoutSet & { workout_date: string; workout_id: string; workout_name: string; exercise_notes: string; workout_tags: string[] })[] = [];
  while (stmt.step()) {
    const r = stmt.getAsObject() as WorkoutSet & { workout_date: string; workout_id: string; workout_name: string; exercise_notes: string; workout_tags: string };
    rows.push({ ...r, notes: r.notes || '', exercise_notes: r.exercise_notes || '', workout_tags: safeJsonParse(r.workout_tags, []) });
  }
  stmt.free();
  return rows;
}

// F133 — Get average workout duration (last 30 days) for pacing comparison
export function getAverageWorkoutDuration(db: any): number {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const stmt = db.prepare(`
    SELECT AVG(duration_seconds) as avg_duration
    FROM workouts
    WHERE finished_at IS NOT NULL
      AND duration_seconds IS NOT NULL
      AND started_at >= ?
  `);
  stmt.bind([thirtyDaysAgo.toISOString()]);
  let avg = 0;
  if (stmt.step()) {
    const row = stmt.getAsObject() as { avg_duration: number | null };
    avg = row.avg_duration ? Math.round(row.avg_duration) : 0;
  }
  stmt.free();
  return avg;
}

// F249 — Average workout volume over last 30 days (for intensity score)
export function getAverageWorkoutVolume(db: any): number {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const stmt = db.prepare(`
    SELECT AVG(vol) as avg_volume FROM (
      SELECT SUM(ws.weight * ws.reps) as vol
      FROM workout_sets ws
      JOIN workouts w ON w.id = ws.workout_id
      WHERE w.finished_at IS NOT NULL
        AND w.started_at >= ?
      GROUP BY w.id
    )
  `);
  stmt.bind([thirtyDaysAgo.toISOString()]);
  let avg = 0;
  if (stmt.step()) {
    const row = stmt.getAsObject() as { avg_volume: number | null };
    avg = row.avg_volume ? Math.round(row.avg_volume) : 0;
  }
  stmt.free();
  return avg;
}

// F117 — Workout time-of-day distribution
export function getWorkoutTimeOfDayDistribution(db: any): { timeOfDay: string; label: string; count: number }[] {
  const stmt = db.prepare(`
    SELECT started_at FROM workouts WHERE finished_at IS NOT NULL ORDER BY started_at
  `);
  const buckets = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  while (stmt.step()) {
    const row = stmt.getAsObject() as { started_at: string };
    const hour = new Date(row.started_at).getHours();
    if (hour >= 5 && hour < 12) buckets.morning++;
    else if (hour >= 12 && hour < 18) buckets.afternoon++;
    else if (hour >= 18 && hour < 23) buckets.evening++;
    else buckets.night++;
  }
  stmt.free();
  const labels: Record<string, string> = {
    morning: 'Mañana (5-12)',
    afternoon: 'Tarde (12-18)',
    evening: 'Noche (18-23)',
    night: 'Madrugada (23-5)',
  };
  return Object.entries(buckets)
    .filter(([, count]) => count > 0)
    .map(([timeOfDay, count]) => ({ timeOfDay, label: labels[timeOfDay], count }));
}

// F146 — Batch rest time stats for ALL workouts: single query returning avg rest time per workout.
// Used by WorkoutsPage to populate rest-time badges in history cards without N+1 queries.
export function getRestTimeStatsBatch(db: any, workoutIds: string[]): Map<string, { avg: number; min: number; max: number }> {
  const result = new Map<string, { avg: number; min: number; max: number }>();
  if (workoutIds.length === 0) return result;

  const placeholders = workoutIds.map(() => '?').join(',');
  const stmt = db.prepare(`
    SELECT ws.workout_id,
           AVG(ws.rest_time) as avg_rest,
           MIN(ws.rest_time) as min_rest,
           MAX(ws.rest_time) as max_rest
    FROM workout_sets ws
    WHERE ws.workout_id IN (${placeholders}) AND ws.rest_time > 0
    GROUP BY ws.workout_id
  `);
  stmt.bind(workoutIds);
  while (stmt.step()) {
    const row = stmt.getAsObject() as { workout_id: string; avg_rest: number | null; min_rest: number; max_rest: number };
    if (row.avg_rest != null) {
      result.set(row.workout_id, {
        avg: Math.round(row.avg_rest),
        min: row.min_rest,
        max: row.max_rest,
      });
    }
  }
  stmt.free();
  return result;
}

// F146 — Batch volume + sets data for ALL workouts: single query returning volume and sets per workout.
// Used by WorkoutsPage to replace per-workout getWorkoutSets calls in render and sort.
export function getWorkoutSetsBatch(db: any, workoutIds: string[]): Map<string, { volume: number; sets: WorkoutSet[] }> {
  const result = new Map<string, { volume: number; sets: WorkoutSet[] }>();
  if (workoutIds.length === 0) return result;

  const placeholders = workoutIds.map(() => '?').join(',');
  const stmt = db.prepare(`
    SELECT ws.workout_id, ws.*
    FROM workout_sets ws
    WHERE ws.workout_id IN (${placeholders})
    ORDER BY ws.workout_id, ws.completed_at
  `);
  stmt.bind(workoutIds);
  const setsByWorkout = new Map<string, WorkoutSet[]>();
  while (stmt.step()) {
    const row = stmt.getAsObject() as WorkoutSet & { workout_id: string };
    if (!setsByWorkout.has(row.workout_id)) setsByWorkout.set(row.workout_id, []);
    setsByWorkout.get(row.workout_id)!.push(row);
  }
  stmt.free();

  for (const id of workoutIds) {
    const sets = setsByWorkout.get(id) || [];
    const volume = sets.reduce((acc: number, s: WorkoutSet) => acc + (s.weight || 0) * (s.reps || 0), 0);
    result.set(id, { volume, sets });
  }
  return result;
}

// F146 — Batch max weight per exercise across ALL exercises: single query replacing per-exercise
// getMaxWeightForExercise calls in WorkoutsPage exercisePRs useMemo.
export function getMaxWeightForExerciseBatch(db: any, exerciseIds: string[]): Map<string, number> {
  const result = new Map<string, number>();
  if (exerciseIds.length === 0) return result;

  const placeholders = exerciseIds.map(() => '?').join(',');
  const stmt = db.prepare(`
    SELECT ws.exercise_id, MAX(ws.weight) as max_w
    FROM workout_sets ws
    WHERE ws.exercise_id IN (${placeholders})
      AND ws.weight > 0
      AND ws.set_type = 'normal'
    GROUP BY ws.exercise_id
  `);
  stmt.bind(exerciseIds);
  while (stmt.step()) {
    const row = stmt.getAsObject() as { exercise_id: string; max_w: number | null };
    if (row.max_w != null && row.max_w > 0) result.set(row.exercise_id, row.max_w);
  }
  stmt.free();
  return result;
}

// F292 — Record-returning variant of getMaxWeightForExerciseBatch (eliminates forEach Map→Record conversion in WorkoutsPage)
export function getMaxWeightForExerciseBatchAll(db: any, exerciseIds: string[]): Record<string, number> {
  const m = getMaxWeightForExerciseBatch(db, exerciseIds);
  const r: Record<string, number> = {};
  m.forEach((v: any, k: any) => { r[k] = v; });
  return r;
}

// F148 — Get the highest single-workout volume ever (max total kg in one session)
export function getMaxWorkoutVolume(db: any): { workout_id: string; workout_name: string; volume: number; date: string } | null {
  const stmt = db.prepare(`
    SELECT w.id as workout_id, w.name as workout_name,
           COALESCE(SUM(ws.weight * ws.reps), 0) as volume,
           w.started_at as date
    FROM workouts w
    LEFT JOIN workout_sets ws ON ws.workout_id = w.id AND ws.set_type = 'normal'
    WHERE w.finished_at IS NOT NULL
    GROUP BY w.id
    ORDER BY volume DESC
    LIMIT 1
  `);
  if (!stmt.step()) { stmt.free(); return null; }
  const row = stmt.getAsObject() as { workout_id: string; workout_name: string; volume: number; date: string };
  stmt.free();
  if (!row || row.volume === 0) return null;
  return row;
}

// F9 — Rest time trend: average rest time per workout over the last N days.
// Returns one data point per workout that has rest_time data.
export function getRestTimeTrend(db: any, days = 30): { date: string; avg_rest: number; workout_id: string }[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const stmt = db.prepare(`
    SELECT
      ws.workout_id,
      w.started_at,
      AVG(ws.rest_time) as avg_rest
    FROM workout_sets ws
    JOIN workouts w ON w.id = ws.workout_id
    WHERE ws.rest_time > 0
      AND w.finished_at IS NOT NULL
      AND w.started_at >= ?
    GROUP BY ws.workout_id
    ORDER BY w.started_at ASC
  `);
  stmt.bind([cutoff.toISOString()]);
  const result: { date: string; avg_rest: number; workout_id: string }[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as { workout_id: string; started_at: string; avg_rest: number };
    result.push({
      workout_id: row.workout_id,
      date: row.started_at.split('T')[0],
      avg_rest: Math.round(row.avg_rest),
    });
  }
  stmt.free();
  return result;
}

// F180 — Get difficulty rating for a specific exercise
export function getExerciseDifficulty(db: any, exerciseId: string): number {
  const stmt = db.prepare('SELECT difficulty FROM exercise_difficulty WHERE exercise_id = ?');
  stmt.bind([exerciseId]);
  if (!stmt.step()) { stmt.free(); return 0; }
  const row = stmt.getAsObject() as { difficulty: number };
  stmt.free();
  return row.difficulty ?? 0;
}

// F241 — Muscle-specific optimal training frequencies (days between sessions).
// Based on recovery science: larger muscles need more time (7-10d) while smaller ones recover faster (3-5d).
const MUSCLE_OPTIMAL_DAYS: Record<string, number> = {
  chest:    7,
  back:     7,
  legs:     10,
  shoulders: 6,
  biceps:   5,
  triceps:  5,
  core:     4,
  forearms: 4,
  glutes:   9,
  calves:   8,
  // Fallback for custom/other
  other:    7,
};

// F241 — Get average days between workout sessions for an exercise (training frequency).
// Computes the rolling average of the last N intervals between consecutive workout sessions.
// Returns average days between workouts (e.g., 4.2 days) and recommended days based on muscle group.
export function getExerciseTrainingInterval(db: any, exerciseId: string): { avgDays: number; recommendedDays: number; sessions: number } {
  // Look up the exercise's muscle group to get muscle-specific optimal days
  const exStmt = db.prepare('SELECT muscle_group FROM exercises WHERE id = ?');
  exStmt.bind([exerciseId]);
  const exRow = exStmt.step() ? exStmt.getAsObject() as { muscle_group: string } : null;
  exStmt.free();
  const muscle = exRow?.muscle_group || 'other';
  const optimalDays = MUSCLE_OPTIMAL_DAYS[muscle] ?? MUSCLE_OPTIMAL_DAYS.other;

  const stmt = db.prepare(`
    SELECT DISTINCT date(w.started_at) as workout_date
    FROM workout_sets ws
    JOIN workouts w ON w.id = ws.workout_id
    WHERE ws.exercise_id = ?
      AND ws.set_type = 'normal'
      AND w.finished_at IS NOT NULL
    ORDER BY workout_date DESC
    LIMIT 12
  `);
  stmt.bind([exerciseId]);
  const dates: string[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as { workout_date: string };
    dates.push(row.workout_date);
  }
  stmt.free();

  if (dates.length < 2) return { avgDays: 0, recommendedDays: optimalDays, sessions: dates.length };

  // Compute intervals between consecutive sessions (in days)
  const intervals: number[] = [];
  for (let i = 0; i < dates.length - 1; i++) {
    const d1 = new Date(dates[i + 1]);
    const d2 = new Date(dates[i]);
    const diffMs = d2.getTime() - d1.getTime();
    const diffDays = Math.round(diffMs / 86400000);
    intervals.push(diffDays);
  }

  // Use last 6 intervals (last 7 sessions) for average
  const recentIntervals = intervals.slice(0, 6);
  const avgDays = recentIntervals.reduce((a, b) => a + b, 0) / recentIntervals.length;
  return {
    avgDays: Math.round(avgDays * 10) / 10,
    recommendedDays: optimalDays,
    sessions: dates.length,
  };
}

// F208 — Get average rest time for a specific exercise (last 30 days)
export function getExerciseRestTimeAvg(db: any, exerciseId: string): number {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const stmt = db.prepare(`
    SELECT AVG(ws.rest_time) as avg_rest
    FROM workout_sets ws
    JOIN workouts w ON w.id = ws.workout_id
    WHERE ws.exercise_id = ?
      AND w.finished_at IS NOT NULL
      AND ws.rest_time > 0
      AND w.started_at >= ?
  `);
  stmt.bind([exerciseId, thirtyDaysAgo.toISOString()]);
  let avg = 0;
  if (stmt.step()) {
    const row = stmt.getAsObject() as { avg_rest: number | null };
    avg = row.avg_rest ? Math.round(row.avg_rest) : 0;
  }
  stmt.free();
  return avg;
}

// F232 — Batch get average rest time per exercise: single query for all active workout exercises.
// Returns Map<exerciseId, avgRestSeconds> — only entries with > 0 rest_time data.
export function getExerciseRestTimeAvgBatch(db: any, exerciseIds: string[]): Map<string, number> {
  const result = new Map<string, number>();
  if (exerciseIds.length === 0) return result;
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const placeholders = exerciseIds.map(() => '?').join(',');
  const stmt = db.prepare(`
    SELECT ws.exercise_id, AVG(ws.rest_time) as avg_rest
    FROM workout_sets ws
    JOIN workouts w ON w.id = ws.workout_id
    WHERE ws.exercise_id IN (${placeholders})
      AND w.finished_at IS NOT NULL
      AND ws.rest_time > 0
      AND w.started_at >= ?
    GROUP BY ws.exercise_id
  `);
  stmt.bind([...exerciseIds, thirtyDaysAgo.toISOString()]);
  while (stmt.step()) {
    const row = stmt.getAsObject() as { exercise_id: string; avg_rest: number | null };
    if (row.avg_rest != null && row.avg_rest > 0) {
      result.set(row.exercise_id, Math.round(row.avg_rest));
    }
  }
  stmt.free();
  return result;
}

// F267 — Get the personal best (minimum) rest time for an exercise in the last 30 days.
// Lower rest times are better (efficiency), so this tracks the quickest recovery.
export function getExerciseBestRestTime(db: any, exerciseId: string): number {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const stmt = db.prepare(`
    SELECT MIN(ws.rest_time) as best_rest
    FROM workout_sets ws
    JOIN workouts w ON w.id = ws.workout_id
    WHERE ws.exercise_id = ?
      AND w.finished_at IS NOT NULL
      AND ws.rest_time > 0
      AND w.started_at >= ?
  `);
  stmt.bind([exerciseId, thirtyDaysAgo.toISOString()]);
  let best = 0;
  if (stmt.step()) {
    const row = stmt.getAsObject() as { best_rest: number | null };
    best = row.best_rest ?? 0;
  }
  stmt.free();
  return best;
}

// F267 — Batch version: get best (minimum) rest time for multiple exercises in one query
export function getExerciseBestRestTimeBatch(db: any, exerciseIds: string[]): Map<string, number> {
  const result = new Map<string, number>();
  if (exerciseIds.length === 0) return result;
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const placeholders = exerciseIds.map(() => '?').join(',');
  const stmt = db.prepare(`
    SELECT ws.exercise_id, MIN(ws.rest_time) as best_rest
    FROM workout_sets ws
    JOIN workouts w ON w.id = ws.workout_id
    WHERE ws.exercise_id IN (${placeholders})
      AND w.finished_at IS NOT NULL
      AND ws.rest_time > 0
      AND w.started_at >= ?
    GROUP BY ws.exercise_id
  `);
  stmt.bind([...exerciseIds, thirtyDaysAgo.toISOString()]);
  while (stmt.step()) {
    const row = stmt.getAsObject() as { exercise_id: string; best_rest: number };
    result.set(row.exercise_id, row.best_rest);
  }
  stmt.free();
  return result;
}

// F238 — Rest time distribution: individual rest times bucketed for histogram (last 30 days)
export function getRestTimeDistribution(db: any, bucketSize = 30, days = 30): { bucket: number; label: string; count: number }[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const stmt = db.prepare(`
    SELECT rest_time
    FROM workout_sets ws
    JOIN workouts w ON w.id = ws.workout_id
    WHERE ws.rest_time > 0
      AND w.finished_at IS NOT NULL
      AND w.started_at >= ?
    ORDER BY rest_time ASC
  `);
  stmt.bind([cutoff.toISOString()]);
  const times: number[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as { rest_time: number };
    if (row.rest_time > 0) times.push(row.rest_time);
  }
  stmt.free();
  if (times.length === 0) return [];

  // Build buckets: 0-bucketSize, bucketSize-2*bucketSize, ...
  // Guard with length check to prevent TypeError on large arrays (F199 pattern)
  const max = times.length > 0 ? Math.max.apply(null, times) : 0;
  const buckets: Map<number, number> = new Map();
  for (let t = bucketSize; t <= max + bucketSize; t += bucketSize) {
    buckets.set(t, 0);
  }
  for (const t of times) {
    const b = Math.ceil(t / bucketSize) * bucketSize;
    buckets.set(b, (buckets.get(b) ?? 0) + 1);
  }
  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([bucket, count]) => ({
      bucket,
      label: `${bucket - bucketSize + 1}-${bucket}s`,
      count,
    }));
}

// F180 — Batch get difficulty for all exercises (returns Map<exerciseId, difficulty>)
export function getAllExerciseDifficulties(db: any): Map<string, number> {
  const result = new Map<string, number>();
  const stmt = db.prepare('SELECT exercise_id, difficulty FROM exercise_difficulty');
  while (stmt.step()) {
    const row = stmt.getAsObject() as { exercise_id: string; difficulty: number };
    result.set(row.exercise_id, row.difficulty ?? 0);
  }
  stmt.free();
  return result;
}

// F288 — Record-returning variant of getAllExerciseDifficulties (eliminates Object.fromEntries in ExercisesPage)
export function getAllExerciseDifficultiesMap(db: any): Record<string, number> {
  const m = getAllExerciseDifficulties(db);
  const r: Record<string, number> = {};
  m.forEach((v: any, k: any) => { r[k] = v; });
  return r;
}


// F251 — Batch get last-worked date per muscle group (for muscle recovery traffic light in ExercisesPage)
// Returns a Map of muscle_group -> ISO date string of most recent workout containing that muscle group
export function getMuscleLastWorkedBatch(db: any): Map<string, string> {
  const result = new Map<string, string>();
  const stmt = db.prepare(`
    SELECT e.muscle_group, MAX(w.started_at) as last_worked
    FROM workout_sets ws
    JOIN workouts w ON w.id = ws.workout_id
    JOIN exercises e ON e.id = ws.exercise_id
    WHERE w.finished_at IS NOT NULL
      AND ws.set_type = 'normal'
    GROUP BY e.muscle_group
  `);
  while (stmt.step()) {
    const row = stmt.getAsObject() as { muscle_group: string; last_worked: string };
    if (row.last_worked) {
      result.set(row.muscle_group, row.last_worked);
    }
  }
  stmt.free();
  return result;
}

// F306 — Batch load PR max_weight per exercise in a single query for all exercises
// Returns Record<exercise_id, max_weight>
export function getExercisePRMapAll(db: any): Record<string, number> {
  const result: Record<string, number> = {};
  const stmt = db.prepare(`
    SELECT ws.exercise_id, MAX(ws.weight) as max_w
    FROM workout_sets ws
    JOIN workouts w ON w.id = ws.workout_id
    WHERE ws.weight > 0 AND ws.set_type = 'normal'
      AND w.finished_at IS NOT NULL
    GROUP BY ws.exercise_id
  `);
  while (stmt.step()) {
    const row = stmt.getAsObject() as { exercise_id: string; max_w: number };
    if (row.max_w && row.max_w > 0) {
      result[row.exercise_id] = row.max_w;
    }
  }
  stmt.free();
  return result;
}
