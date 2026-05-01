/* eslint-disable @typescript-eslint/no-explicit-any */
// mutations.ts — Guardar, actualizar y borrar datos

import type { ActiveWorkoutExercise } from '../types';
import { generateId } from './init';
import { calculate1RM } from './queries';

interface WorkoutInput {
  id: string;
  routine_id: string | null;
  name: string;
  started_at: string;
  finished_at: string;
  duration_seconds: number;
  notes: string;
  tags?: string[];
  rating?: number;
  intensity?: string | null; // F245 — 'Intensa' | 'Moderada' | 'Ligera' | null
  is_public: boolean;
  exercises: ActiveWorkoutExercise[];
  superSets?: string[][];
}

export function saveWorkout(db: any, workout: WorkoutInput) {
  db.run(
    `INSERT OR REPLACE INTO workouts (id, routine_id, name, started_at, finished_at, duration_seconds, notes, tags, rating, intensity, is_public)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [workout.id, workout.routine_id, workout.name, workout.started_at, workout.finished_at, workout.duration_seconds, workout.notes, JSON.stringify(workout.tags || []), workout.rating || 0, workout.intensity || null, workout.is_public ? 1 : 0]
  );

  // Delete existing sets for this workout (in case of replace)
  db.run('DELETE FROM workout_sets WHERE workout_id = ?', [workout.id]);

  // Build group_id map from superSets
  const groupIdMap: Record<string, string> = {};
  if (workout.superSets) {
    workout.superSets.forEach((group, gi) => {
      const groupId = `ss_${gi}`;
      group.forEach(exId => { groupIdMap[exId] = groupId; });
    });
  }

  // Save workout_exercises (notes + group_id per exercise in this workout)
  // Preserve order_index: exercises are already in correct order in workout.exercises array
  workout.exercises.forEach((ex, idx) => {
    db.run(
      `INSERT OR REPLACE INTO workout_exercises (workout_id, exercise_id, order_index, notes, group_id)
       VALUES (?, ?, ?, ?, ?)`,
      [workout.id, ex.exercise_id, idx, ex.notes || '', groupIdMap[ex.exercise_id] || '']
    );
  });

  for (const ex of workout.exercises) {
    for (const set of ex.sets) {
      if (set.completed) {
        db.run(
          `INSERT INTO workout_sets (id, workout_id, exercise_id, set_number, set_type, reps, weight, rpe, notes, completed_at, rest_time)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [set.id, workout.id, ex.exercise_id, set.set_number, set.set_type, set.reps, set.weight, set.rpe, set.notes || '', new Date().toISOString(), set.rest_time || 0]
        );
      }
    }
  }
}

export function updateWorkoutTags(db: any, workoutId: string, tags: string[]) {
  db.run('UPDATE workouts SET tags = ? WHERE id = ?', [JSON.stringify(tags), workoutId]);
}

export function updateWorkoutNotes(db: any, workoutId: string, notes: string) {
  db.run('UPDATE workouts SET notes = ? WHERE id = ?', [notes, workoutId]);
}

export function updateWorkoutSetNotes(db: any, setId: string, notes: string) {
  db.run('UPDATE workout_sets SET notes = ? WHERE id = ?', [notes, setId]);
}

export function updateWorkoutSetRPE(db: any, setId: string, rpe: number | null) {
  db.run('UPDATE workout_sets SET rpe = ? WHERE id = ?', [rpe, setId]);
}

export function updateWorkoutName(db: any, workoutId: string, name: string) {
  db.run('UPDATE workouts SET name = ? WHERE id = ?', [name, workoutId]);
}

export function updateWorkoutDate(db: any, workoutId: string, startedAt: string, finishedAt: string) {
  db.run('UPDATE workouts SET started_at = ?, finished_at = ? WHERE id = ?', [startedAt, finishedAt, workoutId]);
}

export function deleteWorkout(db: any, workoutId: string) {
  db.run('DELETE FROM workout_sets WHERE workout_id = ?', [workoutId]);
  db.run('DELETE FROM workout_exercises WHERE workout_id = ?', [workoutId]);
  db.run('DELETE FROM personal_records WHERE workout_id = ?', [workoutId]);
  db.run('DELETE FROM workouts WHERE id = ?', [workoutId]);
}

