// Store de Zustand — workouts activos y datos

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ActiveWorkoutExercise, ActiveSet, SetType } from '../types';
import { generateId, getDb } from '../database/init';
import { updateWorkoutExerciseGroup } from '../database/mutations';
import { useSettingsStore } from './settingsStore';

interface WorkoutState {
    // Workout activo
    activeWorkout: {
    id: string;
    name: string;
    notes: string;
    tags: string[];
    startedAt: string;
    routineId: string | null;
    exercises: ActiveWorkoutExercise[];
    superSets: string[][]; // grupos de exercise_ids en superserie
    // Timer control
    pausedAt: string | null; // ISO timestamp when paused, null = running
    totalPausedSeconds: number; // acumulado de segundos en pausa
  } | null;

  // Timer de descanso
  restTimeRemaining: number;
  restActive: boolean;
  restDuration: number;

  // Tracking tiempo de descanso entre sets
  lastSetCompletedAt: number | null;
  // F267 — Exercise that just completed a set (used to show best rest time in RestTimer)
  lastExerciseIdForRest: string | null;

  // Acciones
  startWorkout: (name?: string, routineId?: string | null) => void;
  endWorkout: () => { id: string; name: string; notes: string; startedAt: string; exercises: ActiveWorkoutExercise[]; superSets: string[][] } | null;
  cancelWorkout: () => void;
  setWorkoutNotes: (notes: string) => void;
  setWorkoutTags: (tags: string[]) => void;
  pauseWorkout: () => void;
  resumeWorkout: () => void;
  editWorkoutTime: (newStartedAt: string) => void;
  addExerciseToWorkout: (exerciseId: string, exerciseName: string, sets?: number, lastSets?: { reps: number; weight: number; set_type: SetType }[], lastNotes?: string, restSeconds?: number) => void;
  removeExerciseFromWorkout: (exerciseId: string) => void;
  swapExerciseInWorkout: (oldExerciseId: string, newExerciseId: string, newExerciseName: string) => void;
  reorderExercises: (fromIndex: number, toIndex: number) => void;
  setExerciseNotes: (exerciseId: string, notes: string) => void;

  addSet: (exerciseId: string) => void;
  updateSet: (exerciseId: string, setId: string, data: Partial<ActiveSet>) => void;
  addSetsToExercise: (exerciseId: string, newSets: ActiveSet[]) => void;
  updateSetType: (exerciseId: string, setId: string, type: SetType) => void;
  updateSetRPE: (exerciseId: string, setId: string, rpe: number | null) => void;
  removeSet: (exerciseId: string, setId: string) => void;
  completeSet: (exerciseId: string, setId: string) => void;
  setSetNotes: (exerciseId: string, setId: string, notes: string) => void;

  // Super-series
  startSuperSet: (exerciseId: string) => void;
  addToSuperSet: (exerciseId: string) => void;
  endSuperSet: () => void;
  removeFromSuperSet: (exerciseId: string) => void;
  persistSuperSets: (workoutId: string) => void;

  // Timer descanso
  startRest: (duration?: number) => void;
  stopRest: () => void;
  tickRest: () => void;
  setRestDuration: (seconds: number) => void;
}

