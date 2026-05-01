// Base de datos SQLite con sql.js — 100% local, 100% offline

import initSqlJs from 'sql.js';
import type { Database } from 'sql.js';
import { getExercisesSeedData } from '../data/exercises_seed';

let db: Database | null = null;

export async function initDatabase(): Promise<Database> {
  if (db) return db;

  const SQL = await initSqlJs({
    locateFile: () => `/sql-wasm.wasm`,
  });

  // Intentar cargar desde localStorage
  const saved = localStorage.getItem('hevy_db');
  if (saved) {
    try {
      const binary = atob(saved);
      const data = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        data[i] = binary.charCodeAt(i);
      }
      db = new SQL.Database(data);
    } catch {
      db = new SQL.Database();
      createSchema(db);
      seedExercises(db);
    }
  } else {
    db = new SQL.Database();
    createSchema(db);
    seedExercises(db);
  }

  // Ejecutar migraciones defensivas también en BD existente (tablas que faltaban)
  runDefensiveMigrations(db);

  // Auto-guardar cada 2 segundos si hay cambios
  let pending = false;
  const save = () => {
    if (db && pending) {
      const data = db.export();
      // Chunked to avoid "Maximum call stack size exceeded" with large data
      const chunkSize = 8192;
      let binary = '';
      for (let i = 0; i < data.length; i += chunkSize) {
        binary += String.fromCharCode(...data.slice(i, i + chunkSize));
      }
      localStorage.setItem('hevy_db', btoa(binary));
      pending = false;
    }
  };

  setInterval(save, 2000);

  // Interceptar run() para marcar cambios pendientes
  const origRun = db.run.bind(db);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wrappedRun = (sql: string, params?: any) => {
    try {
      origRun(sql, params);
      pending = true;
    } catch (err) {
      // Still mark pending so save is retried; original error propagates
      pending = true;
      throw err;
    }
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (db as any).run = wrappedRun;

  return db;
}