export function saveRoutine(db: any, routine: any) {
  db.run(
    `INSERT OR REPLACE INTO routines (id, name, description, estimated_duration_minutes, is_public, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [routine.id, routine.name, routine.description, routine.estimated_duration_minutes, routine.is_public ? 1 : 0, routine.created_at || new Date().toISOString(), new Date().toISOString()]
  );
}

export function saveRoutineExercise(db: any, routineExercise: any) {
  db.run(
    `INSERT OR REPLACE INTO routine_exercises (id, routine_id, exercise_id, order_index, target_sets, target_reps, target_weight, target_rpe, rest_seconds, target_reps_override)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [routineExercise.id, routineExercise.routine_id, routineExercise.exercise_id, routineExercise.order_index, routineExercise.target_sets, routineExercise.target_reps, routineExercise.target_weight, routineExercise.target_rpe ?? null, routineExercise.rest_seconds, routineExercise.target_reps_override ?? null]
  );
}

export function deleteRoutine(db: any, routineId: string) {
  db.run('DELETE FROM routine_exercises WHERE routine_id = ?', [routineId]);
  db.run('DELETE FROM routines WHERE id = ?', [routineId]);
}

export function removeExerciseFromWorkoutDb(db: any, workoutId: string, exerciseId: string) {
  db.run('DELETE FROM workout_sets WHERE workout_id = ? AND exercise_id = ?', [workoutId, exerciseId]);
  db.run('DELETE FROM workout_exercises WHERE workout_id = ? AND exercise_id = ?', [workoutId, exerciseId]);
}

export interface BackupData {
  version: number;
  exported_at: string;
  exercises: any[];
  routines: any[];
  routine_exercises: any[];
  workouts: any[];
  workout_exercises: any[];
  workout_sets: any[];
  body_weight: any[];
  body_measurements: any[];
  personal_records: any[];
}

export function exportAllData(db: any): BackupData {
  const exercises = db.exec('SELECT * FROM exercises');
  const routines = db.exec('SELECT * FROM routines');
  const routineExercises = db.exec('SELECT * FROM routine_exercises');
  const workouts = db.exec('SELECT * FROM workouts');
  const workoutExercises = db.exec('SELECT * FROM workout_exercises');
  const workoutSets = db.exec('SELECT * FROM workout_sets');
  const bodyWeight = db.exec('SELECT * FROM body_weight');
  const bodyMeasurements = db.exec('SELECT * FROM body_measurements');
  const personalRecords = db.exec('SELECT * FROM personal_records');

  const colMap = (result: any[]) => result.length
    ? result[0].values.map((row: any[]) => {
      const obj: any = {};
      result[0].columns.forEach((c: string, i: number) => { obj[c] = row[i]; });
      return obj;
    })
    : [];

  return {
    version: 1,
    exported_at: new Date().toISOString(),
    exercises: colMap(exercises),
    routines: colMap(routines),
    routine_exercises: colMap(routineExercises),
    workouts: colMap(workouts),
    workout_exercises: colMap(workoutExercises),
    workout_sets: colMap(workoutSets),
    body_weight: colMap(bodyWeight),
    body_measurements: colMap(bodyMeasurements),
    personal_records: colMap(personalRecords),
  };
}

