// Tipos principales de la aplicación

export interface Exercise {
  id: string;
  name: string;
  muscle_group: MuscleGroup;
  secondary_muscles: MuscleGroup[];
  equipment: Equipment;
  is_custom: boolean;
  is_favorite: boolean;
  created_at: string;
}

export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'legs'
  | 'shoulders'
  | 'arms'
  | 'core'
  | 'cardio'
  | 'full_body';

export type Equipment =
  | 'barbell'
  | 'dumbbell'
  | 'machine'
  | 'cable'
  | 'bodyweight'
  | 'kettlebell'
  | 'bands'
  | 'other';

export type SetType = 'warmup' | 'normal' | 'drop' | 'failure' | 'superset';

export interface WorkoutSet {
  id: string;
  workout_id: string;
  exercise_id: string;
  set_number: number;
  set_type: SetType;
  reps: number;
  weight: number;
  rpe: number | null;
  notes: string;
  completed_at: string;
  rest_time?: number;
}

export interface Workout {
  id: string;
  routine_id: string | null;
  name: string;
  started_at: string;
  finished_at: string | null;
  duration_seconds: number | null;
  notes: string;
  tags?: string[];
  is_public: boolean;
  rating?: number; // F189 — 1-5 star rating
  intensity?: string | null; // F245 — 'Intensa' | 'Moderada' | 'Ligera' | null (persisted from F193 computation)
}

export interface RoutineExercise {
  id: string;
  routine_id: string;
  exercise_id: string;
  order_index: number;
  target_sets: number;
  target_reps: string;
  target_weight: number | null;
  target_rpe: number | null;
  rest_seconds: number;
  target_reps_override: number | null;
}

export interface Routine {
  id: string;
  name: string;
  description: string;
  estimated_duration_minutes: number | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  exercises?: RoutineExercise[];
}

export interface PersonalRecord {
  id: string;
  exercise_id: string;
  type: 'max_weight' | 'max_volume' | 'max_reps' | 'estimated_1rm';
  value: number;
  achieved_at: string;
  workout_id: string;
}

export interface ActiveWorkoutExercise {
  exercise_id: string;
  exercise_name: string;
  notes: string;
  sets: ActiveSet[];
  rest_seconds?: number; // F146 — per-exercise rest duration from routine
}

export interface ActiveSet {
  id: string;
  set_number: number;
  set_type: SetType;
  reps: number;
  weight: number;
  rpe: number | null;
  notes: string;
  completed: boolean;
  rest_time?: number;
}

export interface WorkoutSummary {
  id: string;
  name: string;
  date: string;
  duration_seconds: number;
  exercise_count: number;
  total_volume: number;
}