function createSchema(database: Database) {
  database.run(`
    CREATE TABLE IF NOT EXISTS exercises (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      muscle_group TEXT NOT NULL,
      secondary_muscles TEXT DEFAULT '[]',
      equipment TEXT DEFAULT 'other',
      is_custom INTEGER DEFAULT 0,
      is_favorite INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS routines (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      estimated_duration_minutes INTEGER,
      is_public INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS routine_exercises (
      id TEXT PRIMARY KEY,
      routine_id TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      target_sets INTEGER DEFAULT 3,
      target_reps TEXT DEFAULT '10',
      target_weight REAL,
      rest_seconds INTEGER DEFAULT 90,
      FOREIGN KEY (routine_id) REFERENCES routines(id) ON DELETE CASCADE,
      FOREIGN KEY (exercise_id) REFERENCES exercises(id)
    );

    CREATE TABLE IF NOT EXISTS workouts (
      id TEXT PRIMARY KEY,
      routine_id TEXT,
      name TEXT NOT NULL DEFAULT 'Workout',
      started_at TEXT NOT NULL,
      finished_at TEXT,
      duration_seconds INTEGER,
      notes TEXT DEFAULT '',
      is_public INTEGER DEFAULT 0,
      FOREIGN KEY (routine_id) REFERENCES routines(id)
    );

    CREATE TABLE IF NOT EXISTS workout_sets (
      id TEXT PRIMARY KEY,
      workout_id TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      set_number INTEGER NOT NULL,
      set_type TEXT DEFAULT 'normal',
      reps INTEGER NOT NULL,
      weight REAL DEFAULT 0,
      rpe REAL,
      notes TEXT DEFAULT '',
      completed_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (workout_id) REFERENCES workouts(id) ON DELETE CASCADE,
      FOREIGN KEY (exercise_id) REFERENCES exercises(id)
    );

    CREATE TABLE IF NOT EXISTS personal_records (
      id TEXT PRIMARY KEY,
      exercise_id TEXT NOT NULL,
      type TEXT NOT NULL,
      value REAL NOT NULL,
      achieved_at TEXT NOT NULL,
      workout_id TEXT,
      FOREIGN KEY (exercise_id) REFERENCES exercises(id),
      FOREIGN KEY (workout_id) REFERENCES workouts(id)
    );

    CREATE INDEX IF NOT EXISTS idx_workout_sets_workout ON workout_sets(workout_id);
    CREATE INDEX IF NOT EXISTS idx_workout_sets_exercise ON workout_sets(exercise_id);
    CREATE INDEX IF NOT EXISTS idx_workouts_started ON workouts(started_at);
    CREATE INDEX IF NOT EXISTS idx_personal_records_exercise ON personal_records(exercise_id);

    CREATE TABLE IF NOT EXISTS workout_exercises (
      workout_id TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      notes TEXT DEFAULT '',
      PRIMARY KEY (workout_id, exercise_id)
    );
  `);

  // Migración: añadir columna notes a workout_sets si no existe
  try {
    database.run("ALTER TABLE workout_sets ADD COLUMN notes TEXT DEFAULT ''");
  } catch {
    // Columna ya existe, ignorar
  }

  // Migración: crear tabla workout_exercises si no existe
  try {
    database.run(`
    CREATE TABLE IF NOT EXISTS workout_exercises (
      workout_id TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      notes TEXT DEFAULT '',
      order_index INTEGER DEFAULT 0,
      PRIMARY KEY (workout_id, exercise_id)
    );

    CREATE TABLE IF NOT EXISTS body_weight (
      id TEXT PRIMARY KEY,
      weight REAL NOT NULL,
      recorded_at TEXT NOT NULL
    );
  `);
  } catch {
    // Tabla ya existe, ignorar
  }

  // Migración: añadir order_index a workout_exercises si no existe
  try {
    database.run("ALTER TABLE workout_exercises ADD COLUMN order_index INTEGER DEFAULT 0");
  } catch {
    // Columna ya existe, ignorar
  }

  // Migración: añadir group_id a workout_exercises para super-series
  try {
    database.run("ALTER TABLE workout_exercises ADD COLUMN group_id TEXT DEFAULT ''");
  } catch {
    // Columna ya existe, ignorar
  }

  // Migración: añadir tags a workouts
  try {
    database.run("ALTER TABLE workouts ADD COLUMN tags TEXT DEFAULT '[]'");
  } catch {
    // Columna ya existe, ignorar
  }

  // Migración: añadir is_public a routines
  try {
    database.run("ALTER TABLE routines ADD COLUMN is_public INTEGER DEFAULT 0");
  } catch {
    // Columna ya existe, ignorar
  }

  // Migración: añadir target_rpe a routine_exercises (F67)
  try {
    database.run("ALTER TABLE routine_exercises ADD COLUMN target_rpe INTEGER DEFAULT NULL");
  } catch {
    // Columna ya existe, ignorar
  }

  // Migración: crear body_measurements (F7)
  try {
    database.run(`
      CREATE TABLE IF NOT EXISTS body_measurements (
        id TEXT PRIMARY KEY,
        body_part TEXT NOT NULL,
        value REAL NOT NULL,
        recorded_at TEXT NOT NULL
      )
    `);
  } catch {
    // Tabla ya existe, ignorar
  }

  // Migración: añadir rest_time a workout_sets
  try {
    database.run("ALTER TABLE workout_sets ADD COLUMN rest_time INTEGER DEFAULT 0");
  } catch {
    // Columna ya existe, ignorar
  }

  // Migración: añadir photo y notes a body_weight (F3 — tracking con fotos)
  try {
    database.run("ALTER TABLE body_weight ADD COLUMN photo TEXT DEFAULT NULL");
  } catch {
    // Columna ya existe, ignorar
  }
  try {
    database.run("ALTER TABLE body_weight ADD COLUMN notes TEXT DEFAULT ''");
  } catch {
    // Columna ya existe, ignorar
  }

  // Migration: target_reps_override column (planned F83 — not yet wired to UI)
  try {
    database.run("ALTER TABLE routine_exercises ADD COLUMN target_reps_override INTEGER DEFAULT NULL");
  } catch {
    // Columna ya existe, ignorar
  }

  // F180 — Exercise difficulty rating table
  try {
    database.run(`
      CREATE TABLE IF NOT EXISTS exercise_difficulty (
        exercise_id TEXT PRIMARY KEY,
        difficulty INTEGER DEFAULT 0,
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
      )
    `);
  } catch {
    // Tabla ya existe, ignorar
  }

  // MIGRACIONES DEFENSIVAS — se ejecutan siempre por si la BD ya existía
  // Crear body_measurements (F7) si no existe
  try {
    database.run(`
      CREATE TABLE IF NOT EXISTS body_measurements (
        id TEXT PRIMARY KEY,
        body_part TEXT NOT NULL,
        value REAL NOT NULL,
        recorded_at TEXT NOT NULL
      )
    `);
  } catch {
    // Tabla ya existe, ignorar
  }

  // Crear body_weight si no existe (por bug en migraciones antiguas)
  try {
    database.run(`
      CREATE TABLE IF NOT EXISTS body_weight (
        id TEXT PRIMARY KEY,
        weight REAL NOT NULL,
        recorded_at TEXT NOT NULL,
        photo TEXT DEFAULT NULL,
        notes TEXT DEFAULT ''
      )
    `);
  } catch {
    // Tabla ya existe, ignorar
  }

  // Añadir columnas photo y notes a body_weight si no existen
  try {
    database.run("ALTER TABLE body_weight ADD COLUMN photo TEXT DEFAULT NULL");
  } catch {
    // Columna ya existe, ignorar
  }
  try {
    database.run("ALTER TABLE body_weight ADD COLUMN notes TEXT DEFAULT ''");
  } catch {
    // Columna ya existe, ignorar
  }
}