export function importAllData(db: any, data: BackupData) {
  if (!data || data.version !== 1) throw new Error('Formato de backup no compatible');

  const tables = ['workout_sets', 'workout_exercises', 'routines', 'routine_exercises', 'exercises', 'workouts', 'body_weight', 'body_measurements', 'personal_records'] as const;

  // Clear existing data
  for (const table of tables) {
    db.run(`DELETE FROM ${table}`);
  }

  // Import exercises
  for (const ex of data.exercises || []) {
    db.run(
      `INSERT INTO exercises (id, name, muscle_group, secondary_muscles, equipment, is_custom, is_favorite, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [ex.id, ex.name, ex.muscle_group, JSON.stringify(ex.secondary_muscles || []), ex.equipment, ex.is_custom ? 1 : 0, ex.is_favorite ? 1 : 0, ex.created_at]
    );
  }

  // Import routines
  for (const r of data.routines || []) {
    db.run(
      `INSERT INTO routines (id, name, description, estimated_duration_minutes, is_public, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [r.id, r.name, r.description, r.estimated_duration_minutes, r.is_public ? 1 : 0, r.created_at, r.updated_at]
    );
  }

  // Import routine_exercises
  for (const re of data.routine_exercises || []) {
    db.run(
      `INSERT INTO routine_exercises (id, routine_id, exercise_id, order_index, target_sets, target_reps, target_weight, target_rpe, rest_seconds)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [re.id, re.routine_id, re.exercise_id, re.order_index, re.target_sets, re.target_reps, re.target_weight, re.target_rpe ?? null, re.rest_seconds]
    );
  }

  // Import workouts
  for (const w of data.workouts || []) {
    db.run(
      `INSERT INTO workouts (id, routine_id, name, started_at, finished_at, duration_seconds, notes, tags, rating, is_public)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [w.id, w.routine_id, w.name, w.started_at, w.finished_at, w.duration_seconds, w.notes, JSON.stringify(w.tags || []), w.rating || 0, w.is_public ? 1 : 0]
    );
  }

  // Import workout_exercises (including group_id for super-series)
  for (const we of data.workout_exercises || []) {
    db.run(
      `INSERT INTO workout_exercises (workout_id, exercise_id, order_index, notes, group_id)
       VALUES (?, ?, ?, ?, ?)`,
      [we.workout_id, we.exercise_id, we.order_index ?? 0, we.notes ?? '', we.group_id ?? '']
    );
  }

  // Import workout_sets
  for (const ws of data.workout_sets || []) {
    db.run(
      `INSERT INTO workout_sets (id, workout_id, exercise_id, set_number, set_type, reps, weight, rpe, notes, completed_at, rest_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [ws.id, ws.workout_id, ws.exercise_id, ws.set_number, ws.set_type, ws.reps, ws.weight, ws.rpe, ws.notes, ws.completed_at, ws.rest_time || 0]
    );
  }

  // Import body_weight (with photo + notes — F3)
  for (const bw of data.body_weight || []) {
    db.run(
      `INSERT OR REPLACE INTO body_weight (id, weight, recorded_at, photo, notes) VALUES (?, ?, ?, ?, ?)`,
      [bw.id, bw.weight, bw.recorded_at, bw.photo ?? null, bw.notes ?? '']
    );
  }

  // Import body_measurements (F50 — fixed backup bug)
  for (const bm of data.body_measurements || []) {
    db.run(
      `INSERT OR REPLACE INTO body_measurements (id, body_part, value, recorded_at) VALUES (?, ?, ?, ?)`,
      [bm.id, bm.body_part, bm.value, bm.recorded_at]
    );
  }

  // Import personal_records
  for (const pr of data.personal_records || []) {
    db.run(
      `INSERT OR REPLACE INTO personal_records (id, exercise_id, type, value, achieved_at, workout_id) VALUES (?, ?, ?, ?, ?, ?)`,
      [pr.id, pr.exercise_id, pr.type, pr.value, pr.achieved_at, pr.workout_id]
    );
  }
}

export function updateWorkoutRating(db: any, workoutId: string, rating: number) {
  db.run('UPDATE workouts SET rating = ? WHERE id = ?', [rating, workoutId]);
}

export function deleteExercise(db: any, exerciseId: string) {
  db.run('DELETE FROM workout_sets WHERE exercise_id = ?', [exerciseId]);
  db.run('DELETE FROM routine_exercises WHERE exercise_id = ?', [exerciseId]);
  db.run('DELETE FROM personal_records WHERE exercise_id = ?', [exerciseId]);
  db.run('DELETE FROM exercises WHERE id = ?', [exerciseId]);
}

export function saveExercise(db: any, exercise: any) {
  db.run(
    `INSERT OR REPLACE INTO exercises (id, name, muscle_group, secondary_muscles, equipment, is_custom, is_favorite, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [exercise.id, exercise.name, exercise.muscle_group, JSON.stringify(exercise.secondary_muscles || []), exercise.equipment, exercise.is_custom ? 1 : 0, exercise.is_favorite ? 1 : 0, exercise.created_at || new Date().toISOString()]
  );
}

export function setExerciseFavorite(db: any, exerciseId: string, isFavorite: boolean) {
  db.run('UPDATE exercises SET is_favorite = ? WHERE id = ?', [isFavorite ? 1 : 0, exerciseId]);
}

export function reorderRoutineExercises(db: any, _routineId: string, orderedIds: string[]) {
  orderedIds.forEach((id, index) => {
    db.run('UPDATE routine_exercises SET order_index = ? WHERE id = ?', [index, id]);
  });
}

export function reorderWorkoutExercises(db: any, workoutId: string, orderedExerciseIds: string[]) {
  orderedExerciseIds.forEach((exerciseId, index) => {
    db.run(
      'UPDATE workout_exercises SET order_index = ? WHERE workout_id = ? AND exercise_id = ?',
      [index, workoutId, exerciseId]
    );
    // If no row exists for this exercise, insert it
    const stmt = db.prepare('SELECT 1 FROM workout_exercises WHERE workout_id = ? AND exercise_id = ?');
    stmt.bind([workoutId, exerciseId]);
    if (!stmt.step()) {
      stmt.free();
      db.run(
        'INSERT INTO workout_exercises (workout_id, exercise_id, order_index) VALUES (?, ?, ?)',
        [workoutId, exerciseId, index]
      );
    } else {
      stmt.free();
    }
  });
}

export function updateWorkoutExerciseGroup(db: any, workoutId: string, exerciseId: string, groupId: string) {
  const stmt = db.prepare('SELECT 1 FROM workout_exercises WHERE workout_id = ? AND exercise_id = ?');
  stmt.bind([workoutId, exerciseId]);
  if (stmt.step()) {
    stmt.free();
    db.run(
      'UPDATE workout_exercises SET group_id = ? WHERE workout_id = ? AND exercise_id = ?',
      [groupId, workoutId, exerciseId]
    );
  } else {
    stmt.free();
    db.run(
      'INSERT INTO workout_exercises (workout_id, exercise_id, order_index, group_id) VALUES (?, ?, 0, ?)',
      [workoutId, exerciseId, groupId]
    );
  }
}

export function saveBodyWeight(db: any, id: string, weight: number, photo?: string | null, notes?: string) {
  db.run(
    `INSERT OR REPLACE INTO body_weight (id, weight, recorded_at, photo, notes) VALUES (?, ?, ?, ?, ?)`,
    [id, weight, new Date().toISOString(), photo ?? null, notes ?? '']
  );
}

export function deleteBodyWeight(db: any, id: string) {
  db.run('DELETE FROM body_weight WHERE id = ?', [id]);
}

export function saveBodyMeasurement(db: any, id: string, bodyPart: string, value: number) {
  db.run(
    `INSERT OR REPLACE INTO body_measurements (id, body_part, value, recorded_at) VALUES (?, ?, ?, ?)`,
    [id, bodyPart, value, new Date().toISOString()]
  );
}

export function deleteBodyMeasurement(db: any, id: string) {
  db.run('DELETE FROM body_measurements WHERE id = ?', [id]);
}

export type NewPR = {
  exerciseName: string;
  type: 'max_weight' | 'estimated_1rm';
  value: number;
};

export function checkAndSavePersonalRecords(db: any, workoutId: string, exercises: ActiveWorkoutExercise[], workoutDate: string): NewPR[] {
  const newPRs: NewPR[] = [];
  for (const ex of exercises) {
    for (const set of ex.sets) {
      if (!set.completed) continue;
      const weight = set.weight || 0;
      const reps = set.reps || 0;
      if (weight <= 0 || reps <= 0) continue;

      const estimated1RM = calculate1RM(weight, reps);

      // Check max weight PR
      const existingWeight = db.prepare(`
        SELECT value FROM personal_records
        WHERE exercise_id = ? AND type = 'max_weight'
        ORDER BY value DESC LIMIT 1
      `);
      existingWeight.bind([ex.exercise_id]);
      const hasWeightRow = existingWeight.step();
      const currentMaxWeight = hasWeightRow ? (existingWeight.getAsObject().value as number) : 0;
      existingWeight.free();

      if (weight > currentMaxWeight) {
        db.run(
          `INSERT INTO personal_records (id, exercise_id, type, value, achieved_at, workout_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [generateId(), ex.exercise_id, 'max_weight', weight, workoutDate, workoutId]
        );
        newPRs.push({ exerciseName: ex.exercise_name, type: 'max_weight', value: weight });
      }

      // Check estimated 1RM PR
      const existing1RM = db.prepare(`
        SELECT value FROM personal_records
        WHERE exercise_id = ? AND type = 'estimated_1rm'
        ORDER BY value DESC LIMIT 1
      `);
      existing1RM.bind([ex.exercise_id]);
      const has1RMRow = existing1RM.step();
      const currentMax1RM = has1RMRow ? (existing1RM.getAsObject().value as number) : 0;
      existing1RM.free();

      if (estimated1RM > currentMax1RM) {
        db.run(
          `INSERT INTO personal_records (id, exercise_id, type, value, achieved_at, workout_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [generateId(), ex.exercise_id, 'estimated_1rm', estimated1RM, workoutDate, workoutId]
        );
        newPRs.push({ exerciseName: ex.exercise_name, type: 'estimated_1rm', value: estimated1RM });
      }
    }
  }
  return newPRs;
}

// F180 — Save exercise difficulty rating (upsert)
export function saveExerciseDifficulty(db: any, exerciseId: string, difficulty: number) {
  db.run(
    `INSERT OR REPLACE INTO exercise_difficulty (exercise_id, difficulty, updated_at)
     VALUES (?, ?, datetime('now'))`,
    [exerciseId, difficulty]
  );
}