export const useWorkoutStore = create<WorkoutState>()(
  persist(
    (set, get) => ({
      activeWorkout: null,

      // Timer de descanso
      restTimeRemaining: 0,
      restActive: false,
      restDuration: 90,
      lastSetCompletedAt: null,
      lastExerciseIdForRest: null,

      startWorkout: (name = 'Workout', routineId = null) => {
        set({
          activeWorkout: {
            id: generateId(),
            name,
            notes: '',
            tags: [],
            startedAt: new Date().toISOString(),
            routineId,
            exercises: [],
            superSets: [],
            pausedAt: null,
            totalPausedSeconds: 0,
          },
          lastSetCompletedAt: null,
          lastExerciseIdForRest: null,
        });
      },

      endWorkout: () => {
        const w = get().activeWorkout;
        set({ activeWorkout: null, lastSetCompletedAt: null, lastExerciseIdForRest: null });
        return w;
      },

      cancelWorkout: () => set({ activeWorkout: null, lastSetCompletedAt: null, lastExerciseIdForRest: null }),

      setWorkoutNotes: (notes) => {
        const workout = get().activeWorkout;
        if (!workout) return;
        set({ activeWorkout: { ...workout, notes } });
      },

      setWorkoutTags: (tags) => {
        const workout = get().activeWorkout;
        if (!workout) return;
        set({ activeWorkout: { ...workout, tags } });
      },

      pauseWorkout: () => {
        const workout = get().activeWorkout;
        if (!workout || workout.pausedAt) return; // already paused
        set({ activeWorkout: { ...workout, pausedAt: new Date().toISOString() } });
      },

      resumeWorkout: () => {
        const workout = get().activeWorkout;
        if (!workout || !workout.pausedAt) return; // not paused
        const pausedDuration = Math.round(
          (Date.now() - new Date(workout.pausedAt).getTime()) / 1000
        );
        set({
          activeWorkout: {
            ...workout,
            pausedAt: null,
            totalPausedSeconds: workout.totalPausedSeconds + pausedDuration,
          },
        });
      },

      editWorkoutTime: (newStartedAt) => {
        const workout = get().activeWorkout;
        if (!workout) return;
        // totalPausedSeconds stays the same; only startedAt changes
        set({ activeWorkout: { ...workout, startedAt: newStartedAt } });
      },

      addExerciseToWorkout: (exerciseId, exerciseName, sets = 3, lastSets, lastNotes, restSeconds?: number) => {
        const workout = get().activeWorkout;
        if (!workout) return;
        if (workout.exercises.find(e => e.exercise_id === exerciseId)) return;

        const newSets: ActiveSet[] = Array.from({ length: sets }, (_, i) => {
          // Use last workout data if available, otherwise defaults
          const last = lastSets && lastSets[i];
          return {
            id: generateId(),
            set_number: i + 1,
            set_type: last?.set_type || 'normal' as SetType,
            reps: last?.reps ?? 10,
            weight: last?.weight ?? 0,
            rpe: null,
            notes: '',
            completed: false,
          };
        });

        set({
          activeWorkout: {
            ...workout,
            exercises: [
              ...workout.exercises,
              { exercise_id: exerciseId, exercise_name: exerciseName, notes: lastNotes || '', sets: newSets, rest_seconds: restSeconds },
            ],
          },
        });
      },

      removeExerciseFromWorkout: (exerciseId) => {
        const workout = get().activeWorkout;
        if (!workout) return;
        set({
          activeWorkout: {
            ...workout,
            exercises: workout.exercises.filter(e => e.exercise_id !== exerciseId),
          },
        });
      },

      // F246 — Swap exercise with equipment variant, preserving set structure
      swapExerciseInWorkout: (oldExerciseId, newExerciseId, newExerciseName) => {
        const workout = get().activeWorkout;
        if (!workout) return;
        set({
          activeWorkout: {
            ...workout,
            exercises: workout.exercises.map(e =>
              e.exercise_id === oldExerciseId
                ? { ...e, exercise_id: newExerciseId, exercise_name: newExerciseName }
                : e
            ),
          },
        });
      },

      reorderExercises: (fromIndex, toIndex) => {
        const workout = get().activeWorkout;
        if (!workout) return;
        const exercises = [...workout.exercises];
        const [removed] = exercises.splice(fromIndex, 1);
        exercises.splice(toIndex, 0, removed);
        set({ activeWorkout: { ...workout, exercises } });
      },

      setExerciseNotes: (exerciseId, notes) => {
        const workout = get().activeWorkout;
        if (!workout) return;
        set({
          activeWorkout: {
            ...workout,
            exercises: workout.exercises.map(e =>
              e.exercise_id === exerciseId ? { ...e, notes } : e
            ),
          },
        });
      },

      addSet: (exerciseId) => {
        const workout = get().activeWorkout;
        if (!workout) return;
        set({
          activeWorkout: {
            ...workout,
            exercises: workout.exercises.map(e => {
              if (e.exercise_id !== exerciseId) return e;
              const lastSet = e.sets[e.sets.length - 1];
              const newSet: ActiveSet = {
                id: generateId(),
                set_number: e.sets.length + 1,
                set_type: lastSet?.set_type || 'normal',
                reps: lastSet?.reps || 10,
                weight: lastSet?.weight || 0,
                rpe: null,
                notes: '',
                completed: false,
              };
              return { ...e, sets: [...e.sets, newSet] };
            }),
          },
        });
      },

      updateSet: (exerciseId, setId, data) => {
        const workout = get().activeWorkout;
        if (!workout) return;
        set({
          activeWorkout: {
            ...workout,
            exercises: workout.exercises.map(e => {
              if (e.exercise_id !== exerciseId) return e;
              return {
                ...e,
                sets: e.sets.map(s => s.id === setId ? { ...s, ...data } : s),
              };
            }),
          },
        });
      },

      // F253 — Add warmup sets to an exercise in the active workout
      addSetsToExercise: (exerciseId: string, newSets: ActiveSet[]) => {
        const workout = get().activeWorkout;
        if (!workout) return;
        set({
          activeWorkout: {
            ...workout,
            exercises: workout.exercises.map(e => {
              if (e.exercise_id !== exerciseId) return e;
              return { ...e, sets: [...newSets, ...e.sets] };
            }),
          },
        });
      },

      updateSetType: (exerciseId, setId, set_type) => {
        const workout = get().activeWorkout;
        if (!workout) return;
        set({
          activeWorkout: {
            ...workout,
            exercises: workout.exercises.map(e => {
              if (e.exercise_id !== exerciseId) return e;
              return {
                ...e,
                sets: e.sets.map(s => s.id === setId ? { ...s, set_type } : s),
              };
            }),
          },
        });
      },

      updateSetRPE: (exerciseId, setId, rpe) => {
        const workout = get().activeWorkout;
        if (!workout) return;
        set({
          activeWorkout: {
            ...workout,
            exercises: workout.exercises.map(e => {
              if (e.exercise_id !== exerciseId) return e;
              return {
                ...e,
                sets: e.sets.map(s => s.id === setId ? { ...s, rpe } : s),
              };
            }),
          },
        });
      },

      removeSet: (exerciseId, setId) => {
        const workout = get().activeWorkout;
        if (!workout) return;
        set({
          activeWorkout: {
            ...workout,
            exercises: workout.exercises.map(e => {
              if (e.exercise_id !== exerciseId) return e;
              const sets = e.sets.filter(s => s.id !== setId);
              return { ...e, sets: sets.map((s, i) => ({ ...s, set_number: i + 1 })) };
            }),
          },
        });
      },

      completeSet: (exerciseId, setId) => {
        const workout = get().activeWorkout;
        const lastCompleted = get().lastSetCompletedAt;
        const now = Date.now();
        const restTime = lastCompleted ? Math.round((now - lastCompleted) / 1000) : 0;

        if (!workout) return;

        // F146 — Find the per-exercise rest_seconds from the routine (if any)
        const exercise = workout.exercises.find(e => e.exercise_id === exerciseId);
        const perExerciseRest = exercise?.rest_seconds;

        set({
          activeWorkout: {
            ...workout,
            exercises: workout.exercises.map(e => {
              if (e.exercise_id !== exerciseId) return e;
              return {
                ...e,
                sets: e.sets.map(s => s.id === setId ? { ...s, completed: true, rest_time: restTime } : s),
              };
            }),
          },
          lastSetCompletedAt: now,
          lastExerciseIdForRest: exerciseId,
        });
        // Auto-start rest timer (only if enabled in settings)
        // F146 — Use per-exercise rest_seconds if available, otherwise global default
        if (useSettingsStore.getState().autoStartRest) {
          get().startRest(perExerciseRest);
        }
      },

      setSetNotes: (exerciseId, setId, notes) => {
        const workout = get().activeWorkout;
        if (!workout) return;
        set({
          activeWorkout: {
            ...workout,
            exercises: workout.exercises.map(e => {
              if (e.exercise_id !== exerciseId) return e;
              return {
                ...e,
                sets: e.sets.map(s => s.id === setId ? { ...s, notes } : s),
              };
            }),
          },
        });
      },

      // Super-series
      startSuperSet: (exerciseId) => {
        const workout = get().activeWorkout;
        if (!workout) return;
        // Start a new superset with this exercise
        set({
          activeWorkout: {
            ...workout,
            superSets: [...workout.superSets, [exerciseId]],
          },
        });
      },

      addToSuperSet: (exerciseId) => {
        const workout = get().activeWorkout;
        if (!workout) return;
        // Add to the last open superset (if any)
        const supersets = [...workout.superSets];
        if (supersets.length > 0) {
          const lastGroup = supersets[supersets.length - 1];
          if (!lastGroup.includes(exerciseId)) {
            supersets[supersets.length - 1] = [...lastGroup, exerciseId];
          }
        }
        set({ activeWorkout: { ...workout, superSets: supersets } });
      },

      endSuperSet: () => {
        // No-op: superset closes when user starts another or finishes
        const workout = get().activeWorkout;
        if (!workout) return;
        // Remove the last superset if it has only 1 member (incomplete)
        const supersets = [...workout.superSets];
        if (supersets.length > 0 && supersets[supersets.length - 1].length < 2) {
          supersets.pop();
        }
        set({ activeWorkout: { ...workout, superSets: supersets } });
      },

      removeFromSuperSet: (exerciseId) => {
        const workout = get().activeWorkout;
        if (!workout) return;
        // Persist to DB immediately to clear group_id
        const db = getDb();
        if (db) {
          updateWorkoutExerciseGroup(db, workout.id, exerciseId, '');
        }
        const supersets = workout.superSets
          .map(group => group.filter(id => id !== exerciseId))
          .filter(group => group.length >= 2);
        set({ activeWorkout: { ...workout, superSets: supersets } });
      },

      persistSuperSets: (workoutId) => {
        const workout = get().activeWorkout;
        if (!workout) return;
        const db = getDb();
        if (!db) return;
        // Assign group IDs: each superset group gets a unique ID
        workout.superSets.forEach((group, gi) => {
          const groupId = `ss_${gi}`;
          group.forEach(exId => {
            updateWorkoutExerciseGroup(db, workoutId, exId, groupId);
          });
        });
        // Clear group_id for exercises not in any superset
        workout.exercises.forEach(ex => {
          const inGroup = workout.superSets.some(g => g.includes(ex.exercise_id));
          if (!inGroup) {
            updateWorkoutExerciseGroup(db, workoutId, ex.exercise_id, '');
          }
        });
      },

      // Timer de descanso
      startRest: (duration) => {
        const d = duration ?? get().restDuration;
        set({ restActive: true, restTimeRemaining: d, restDuration: d });
      },

      stopRest: () => {
        set({ restActive: false, restTimeRemaining: 0 });
      },

      tickRest: () => {
        const { restTimeRemaining, restActive } = get();
        if (!restActive) return;
        if (restTimeRemaining <= 1) {
          set({ restActive: false, restTimeRemaining: 0 });
        } else {
          set({ restTimeRemaining: restTimeRemaining - 1 });
        }
      },

      setRestDuration: (seconds) => {
        set({ restDuration: seconds });
      },
    }),
    {
      name: 'hevy-workout',
    }
  )
);