function runDefensiveMigrations(database: Database) {
  // Misma lógica que las migraciones defensivas de createSchema
  // pero separada para ejecutarse también en BD ya existente
  try {
    database.run(`
      CREATE TABLE IF NOT EXISTS body_measurements (
        id TEXT PRIMARY KEY,
        body_part TEXT NOT NULL,
        value REAL NOT NULL,
        recorded_at TEXT NOT NULL
      )
    `);
  } catch {
    // Tabla ya existe, ignorar
  }

  try {
    database.run(`
      CREATE TABLE IF NOT EXISTS body_weight (
        id TEXT PRIMARY KEY,
        weight REAL NOT NULL,
        recorded_at TEXT NOT NULL,
        photo TEXT DEFAULT NULL,
        notes TEXT DEFAULT ''
      )
    `);
  } catch {
    // Tabla ya existe, ignorar
  }

  try {
    database.run("ALTER TABLE body_weight ADD COLUMN photo TEXT DEFAULT NULL");
  } catch {
    // Columna ya existe, ignorar
  }
  try {
    database.run("ALTER TABLE body_weight ADD COLUMN notes TEXT DEFAULT ''");
  } catch {
    // Columna ya existe, ignorar
  }

  // Añadir target_rpe a routine_exercises (F67)
  try {
    database.run("ALTER TABLE routine_exercises ADD COLUMN target_rpe INTEGER DEFAULT NULL");
  } catch {
    // Columna ya existe, ignorar
  }

  // Añadir rest_time a workout_sets si no existe
  try {
    database.run("ALTER TABLE workout_sets ADD COLUMN rest_time INTEGER DEFAULT 0");
  } catch {
    // Columna ya existe, ignorar
  }

  // Añadir order_index a workout_exercises si no existe
  try {
    database.run("ALTER TABLE workout_exercises ADD COLUMN order_index INTEGER DEFAULT 0");
  } catch {
    // Columna ya existe, ignorar
  }

  // Añadir group_id a workout_exercises si no existe
  try {
    database.run("ALTER TABLE workout_exercises ADD COLUMN group_id TEXT DEFAULT ''");
  } catch {
    // Columna ya existe, ignorar
  }

  // F189 — Añadir rating a workouts si no existe
  try {
    database.run("ALTER TABLE workouts ADD COLUMN rating INTEGER DEFAULT 0");
  } catch {
    // Columna ya existe, ignorar
  }

  // F245 — Añadir intensity a workouts si no existe
  try {
    database.run("ALTER TABLE workouts ADD COLUMN intensity TEXT DEFAULT NULL");
  } catch {
    // Columna ya existe, ignorar
  }
}

function seedExercises(database: Database) {
  const exercises = getExercisesSeedData();
  // Use INSERT OR IGNORE so this is idempotent — safe to call on already-seeded DB
  const stmt = database.prepare(
    'INSERT OR IGNORE INTO exercises (id, name, muscle_group, secondary_muscles, equipment) VALUES (?, ?, ?, ?, ?)'
  );

  for (const ex of exercises) {
    stmt.run([ex.id, ex.name, ex.muscle_group, JSON.stringify(ex.secondary_muscles), ex.equipment]);
  }
  stmt.free();
}

export function getDb(): Database | null {
  return db;
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
