import { useState, useEffect, useRef, useMemo } from 'react';
/* eslint-disable react-hooks/set-state-in-effect */
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Play, Plus, Clock, CheckCircle2, Trash2, MessageSquare, X, Calculator, Layers, Copy, Save, FileText, Award, Calendar, Pause, Edit2, Dumbbell, Trophy, GripVertical, Target, Search, GitCompare, Circle, ChevronDown, ChevronRight, Star } from 'lucide-react';
import RestTimer from '../components/RestTimer';
import PlateCalculator from '../components/PlateCalculator';
import CalendarView from '../components/CalendarView';
import { useWorkoutStore } from '../store/workoutStore';
import { useSettingsStore } from '../store/settingsStore';
import { getDb, generateId } from '../database/init';
import { getWorkouts, getRoutineById, getRoutineExercises, getLastExerciseSets, getWorkoutSets, getAllRoutines, searchExercises, getLastExerciseNotes, getWarmupSets, getLastExerciseSetsWithRpe, calculate1RM, getStreak, getRestTimeAnalytics, getRestTimeStatsBatch, getWorkoutSetsBatch, getMaxWeightForExerciseBatchAll, getAllPersonalRecords, getAllExerciseNamesAll, getExerciseRestTimeAvgBatch, getExercisesByIdsAll, getExercisePRMapAll, getWorkoutDatesLast7Days } from '../database/queries';
import { saveWorkout, saveRoutine, saveRoutineExercise, checkAndSavePersonalRecords, updateWorkoutTags, updateWorkoutNotes, updateWorkoutRating, updateWorkoutName } from '../database/mutations';
import { toastStore } from '../components/ui/toastStore';
import { format, differenceInSeconds } from 'date-fns';
import { getTimeOfDay, TIME_OF_DAY_LABELS, TIME_OF_DAY_COLORS, type TimeOfDay } from '../utils/dateUtils';
import { es } from 'date-fns/locale';
import type { Workout, Routine, RoutineExercise, ActiveSet, WorkoutSet, ActiveWorkoutExercise, Exercise, Equipment, SetType } from '../types';

type RoutineExerciseFull = RoutineExercise & { exercise_name: string; target_reps_override: number | null };

const SET_TYPE_LABELS: Record<SetType, string> = {
  normal: '',
  warmup: 'W',
  drop: 'D',
  failure: 'F',
  superset: 'S',
};

const SET_TYPE_COLORS: Record<SetType, string> = {
  normal: 'var(--color-text-2)',
  warmup: '#f59e0b',
  drop: '#8b5cf6',
  failure: '#ef4444',
  superset: '#10b981',
};

// F98 — Workout quality score: hoisted to module level to avoid recreation on every render
function computeQualityScore(sets: WorkoutSet[], volume: number, durationSec: number, avgVolume: number, sortedHistory: Workout[]): number {
  if (sets.length === 0) return 0;
  // RPE consistency score (0-50 points): lower variance = higher score
  const rpeSets = sets.filter((s: WorkoutSet) => s.rpe != null && s.rpe > 0);
  let rpeScore = 25; // neutral baseline if no RPE data
  if (rpeSets.length >= 3) {
    const rpes = rpeSets.map((s: WorkoutSet) => s.rpe as number);
    const mean = rpes.reduce((a: number, b: number) => a + b, 0) / rpes.length;
    const variance = rpes.reduce((a: number, r: number) => a + (r - mean) ** 2, 0) / rpes.length;
    // variance of 0 = perfect consistency = 50pts; variance of 4 (max) = 0pts
    rpeScore = Math.max(0, 50 - (variance * 12.5));
  } else if (rpeSets.length > 0) {
    rpeScore = 30; // partial credit for having some RPE data
  }
  // Volume efficiency score (0-50 points): kg per minute vs user average
  const volPerMin = durationSec > 0 ? (volume / durationSec) * 60 : 0;
  // Compare to overall avgVolume / avgDuration
  const avgDur = sortedHistory.reduce((sum: number, h: Workout) => sum + (h.duration_seconds || 0), 0) / Math.max(sortedHistory.length, 1);
  const avgVolPerMin = avgDur > 0 ? (avgVolume / avgDur) * 60 : 0;
  let effScore = 25; // neutral
  if (avgVolPerMin > 0 && volPerMin > 0) {
    const effRatio = volPerMin / avgVolPerMin;
    // ratio of 1.0 = 50pts, ratio of 0.5 or 2.0 = ~25pts, extreme = lower
    effScore = Math.min(50, Math.round(50 * Math.min(effRatio, 2 / effRatio)));
  }
  return Math.round(rpeScore + effScore);
}

const WORKOUT_TAGS = ['piernas', 'upper body', 'full body', 'cardio', 'stretch'];

// F255 — Workout feel emoji tags in the finish modal
const FEEL_TAGS = [
  { emoji: '💪', label: 'Strong', value: '💪 Strong' },
  { emoji: '😵', label: 'Hard', value: '😵 Hard' },
  { emoji: '😴', label: 'Easy', value: '😴 Easy' },
  { emoji: '🔥', label: 'PR', value: '🔥 PR' },
];

// F224 — Muscle groups for workout history filtering
const WORKOUT_MUSCLE_GROUPS = ['chest', 'back', 'legs', 'shoulders', 'arms', 'core'] as const;
const MUSCLE_GROUP_LABELS: Record<string, string> = {
  chest: 'Pecho', back: 'Espalda', legs: 'Piernas',
  shoulders: 'Hombros', arms: 'Brazos', core: 'Core',
};

// F264 — Equipment groups for workout history filtering
const WORKOUT_EQUIPMENT_GROUPS: Equipment[] = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'kettlebell', 'bands', 'other'];
const EQUIPMENT_LABELS: Record<Equipment, string> = {
  barbell: 'Barra', dumbbell: 'Mancuernas', machine: 'Máquina',
  cable: 'Cable', bodyweight: 'Bodyweight', kettlebell: 'Kettlebell',
  bands: 'Bandas', other: 'Otro',
};

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function rpeColor(rpe: number): string {
  if (rpe <= 5) return '#22c55e';
  if (rpe <= 7) return '#eab308';
  if (rpe <= 8) return '#f97316';
  return '#ef4444';
}

function DumbbellIcon({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m6.5 6.5 11 11" /><path d="m21 21-1-1" /><path d="m3 3 1 1" /><path d="m18 22 4-4" /><path d="m2 6 4-4" /><path d="m3 10 7-7" /><path d="m14 21 7-7" />
    </svg>
  );
}

// Super-set helpers
function findSuperSetGroup(exerciseId: string, superSets: string[][]): number {
  return superSets.findIndex(group => group.includes(exerciseId));
}

// F4 — PR auto-fill panel sub-component
type PRAutoFillExercise = { exercise_id: string; exercise_name: string; type: string; value: number; achieved_at: string };
type PRAutoFillProps = {
  prSearch: string;
  activeWorkoutExercises: ActiveWorkoutExercise[];
  justAddedIds: Set<string>; // F245b — tracks IDs added in this session
  onAutoFill: (exerciseId: string, exerciseName: string, sets: { reps: number; weight: number; set_type: SetType }[]) => void;
};

function PRPanelContent({ prSearch, activeWorkoutExercises, justAddedIds, onAutoFill }: PRAutoFillProps) {
  const db = getDb();
  if (!db) return <p className="p-4 text-sm" style={{ color: 'var(--color-text-2)' }}>Base de datos no disponible</p>;

  const allPRs = getAllPersonalRecords(db);
  if (allPRs.length === 0) {
    return (
      <div className="p-6 text-center">
        <Trophy size={24} className="mx-auto mb-2" style={{ color: 'var(--color-text-2)' }} />
        <p className="text-sm font-medium">Sin récords todavía</p>
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-2)' }}>Completa workouts para establecer PRs</p>
      </div>
    );
  }

  // Group by exercise_id, take latest max_weight and estimated_1rm per exercise
  const exercisePRMap = new Map<string, PRAutoFillExercise>();
  for (const pr of allPRs) {
    const key = pr.exercise_id;
    const existing = exercisePRMap.get(key);
    if (!existing || pr.achieved_at > existing.achieved_at) {
      exercisePRMap.set(key, pr);
    }
  }

  // Build the list: one row per exercise (show best max_weight)
  const exerciseList: (PRAutoFillExercise & { estimated_1rm: number | null })[] = [];
  const seen = new Set<string>();
  for (const pr of allPRs) {
    if (seen.has(pr.exercise_id)) continue;
    seen.add(pr.exercise_id);
    // Find the estimated_1rm PR for this exercise
    const e1rm = allPRs.find(p => p.exercise_id === pr.exercise_id && p.type === 'estimated_1rm');
    exerciseList.push({ ...pr, estimated_1rm: e1rm?.value ?? null });
  }

  const activeIds = new Set(activeWorkoutExercises.map((e: ActiveWorkoutExercise) => e.exercise_id));

  const filtered = exerciseList.filter(pr =>
    !prSearch || pr.exercise_name.toLowerCase().includes(prSearch.toLowerCase())
  );

  if (filtered.length === 0) {
    return <p className="p-4 text-sm text-center" style={{ color: 'var(--color-text-2)' }}>Sin resultados</p>;
  }

  return (
    <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
      {filtered.map(pr => {
        const alreadyIn = activeIds.has(pr.exercise_id) || justAddedIds.has(pr.exercise_id);
        return (
          <div key={pr.exercise_id} className="p-3 flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: alreadyIn ? 'var(--color-text-2)' : 'var(--color-text)' }}>
                {pr.exercise_name}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs font-semibold" style={{ color: 'var(--color-primary)' }}>
                  {pr.value} kg
                </span>
                {pr.estimated_1rm && (
                  <span className="text-xs" style={{ color: 'var(--color-text-2)' }}>
                    1RM ~{pr.estimated_1rm} kg
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => {
                if (alreadyIn) return;
                // Load best sets from the workout where the PR was achieved
                const db2 = getDb();
                if (!db2) return;
                const sets = getLastExerciseSets(db2, pr.exercise_id);
                if (sets.length === 0) return;
                onAutoFill(pr.exercise_id, pr.exercise_name, sets.map(s => ({
                  reps: s.reps,
                  weight: s.weight,
                  set_type: (s.set_type as SetType) || 'normal',
                })));
              }}
              disabled={alreadyIn}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40 flex-shrink-0"
              style={{ backgroundColor: alreadyIn ? 'var(--color-surface-2)' : 'var(--color-primary)', color: alreadyIn ? 'var(--color-text-2)' : '#000' }}
            >
              {alreadyIn ? 'Añadido' : 'Auto-fill'}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// F167 — Superset auto-suggestion banner in active workout (WorkoutsPage)
// Shows when complementary muscle groups are detected in non-superset exercises
function SupersetSuggestionBanner() {
  const { activeWorkout, startSuperSet, addToSuperSet } = useWorkoutStore();
  const [dismissed, setDismissed] = useState(false);

  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- React Compiler cannot statically trace dynamic getDb() call; memoization is preserved at runtime
  const suggestion = useMemo(() => {
    if (!activeWorkout || dismissed) return null;
    const db = getDb();
    if (!db) return null;

    // Get muscle groups for all exercises in the active workout
    // F168 — Use batch query (getExercisesByIds) instead of N+1 loop with getExerciseById (F292: use Record-returning getExercisesByIdsAll)
    const exerciseIds = activeWorkout.exercises.map(ex => ex.exercise_id);
    const exerciseMap = getExercisesByIdsAll(db, exerciseIds);
    const exerciseMuscles: { exerciseId: string; exerciseName: string; muscleGroup: string }[] = [];
    for (const ex of activeWorkout.exercises) {
      const info = exerciseMap[ex.exercise_id];
      if (info?.muscle_group) {
        exerciseMuscles.push({
          exerciseId: ex.exercise_id,
          exerciseName: info.name,
          muscleGroup: info.muscle_group,
        });
      }
    }
    if (exerciseMuscles.length < 2) return null;

    // Complementary muscle group pairs for superset suggestions
    // F164 split 'arms' into 'biceps'/'triceps' to match getMuscleLastWorked schema
    const pairs: [string, string, string][] = [
      ['chest', 'back', 'Pecho + Espalda'],
      ['chest', 'shoulders', 'Pecho + Hombros'],
      ['back', 'shoulders', 'Espalda + Hombros'],
      ['biceps', 'chest', 'Bíceps + Pecho'],
      ['triceps', 'chest', 'Tríceps + Pecho'],
      ['biceps', 'back', 'Bíceps + Espalda'],
      ['triceps', 'back', 'Tríceps + Espalda'],
      ['legs', 'core', 'Piernas + Core'],
    ];

    // Find first non-superset pair with complementary muscles
    const superSetIds = new Set(activeWorkout.superSets.flat());
    const nonSuperset = exerciseMuscles.filter(ex => !superSetIds.has(ex.exerciseId));

    for (const [g1, g2, label] of pairs) {
      const ex1 = nonSuperset.find(ex => ex.muscleGroup === g1);
      const ex2 = nonSuperset.find(ex => ex.muscleGroup === g2);
      if (ex1 && ex2) {
        return { exerciseIds: [ex1.exerciseId, ex2.exerciseId], label };
      }
    }
    return null;
  }, [activeWorkout, dismissed]);

  if (!suggestion) return null;

  return (
    <div
      className="mx-3 mb-1 p-3 rounded-xl flex items-center gap-2"
      style={{ backgroundColor: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)' }}
    >
      <Layers size={16} style={{ color: '#f59e0b' }} className="flex-shrink-0" />
      <p className="text-xs flex-1" style={{ color: 'var(--color-text)' }}>
        ¿Crear super-serie? {suggestion.label}
      </p>
      <button
        onClick={() => {
          startSuperSet(suggestion.exerciseIds[0]);
          suggestion.exerciseIds.slice(1).forEach(id => addToSuperSet(id));
          setDismissed(true);
        }}
        className="px-2.5 py-1 rounded-lg text-xs font-semibold flex-shrink-0"
        style={{ backgroundColor: '#f59e0b', color: '#fff' }}
      >
        Crear
      </button>
      <button
        onClick={() => setDismissed(true)}
        className="p-1 rounded flex-shrink-0"
        style={{ color: 'var(--color-text-2)' }}
      >
        <X size={14} />
      </button>
    </div>
  );
}

export default function WorkoutsPage() {
  const {
    activeWorkout, startWorkout, endWorkout, cancelWorkout,
    addSet, updateSet, updateSetType, updateSetRPE, completeSet,
    removeExerciseFromWorkout, addExerciseToWorkout,
    setWorkoutNotes, setWorkoutTags, setExerciseNotes, setSetNotes, reorderExercises,
    stopRest,
    startSuperSet, addToSuperSet, removeFromSuperSet,
    pauseWorkout, resumeWorkout, editWorkoutTime,
  } = useWorkoutStore();
  const { unit, targetDurationMinutes } = useSettingsStore();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [workoutHistory, setWorkoutHistory] = useState<Workout[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [currentPauseSeconds, setCurrentPauseSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedFromRoutine = useRef(false);

  // Exercise notes editing
  const [editingExNotes, setEditingExNotes] = useState<string | null>(null);
  const [exNotesValue, setExNotesValue] = useState('');

  // Set notes editing
  const [editingSetNotes, setEditingSetNotes] = useState<{ exId: string; setId: string } | null>(null);
  const [setNotesValue, setSetNotesValue] = useState('');

  // Plate calculator
  const [calcExId, setCalcExId] = useState<string | null>(null);
  const [calcSetId, setCalcSetId] = useState<string | null>(null);
  const [calcWeight, setCalcWeight] = useState<number>(0);

  // Super-set state: which exercise is the "anchor" of the open superset
  const [openSuperSet, setOpenSuperSet] = useState<string | null>(null);

  // Copy exercises from another workout
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copyTargetWorkout, setCopyTargetWorkout] = useState<Workout | null>(null);
  // F150 — precomputed exercise count for copy target to avoid duplicate DB call in render
  const [copyTargetExerciseCount, setCopyTargetExerciseCount] = useState(0);

  // Quick templates
  const [showTemplateModal, setShowTemplateModal] = useState(false);

  // F245b — Track recently auto-filled exercise IDs so the "Añadido" state updates immediately
  const [justAddedIds, setJustAddedIds] = useState<Set<string>>(new Set());

  // Edit workout time
  const [showEditTimeModal, setShowEditTimeModal] = useState(false);
  const [editTimeInput, setEditTimeInput] = useState('');

  // F166 — Workout finish summary modal
  const [summaryModal, setSummaryModal] = useState<{
    name: string; duration: number; volume: number;
    exerciseCount: number; setCount: number; plannedSetCount: number;
    completedSetCount: number; bestSet: { weight: number; reps: number } | null;
    prs: { exerciseName: string; type: 'max_weight' | 'estimated_1rm'; value: number }[];
    tags: string[];
    avgRpe: number | null; // F51 — average RPE across completed sets
    workoutId: string; // F168 — ID of the just-finished workout for tag editing
    rating: number; // F189 — star rating
    intensity: { label: string; color: string; bg: string } | null; // F193 — intensity classification
  } | null>(null);

  // F168 — Editable tags in the finish summary modal
  const [modalTags, setModalTags] = useState<string[]>([]);
  // F179 — Editable notes in the finish summary modal
  const [modalNotes, setModalNotes] = useState('');
  // F189 — Editable rating in the finish summary modal
  const [modalRating, setModalRating] = useState(0);
  // F327 — Workout name suggestions in the finish summary modal
  const [suggestedNames, setSuggestedNames] = useState<string[]>([]);

  // Sort controls for workout history
  const [sortBy, setSortBy] = useState<'date' | 'duration' | 'volume'>('date');

  // F173 — Expandable workout card to show per-exercise volume breakdown
  const [expandedWorkoutId, setExpandedWorkoutId] = useState<string | null>(null);

  // F146 — Batch load ALL workout sets in ONE query — used for avgVolume, sort-by-volume, and history card rendering.
  // Replaces N+1 pattern where getWorkoutSets was called per workout in sortedHistory sort and per-card in render.
  const workoutSetsBatch = useMemo(() => {
    const db = getDb();
    if (!db) return new Map<string, { volume: number; sets: WorkoutSet[] }>();
    return getWorkoutSetsBatch(db, workoutHistory.map((w: Workout) => w.id));
  }, [workoutHistory]);

  // F146 — Batch load ALL rest-time stats in ONE query — replaces per-card getRestTimeStats calls in render.
  const restTimeBatch = useMemo(() => {
    const db = getDb();
    if (!db) return new Map<string, { avg: number; min: number; max: number }>();
    return getRestTimeStatsBatch(db, workoutHistory.map((w: Workout) => w.id));
  }, [workoutHistory]);

  // F306 — Batch load all exercise PRs (max_weight) in a single query — for PR trophy badges in history cards
  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- React Compiler cannot statically trace dynamic getDb() call; memoization is preserved at runtime
  const exercisePRMap = useMemo(() => {
    const db = getDb();
    if (!db) return {};
    return getExercisePRMapAll(db);
  }, []);

  // F173 — Load all exercises (id → {name, muscle_group}) for volume breakdown in history cards (F289: use Record-returning getAllExerciseNamesAll)
   
  const allExerciseNames = useMemo(() => {
    const db = getDb();
    if (!db) return {} as Record<string, { name: string; muscle_group: string; equipment: Equipment }>;
    return getAllExerciseNamesAll(db);
  }, []);

  // F30 — average volume across all workouts (for intensity classification)
  const avgVolume = useMemo(() => {
    if (workoutHistory.length === 0) return 0;
    let totalVol = 0;
    for (const w of workoutHistory) {
      totalVol += workoutSetsBatch.get(w.id)?.volume ?? 0;
    }
    return totalVol / workoutHistory.length;
  }, [workoutHistory, workoutSetsBatch]);

  // F107 — global average rest time (last 30 days) for color comparison
  const globalAvgRest = useMemo(() => {
    const db = getDb();
    if (!db) return 0;
    const analytics = getRestTimeAnalytics(db);
    return analytics.globalAvg;
  }, []);

  // F107 — helper: color for rest time vs global average
  const getRestTimeColor = (avg: number): string => {
    if (avg === 0 || globalAvgRest === 0) return 'var(--color-text-2)';
    const ratio = avg / globalAvgRest;
    if (ratio <= 1.1) return '#22c55e'; // green — within 10% of average
    if (ratio <= 1.3) return '#eab308'; // yellow — 10-30% above
    return '#ef4444'; // red — >30% above
  };

  // F193 — Classify a workout's intensity based on its volume vs 30-day average
  const getIntensity = (_w: Workout, wVolume: number): { label: string; color: string; bg: string } | null => {
    if (wVolume === 0 || avgVolume === 0) return null;
    const ratio = wVolume / avgVolume;
    if (ratio > 1.25) return { label: 'Intensa', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' };
    if (ratio < 0.75) return { label: 'Ligera', color: '#22c55e', bg: 'rgba(34,197,94,0.15)' };
    return { label: 'Moderada', color: 'var(--color-primary)', bg: 'rgba(99,102,241,0.15)' };
  };

  // Calendar view
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');

  // F10 — Compare multi-select state
  const [compareMode, setCompareMode] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState<Set<string>>(new Set());
  const toggleCompare = (id: string) => {
    setSelectedForCompare(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // F122 — Drag handle state for reordering exercises in active workout
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

  // Quick add search state
  const [quickAddQuery, setQuickAddQuery] = useState('');
  const [quickAddResults, setQuickAddResults] = useState<Exercise[]>([]);

  // F144 — Notes search state for filtering workout history by notes content
  const [notesSearch, setNotesSearch] = useState('');

  // F4 — PR auto-fill panel state
  const [showPRPanel, setShowPRPanel] = useState(false);
  const [prSearch, setPrSearch] = useState('');

  // F29 — last workout data per exercise (memoized to avoid repeated DB calls)
  const lastWorkoutData = useMemo(() => {
    const db = getDb();
    if (!db || !activeWorkout) return {};
    const result: Record<string, { weight: number; reps: number }[]> = {};
    for (const ex of activeWorkout.exercises) {
      const sets = getLastExerciseSets(db, ex.exercise_id);
      if (sets.length > 0) {
        result[ex.exercise_id] = sets.map(s => ({ weight: s.weight, reps: s.reps }));
      }
    }
    return result;
  }, [activeWorkout?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // F95 — PR per exercise for active workout (max_weight) — F146 uses batch query (F292: use Record-returning getMaxWeightForExerciseBatchAll)
  const exercisePRs = useMemo(() => {
    const db = getDb();
    if (!db || !activeWorkout) return {};
    const exerciseIds = activeWorkout.exercises.map((ex: ActiveWorkoutExercise) => ex.exercise_id);
    return getMaxWeightForExerciseBatchAll(db, exerciseIds);
  }, [activeWorkout?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // F232 — Typical rest time per exercise: batch-loaded to avoid N+1
   
  const typicalRestMap = useMemo(() => {
    const db = getDb();
    if (!db || !activeWorkout) return new Map<string, number>();
    const exerciseIds = activeWorkout.exercises.map((ex: ActiveWorkoutExercise) => ex.exercise_id);
    return getExerciseRestTimeAvgBatch(db, exerciseIds);
  }, [activeWorkout?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Workout tags
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  // F224 — Muscle group filter for workout history
  const [selectedMuscleGroups, setSelectedMuscleGroups] = useState<string[]>([]);
  // F243 — Time-of-day filter for workout history
  const [selectedTimeOfDay, setSelectedTimeOfDay] = useState<TimeOfDay | null>(null);
  // F265 — Date range filter for workout history
  const [dateRangeStart, setDateRangeStart] = useState<string>('');
  const [dateRangeEnd, setDateRangeEnd] = useState<string>('');
  // F264 — Equipment filter for workout history
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null);
  // F78 — active workout tags (local state synced from activeWorkout.tags)
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [showTagEditor, setShowTagEditor] = useState(false);

  // PR toast state (F16)
  const [prToast, setPrToast] = useState<{ exerciseName: string; type: 'max_weight' | 'estimated_1rm'; value: number }[] | null>(null);
  // F100 — Streak milestone celebration state
  const [streakMilestone, setStreakMilestone] = useState<number | null>(null);
  // F329 — Streak calendar state (7-day mini calendar)
  const [streakDays, setStreakDays] = useState<Set<string>>(new Set());
  const [showStreakCalendar, setShowStreakCalendar] = useState(false);
  // F329 — Memoized last-7-days dates (avoid impure Date.now() in render)
  const last7Days = useMemo(() => {
    const now = Date.now(); // eslint-disable-line react-hooks/purity
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now - (6 - i) * 86400000);
      return {
        dateStr: d.toISOString().split('T')[0],
        dayLabel: d.toLocaleDateString('es-ES', { weekday: 'short' }).slice(0, 2),
        dayNum: d.getDate(),
      };
    });
  }, []);
  // F334 — Quick-start workout name chips (recent workout names for quick start)
  const quickStartNames = useMemo(() => {
    return [...new Set(
      workoutHistory
        .filter((w: Workout) => w.finished_at && w.name && w.name !== 'Workout' && w.name !== 'Nuevo workout')
        .map((w: Workout) => w.name)
    )].slice(0, 6);
  }, [workoutHistory]);

  useEffect(() => {
    const db = getDb();
    if (db) setWorkoutHistory(getWorkouts(db));
  }, []);

  // F329 — Load workout dates for the 7-day streak calendar
  useEffect(() => {
    const db = getDb();
    if (db) setStreakDays(getWorkoutDatesLast7Days(db));
  }, [workoutHistory]);

  // F78 — sync active workout tags with local state for editing
  useEffect(() => {
    if (activeWorkout) {
      setActiveTags(activeWorkout.tags || []);
    }
  }, [activeWorkout]);

  // Sort workout history — F146 volume sort uses pre-loaded workoutSetsBatch (no per-sort DB calls)
  const sortedHistory = [...workoutHistory].sort((a, b) => {
    if (sortBy === 'date') return new Date(b.started_at).getTime() - new Date(a.started_at).getTime();
    if (sortBy === 'duration') return (b.duration_seconds || 0) - (a.duration_seconds || 0);
    if (sortBy === 'volume') {
      const volA = workoutSetsBatch.get(a.id)?.volume ?? 0;
      const volB = workoutSetsBatch.get(b.id)?.volume ?? 0;
      return volB - volA;
    }
    return 0;
  });

  // F79 — Filter history by selected tag + F144 — Filter by notes search + F224 — Filter by muscle group
  const filteredHistory = useMemo(() => {
    let result = sortedHistory;
    if (selectedTags.length > 0) {
      result = result.filter(w => {
        return selectedTags.some(t => (w.tags || []).includes(t));
      });
    }
    if (notesSearch.trim().length > 0) {
      const q = notesSearch.toLowerCase();
      result = result.filter(w => (w.notes || '').toLowerCase().includes(q));
    }
    // F224 — Filter by muscle group: match if any exercise in the workout matches the selected muscle group
    if (selectedMuscleGroups.length > 0) {
      result = result.filter(w => {
        const wSets = workoutSetsBatch.get(w.id)?.sets ?? [];
        return wSets.some((s: WorkoutSet) => {
          const exInfo = allExerciseNames[s.exercise_id];
          return exInfo && selectedMuscleGroups.includes(exInfo.muscle_group);
        });
      });
    }
    // F243 — Filter by time of day
    if (selectedTimeOfDay) {
      result = result.filter(w => getTimeOfDay(w.started_at) === selectedTimeOfDay);
    }
    // F265 — Filter by date range
    if (dateRangeStart) {
      const startMs = new Date(dateRangeStart).getTime();
      result = result.filter(w => new Date(w.started_at).getTime() >= startMs);
    }
    if (dateRangeEnd) {
      const endMs = new Date(dateRangeEnd + 'T23:59:59').getTime();
      result = result.filter(w => new Date(w.started_at).getTime() <= endMs);
    }
    // F264 — Filter by equipment: match if any exercise in the workout uses the selected equipment
    if (selectedEquipment) {
      result = result.filter(w => {
        const wSets = workoutSetsBatch.get(w.id)?.sets ?? [];
        return wSets.some((s: WorkoutSet) => {
          const exInfo = allExerciseNames[s.exercise_id];
          return exInfo && exInfo.equipment === selectedEquipment;
        });
      });
    }
    return result;
  }, [sortedHistory, selectedTags, notesSearch, selectedMuscleGroups, selectedTimeOfDay, dateRangeStart, dateRangeEnd, selectedEquipment, workoutSetsBatch, allExerciseNames]);

  // Auto-start workout from routine
  useEffect(() => {
    const routineId = searchParams.get('start');
    if (routineId && !activeWorkout && !startedFromRoutine.current) {
      startedFromRoutine.current = true;
      const db = getDb();
      if (!db) return;
      const routine = getRoutineById(db, routineId);
      if (!routine) return;
      // F145 — Read skipped exercise IDs from sessionStorage (set by RoutineDetailPage preview)
      let skippedIds: string[] = [];
      try {
        const stored = sessionStorage.getItem('routine_skipped_exercises');
        if (stored) skippedIds = JSON.parse(stored);
        sessionStorage.removeItem('routine_skipped_exercises');
      } catch { skippedIds = []; }
      const routineExercises = getRoutineExercises(db, routineId);
      startWorkout(routine.name, routineId);
      routineExercises.forEach((re) => {
        // F145 — Skip exercises that were unchecked in the routine preview
        if (skippedIds.includes(re.id)) return;
        const lastSets = getLastExerciseSets(db, re.exercise_id);
        let targetWeight = re.target_weight ?? lastSets[0]?.weight ?? 0;
        // F67 — RPE-based weight suggestion: if routine has target_rpe and last workout had RPE data, estimate weight for target RPE
        if (re.target_rpe != null && lastSets.length > 0) {
          const lastSetsWithRpe = getLastExerciseSetsWithRpe(db, re.exercise_id);
          if (lastSetsWithRpe.length > 0) {
            // Find a set with RPE to calibrate the relationship
            const rpeSet = lastSetsWithRpe.find(s => s.rpe != null);
            if (rpeSet && rpeSet.rpe != null) {
              // Estimate 1RM from last performance using Epley, then compute weight for target RPE
              // Formula: weight = estimated_1rm / (1 + (10 - target_rpe) * 0.0333)
              const lastEst1RM = rpeSet.weight * (1 + rpeSet.reps / 30);
              const rpeFactor = 1 + (10 - re.target_rpe) * 0.0333;
              targetWeight = Math.round((lastEst1RM / rpeFactor) * 10) / 10;
            }
          }
        }
        const setsForExercise = Array.from({ length: re.target_sets }, () => ({
          reps: re.target_reps_override ?? (parseInt(re.target_reps) || 10),
          weight: targetWeight,
          set_type: 'normal' as const,
        }));
        addExerciseToWorkout(re.exercise_id, (re as RoutineExerciseFull).exercise_name, re.target_sets, setsForExercise, undefined, re.rest_seconds);
      });
    }
  }, [searchParams, activeWorkout, startWorkout, addExerciseToWorkout]);

  useEffect(() => {
    if (activeWorkout) {
      timerRef.current = setInterval(() => {
        const started = new Date(activeWorkout.startedAt);
        const total = differenceInSeconds(new Date(), started);
        const paused = activeWorkout.pausedAt
          ? Math.round((Date.now() - new Date(activeWorkout.pausedAt).getTime()) / 1000)
          : 0;
        setElapsed(Math.max(0, total - activeWorkout.totalPausedSeconds - paused));
        setCurrentPauseSeconds(paused);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setElapsed(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [activeWorkout]);

  const handleStartWorkout = () => { setSelectedTags([]); startWorkout('Workout'); };
  const handleQuickStart = (name: string) => { setSelectedTags([]); startWorkout(name); };

  const handleQuickAddSearch = (query: string) => {
    setQuickAddQuery(query);
    if (query.length < 2) {
      setQuickAddResults([]);
      return;
    }
    const db = getDb();
    if (!db) return;
    const results = searchExercises(db, query);
    setQuickAddResults(results.slice(0, 8));
  };

  const handleQuickAddExercise = (exerciseId: string, exerciseName: string) => {
    const db = getDb();
    if (!db) return;
    const lastSets = getLastExerciseSets(db, exerciseId);
    const lastNotes = getLastExerciseNotes(db, exerciseId);
    // F9 — Auto warmup sets for barbell exercises with working weight ≥ 20kg
    const warmupSets = getWarmupSets(lastSets[0]?.weight ?? 0);
    // If lastSets has varied sets (pyramid/drop), preserve them; otherwise use defaults + warmups
    const hasVaryingSets = lastSets.length > 1 && lastSets.some((s, i) => i > 0 && (s.weight !== lastSets[0].weight || s.reps !== lastSets[0].reps));
    let setsToAdd: ActiveSet[] | undefined;
    if (hasVaryingSets) {
      // Preserve varied set structure from last workout (pyramid, drop sets, etc.)
      setsToAdd = lastSets.map((s, i) => ({
        id: generateId(),
        set_number: i + 1,
        set_type: (s.set_type as SetType) || 'normal',
        reps: s.reps,
        weight: s.weight,
        rpe: null,
        notes: '',
        completed: false,
      }));
    }
    addExerciseToWorkout(exerciseId, exerciseName, undefined, setsToAdd, lastNotes);
    // Add warmup sets as prepended sets (before working sets) — only for barbell with weight ≥ 20kg
    if (warmupSets.length > 0) {
      const workout = useWorkoutStore.getState().activeWorkout;
      if (workout) {
        const exEntry = workout.exercises.find(e => e.exercise_id === exerciseId);
        if (exEntry) {
          // Prepend warmup sets: renumber existing sets and add warmups at the start
          const renumbered = exEntry.sets.map((s, i) => ({ ...s, set_number: i + 1 + warmupSets.length }));
          const warmupActiveSets: ActiveSet[] = warmupSets.map((w, i) => ({
            id: generateId(),
            set_number: i + 1,
            set_type: 'warmup' as const,
            reps: w.reps,
            weight: w.weight,
            rpe: null,
            notes: '',
            completed: false,
            rest_time: undefined,
          }));
          // Update the exercise entry with warmup sets prepended
          useWorkoutStore.setState({
            activeWorkout: {
              ...workout,
              exercises: workout.exercises.map(e =>
                e.exercise_id === exerciseId
                  ? { ...e, sets: [...warmupActiveSets, ...renumbered] }
                  : e
              ),
            },
          });
        }
      }
    }
    setQuickAddQuery('');
    setQuickAddResults([]);
  };

  const handleEndWorkout = () => {
    if (!activeWorkout) return;
    const finishedAt = new Date().toISOString();
    const rawDuration = differenceInSeconds(new Date(finishedAt), new Date(activeWorkout.startedAt));
    const currentlyPaused = activeWorkout.pausedAt
      ? Math.round((Date.now() - new Date(activeWorkout.pausedAt).getTime()) / 1000)
      : 0;
    const duration = Math.max(0, rawDuration - activeWorkout.totalPausedSeconds - currentlyPaused);
    const db = getDb();
    let newPRs: { exerciseName: string; type: 'max_weight' | 'estimated_1rm'; value: number }[] = [];
    if (db) {
      // F245 — Compute intensity before saveWorkout so it can be persisted
      const allSetsForIntensity = activeWorkout.exercises.flatMap(ex => ex.sets.filter(s => s.completed));
      const totalVolumeForIntensity = allSetsForIntensity.reduce((acc, s) => acc + (s.weight || 0) * (s.reps || 0), 0);
      const intensityValue = getIntensity(activeWorkout as unknown as Workout, totalVolumeForIntensity);
      saveWorkout(db, {
        id: activeWorkout.id,
        routine_id: activeWorkout.routineId,
        name: activeWorkout.name,
        started_at: activeWorkout.startedAt,
        finished_at: finishedAt,
        duration_seconds: duration,
        notes: activeWorkout.notes || '',
        is_public: false,
        exercises: activeWorkout.exercises,
        tags: selectedTags,
        superSets: activeWorkout.superSets,
        intensity: intensityValue?.label || null, // F245 — persist intensity label
      });
      // Check and save personal records, capture new PRs for toast
      newPRs = checkAndSavePersonalRecords(db, activeWorkout.id, activeWorkout.exercises, finishedAt);
      // F188 — PR celebration toast: show a trophy toast for each new PR achieved
      if (newPRs.length > 0) {
        const maxWeightPRs = newPRs.filter(pr => pr.type === 'max_weight');
        const estimated1RMPRs = newPRs.filter(pr => pr.type === 'estimated_1rm');
        if (maxWeightPRs.length > 0 || estimated1RMPRs.length > 0) {
          const lines: string[] = [];
          if (maxWeightPRs.length > 0) {
            lines.push(`💪 ${maxWeightPRs.map(pr => `${pr.exerciseName} ${pr.value}kg`).join(', ')}`);
          }
          if (estimated1RMPRs.length > 0) {
            lines.push(`🏆 ${estimated1RMPRs.map(pr => `${pr.exerciseName} ${pr.value.toFixed(1)}kg 1RM`).join(', ')}`);
          }
          toastStore.pr('🎉 ¡Nuevo récord!', lines.join('\n'));
        }
      }
      setWorkoutHistory(getWorkouts(db));

      // F100 — Streak milestone celebration: check after saving the workout
      const STREAK_MILESTONES = [3, 7, 14, 21, 30, 60, 90];
      const currentStreak = getStreak(db);
      if (currentStreak > 1 && STREAK_MILESTONES.includes(currentStreak)) {
        setStreakMilestone(currentStreak);
        // Also fire a browser notification if permission is granted
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('🎉 ¡Racha de entrenamientos!', {
            body: `¡Llevas ${currentStreak} días consecutivos entrenando!`,
            icon: '/favicon.ico',
          });
        }
      }
    }

    stopRest();

// F66 — Compute summary stats and show modal instead of ending immediately
    const allSets = activeWorkout.exercises.flatMap(ex => ex.sets.filter(s => s.completed));
    const totalVolume = allSets.reduce((acc, s) => acc + (s.weight || 0) * (s.reps || 0), 0);
    const bestSet = allSets.reduce((best: { weight: number; reps: number } | null, s) => {
      const vol = (s.weight || 0) * (s.reps || 0);
      const bestVol = best ? (best.weight || 0) * (best.reps || 0) : 0;
      return vol > bestVol ? { weight: s.weight, reps: s.reps } : best;
    }, null);
    // F51 — Average RPE across all completed sets that have an RPE value
    const rpeSets = allSets.filter(s => s.rpe != null && s.rpe > 0);
    const avgRpe = rpeSets.length > 0
      ? Math.round((rpeSets.reduce((acc, s) => acc + (s.rpe || 0), 0) / rpeSets.length) * 10) / 10
      : null;
    // F166 — Planned vs completed sets
    const plannedSetCount = activeWorkout.exercises.reduce((acc, ex) => acc + ex.sets.length, 0);
    const completedSetCount = allSets.length;
    setSummaryModal({
      name: activeWorkout.name,
      duration,
      volume: totalVolume,
      exerciseCount: activeWorkout.exercises.length,
      setCount: allSets.length,
      plannedSetCount,
      completedSetCount,
      bestSet,
      prs: newPRs,
      tags: selectedTags,
      avgRpe,
      workoutId: activeWorkout.id, // F168 — save ID for tag editing
      rating: 0, // F189 — initialize rating
      intensity: getIntensity(activeWorkout as unknown as Workout, totalVolume), // F193 — intensity vs avg volume
    });
    // F168 — Initialize modal tags with the selected tags for editing in the modal
    setModalTags([...selectedTags]);
    // F179 — Initialize modal notes from active workout notes
    setModalNotes(activeWorkout.notes || '');
    // F327 — Extract unique workout names from history for name suggestions
    const names = [...new Set(
      workoutHistory
        .filter((w: Workout) => w.finished_at && w.id !== activeWorkout.id)
        .map((w: Workout) => w.name)
        .filter(Boolean)
    )].slice(0, 10);
    setSuggestedNames(names);
    endWorkout();
    setSelectedTags([]);
  };

  const handleSaveAsTemplate = (name: string) => {
    if (!activeWorkout) return;
    const db = getDb();
    if (!db) return;
    const routineId = generateId();
    const now = new Date().toISOString();

    // Save routine (without connecting to workout)
    saveRoutine(db, {
      id: routineId,
      name,
      description: '',
      is_public: false,
      estimated_duration_minutes: Math.ceil(elapsed / 60),
      created_at: now,
      updated_at: now,
    });

    // Save routine_exercises from active workout exercises
    activeWorkout.exercises.forEach((ex, idx) => {
      const firstSet = ex.sets[0];
      saveRoutineExercise(db, {
        id: generateId(),
        routine_id: routineId,
        exercise_id: ex.exercise_id,
        order_index: idx,
        target_sets: ex.sets.length,
        target_reps: firstSet?.reps?.toString() || '10',
        target_weight: firstSet?.weight || 0,
        rest_seconds: 90,
      });
    });
  };

  const handleStartFromTemplate = (routineId: string) => {
    if (activeWorkout) {
      if (!confirm('Ya tienes un workout activo. ¿Deseas.cancelarlo?')) return;
      cancelWorkout();
    }
    navigate(`/workouts?start=${routineId}`);
  };

  // ===== ACTIVE WORKOUT VIEW =====
  if (activeWorkout) {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="p-4 flex items-center justify-between border-b" style={{ borderColor: 'var(--color-border)' }}>
          <div>
            <h1 className="text-xl font-bold">{activeWorkout.name}</h1>
            <div className="flex items-center gap-2">
              <p className="text-sm" style={{ color: activeWorkout.pausedAt ? 'var(--color-warning)' : 'var(--color-text-2)' }}>
                {activeWorkout.pausedAt ? `⏸ ${formatDuration(elapsed)}` : formatDuration(elapsed)}
              </p>
              {/* F125 — Show total accumulated pause time when paused */}
              {activeWorkout.pausedAt && activeWorkout.totalPausedSeconds > 0 && (
                <p className="text-xs" style={{ color: 'var(--color-warning)' }}>
                  (pausado: {formatDuration(activeWorkout.totalPausedSeconds + currentPauseSeconds)})
                </p>
              )}
              <span className="text-sm" style={{ color: 'var(--color-text-2)' }}>·</span>
              <p className="text-sm" style={{ color: 'var(--color-text-2)' }}>
                {activeWorkout.exercises.length} ejercicios
              </p>
            </div>
            {/* F78 — Tag selector in active workout header */}
            <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
              {activeTags.length > 0 && activeTags.map(tag => (
                <span key={tag} className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: 'var(--color-primary)', color: '#000' }}>
                  {tag}
                </span>
              ))}
              <button
                onClick={() => setShowTagEditor(!showTagEditor)}
                className="px-2 py-0.5 rounded-full text-xs font-medium border transition-colors"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-2)' }}
              >
                + Etiqueta
              </button>
            </div>
            {showTagEditor && (
              <div className="flex flex-wrap gap-1.5 mt-2 p-2 rounded-lg" style={{ backgroundColor: 'var(--color-surface-2)' }}>
                {WORKOUT_TAGS.map(tag => {
                  const selected = activeTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      onClick={() => {
                        const next = selected ? activeTags.filter(t => t !== tag) : [...activeTags, tag];
                        setActiveTags(next);
                        setWorkoutTags(next);
                      }}
                      className="px-2.5 py-1 rounded-full text-xs font-medium transition-colors border"
                      style={{
                        backgroundColor: selected ? 'var(--color-primary)' : 'transparent',
                        color: selected ? '#000' : 'var(--color-text-2)',
                        borderColor: selected ? 'var(--color-primary)' : 'var(--color-border)',
                      }}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {targetDurationMinutes > 0 && (
            <div className="flex items-center gap-2">
              <svg width="52" height="52" viewBox="0 0 52 52">
                <circle cx="26" cy="26" r="20" fill="none" stroke="var(--color-border)" strokeWidth="4" />
                <circle
                  cx="26"
                  cy="26"
                  r="20"
                  fill="none"
                  stroke={elapsed >= targetDurationMinutes * 60 ? 'var(--color-success)' : 'var(--color-primary)'}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 20}`}
                  strokeDashoffset={`${2 * Math.PI * 20 * (1 - Math.min(elapsed / (targetDurationMinutes * 60), 1))}`}
                  transform="rotate(-90 26 26)"
                />
                <text x="26" y="26" textAnchor="middle" dominantBaseline="central" fontSize="10" fill="var(--color-text)">
                  {Math.floor(elapsed / 60)}/{targetDurationMinutes}
                </text>
              </svg>
            </div>
          )}
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                if (activeWorkout.pausedAt) {
                  resumeWorkout();
                } else {
                  pauseWorkout();
                }
              }}
              className="p-2 rounded-lg"
              style={{ backgroundColor: 'var(--color-surface)' }}
              title={activeWorkout.pausedAt ? 'Reanudar' : 'Pausar'}
            >
              {activeWorkout.pausedAt ? <Play size={16} /> : <Pause size={16} />}
            </button>
            <button
              onClick={() => {
                setEditTimeInput(activeWorkout.startedAt.slice(0, 16));
                setShowEditTimeModal(true);
              }}
              className="p-2 rounded-lg"
              style={{ backgroundColor: 'var(--color-surface)' }}
              title="Editar hora de inicio"
            >
              <Edit2 size={16} />
            </button>
            <button
              onClick={handleEndWorkout}
              disabled={activeWorkout.exercises.length === 0}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition-opacity disabled:opacity-30"
              style={{ backgroundColor: 'var(--color-primary)', color: '#000' }}
            >
              Finalizar
            </button>
            <button
              onClick={() => { setShowTemplateModal(true); }}
              disabled={activeWorkout.exercises.length === 0}
              className="p-2 rounded-lg disabled:opacity-30"
              style={{ backgroundColor: 'var(--color-surface)' }}
              title="Guardar como template"
            >
              <Save size={16} />
            </button>
            <button
              onClick={() => setShowPRPanel(true)}
              className="p-2 rounded-lg"
              style={{ backgroundColor: 'var(--color-surface)' }}
              title="Récords personales"
            >
              <Trophy size={16} />
            </button>
          </div>
        </div>

        {/* Workout Tags */}
        {activeWorkout.exercises.length > 0 && (
          <div className="px-4 py-2 flex items-center gap-2 border-b" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
            <span className="text-xs" style={{ color: 'var(--color-text-2)' }}>Tags:</span>
            <div className="flex gap-1 flex-wrap">
              {WORKOUT_TAGS.map(tag => (
                <button
                  key={tag}
                  onClick={() => setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}
                  className="px-2 py-0.5 rounded text-xs font-medium capitalize"
                  style={{
                    backgroundColor: selectedTags.includes(tag) ? 'var(--color-primary)' : 'var(--color-surface-2)',
                    color: selectedTags.includes(tag) ? '#000' : 'var(--color-text-2)',
                  }}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* F167 — Superset auto-suggestion for active workout */}
        {activeWorkout.exercises.length >= 2 && (
          <SupersetSuggestionBanner />
        )}

        {/* Workout Notes */}
        <div className="px-4 py-2 border-b" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
          <textarea
            value={activeWorkout.notes}
            onChange={e => setWorkoutNotes(e.target.value)}
            placeholder="Notas del workout..."
            className="w-full px-2 py-1.5 rounded-lg text-xs resize-none"
            style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
            rows={2}
          />
        </div>

        {/* Exercises */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {activeWorkout.exercises.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3">
              {/* Quick add search */}
              <div className="relative w-full max-w-xs">
                <input
                  type="text"
                  value={quickAddQuery}
                  onChange={e => handleQuickAddSearch(e.target.value)}
                  placeholder="Buscar ejercicio..."
                  autoFocus
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                />
                {quickAddResults.length > 0 && (
                  <div
                    className="absolute z-10 w-full mt-1 rounded-lg overflow-hidden"
                    style={{ backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
                  >
                    {quickAddResults.map(ex => (
                      <button
                        key={ex.id}
                        onClick={() => handleQuickAddExercise(ex.id, ex.name)}
                        className="w-full text-left px-3 py-2 text-sm hover:opacity-80 flex items-center gap-2"
                        style={{ borderBottom: '1px solid var(--color-border)' }}
                      >
                        <span className="text-xs capitalize px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text-2)' }}>
                          {ex.muscle_group}
                        </span>
                        <span>{ex.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => setShowCopyModal(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
                style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
              >
                <Copy size={14} />
                Copiar de otro workout
              </button>
            </div>
          ) : (
            (() => {
              const renderedIds = new Set<string>();
              return activeWorkout.exercises.map((ex, exIdx) => {
                if (renderedIds.has(ex.exercise_id)) return null;
                renderedIds.add(ex.exercise_id);

                const ssGroupIdx = findSuperSetGroup(ex.exercise_id, activeWorkout.superSets);
                const isInSuperSet = ssGroupIdx !== -1;
                const ssGroup = isInSuperSet ? activeWorkout.superSets[ssGroupIdx] : null;

                // Collect all exercise IDs in this group (including non-workout ones)
                const groupExercises = isInSuperSet
                  ? activeWorkout.exercises.filter(e => ssGroup!.includes(e.exercise_id))
                  : [ex];

                // Mark all as rendered
                groupExercises.forEach(e => renderedIds.add(e.exercise_id));

                const groupColor = '#10b981';

                return (
                  <div key={ex.exercise_id} className="space-y-2">
                    {/* Super-set label */}
                    {isInSuperSet && ex.exercise_id === ssGroup![0] && (
                      <div className="flex items-center gap-2 px-1">
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                          style={{ backgroundColor: `${groupColor}20`, color: groupColor, border: `1px solid ${groupColor}40` }}>
                          <Layers size={10} />
                          SUPER-SERIE
                        </div>
                        <div className="flex-1 h-px" style={{ backgroundColor: `${groupColor}30` }} />
                      </div>
                    )}

                    {/* Exercise card */}
                    <div
                      draggable
                      onDragStart={() => { setDraggingIdx(exIdx); }}
                      onDragOver={(e) => { e.preventDefault(); setDragOverIdx(exIdx); }}
                      onDragEnd={() => {
                        if (draggingIdx !== null && draggingIdx !== exIdx && draggingIdx >= 0 && draggingIdx < activeWorkout.exercises.length) {
                          reorderExercises(draggingIdx, exIdx);
                        }
                        setDraggingIdx(null);
                        setDragOverIdx(null);
                      }}
                      onDragEnter={() => { if (draggingIdx !== null && draggingIdx !== exIdx) setDragOverIdx(exIdx); }}
                      className={`rounded-xl overflow-hidden transition-all ${draggingIdx === exIdx ? 'opacity-40' : ''} ${dragOverIdx === exIdx && draggingIdx !== null && draggingIdx !== exIdx ? 'ring-2 ring-[var(--color-primary)]' : ''}`}
                      style={{
                        backgroundColor: 'var(--color-surface)',
                        borderLeft: isInSuperSet ? `3px solid ${groupColor}` : undefined,
                      }}
                    >
                      {/* Exercise header */}
                      <div className="flex items-center gap-2 p-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
                        {/* F122 — Drag handle replaces ChevronUp/ChevronDown */}
                        <div
                          className="flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0 cursor-grab active:cursor-grabbing"
                          style={{ backgroundColor: 'var(--color-surface-2)' }}
                          title="Arrastra para reordenar"
                        >
                          <GripVertical size={16} style={{ color: 'var(--color-text-2)' }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">{ex.exercise_name}</p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-xs" style={{ color: 'var(--color-text-2)' }}>
                              {ex.sets.filter(s => s.completed).length}/{ex.sets.length} series
                            </p>
                            {/* F29 — last workout weight/reps chip */}
                            {lastWorkoutData[ex.exercise_id] && lastWorkoutData[ex.exercise_id].length > 0 && (
                              <span
                                className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                                style={{ backgroundColor: 'rgba(59,130,246,0.15)', color: '#3b82f6' }}
                                title="Último workout"
                              >
                                Anterior: {lastWorkoutData[ex.exercise_id].map(s => `${s.weight > 0 ? s.weight : '—'}kg×${s.reps}`).join(' / ')}
                              </span>
                            )}
                            {/* F85 — estimated 1RM badge from best completed set */}
                            {(() => {
                              const completedSets = ex.sets.filter((s: ActiveSet) => s.completed && s.weight > 0 && s.reps > 0);
                              if (completedSets.length === 0) return null;
                              const best1RM = Math.max(...completedSets.map((s: ActiveSet) => calculate1RM(s.weight, s.reps)));
                              return (
                                <span
                                  className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                                  style={{ backgroundColor: 'rgba(59,130,246,0.12)', color: '#60a5fa' }}
                                  title="1RM estimado (Epley)"
                                >
                                  1RM {Math.round(best1RM)}kg
                                </span>
                              );
                            })()}
                            {/* F95 — PR chip showing personal record for this exercise */}
                            {exercisePRs[ex.exercise_id] && (
                              <span
                                className="text-[10px] px-1.5 py-0.5 rounded font-medium flex items-center gap-0.5"
                                style={{ backgroundColor: 'rgba(168,85,247,0.15)', color: '#a855f7' }}
                                title="Récord personal"
                              >
                                <Trophy size={9} />
                                PR {exercisePRs[ex.exercise_id]}kg
                              </span>
                            )}
                            {/* F291b — PR proximity % chip: shows how close the current best set is to the PR */}
                            {exercisePRs[ex.exercise_id] && (() => {
                              const completedSets = ex.sets.filter((s: ActiveSet) => s.completed && s.weight > 0 && s.reps > 0);
                              if (completedSets.length === 0) return null;
                              const bestCurrentWeight = Math.max(...completedSets.map((s: ActiveSet) => s.weight));
                              const proximityPct = Math.round((bestCurrentWeight / exercisePRs[ex.exercise_id]) * 100);
                              const bgColor = proximityPct >= 100 ? 'rgba(16,185,129,0.15)' : proximityPct >= 90 ? 'rgba(245,158,11,0.15)' : proximityPct >= 70 ? 'rgba(249,115,22,0.15)' : 'rgba(107,114,128,0.12)';
                              const textColor = proximityPct >= 100 ? '#10b981' : proximityPct >= 90 ? '#f59e0b' : proximityPct >= 70 ? '#f97316' : '#6b7280';
                              return (
                                <span
                                  className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                                  style={{ backgroundColor: bgColor, color: textColor }}
                                  title={`Mejor serie actual: ${bestCurrentWeight}kg (${proximityPct}% del PR ${exercisePRs[ex.exercise_id]}kg)`}
                                >
                                  {proximityPct}%
                                </span>
                              );
                            })()}
                            {/* F232 — Typical rest time badge */}
                            {(() => {
                              const typicalRest = typicalRestMap.get(ex.exercise_id);
                              if (!typicalRest || typicalRest <= 0) return null;
                              return (
                                <span
                                  className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                                  style={{ backgroundColor: 'rgba(107,114,128,0.15)', color: '#6b7280' }}
                                  title="Descanso típico (30 días)"
                                >
                                  ↔ {typicalRest}s
                                </span>
                              );
                            })()}
                          </div>
                        </div>
                        {/* Super-set button */}
                        <button
                          onClick={() => {
                            if (!isInSuperSet) {
                              startSuperSet(ex.exercise_id);
                              setOpenSuperSet(ex.exercise_id);
                            } else {
                              removeFromSuperSet(ex.exercise_id);
                              if (groupExercises.length <= 1) setOpenSuperSet(null);
                            }
                          }}
                          className="p-1.5 rounded-lg flex-shrink-0"
                          style={{
                            backgroundColor: isInSuperSet ? `${groupColor}20` : 'var(--color-surface-2)',
                            color: isInSuperSet ? groupColor : 'var(--color-text-2)',
                          }}
                          title={isInSuperSet ? 'Quitar de superserie' : 'Crear superserie'}
                        >
                          <Layers size={14} />
                        </button>
                        {/* Add to open superset */}
                        {!isInSuperSet && openSuperSet && openSuperSet !== ex.exercise_id && (
                          <button
                            onClick={() => { addToSuperSet(ex.exercise_id); setOpenSuperSet(null); }}
                            className="p-1.5 rounded-lg flex-shrink-0"
                            style={{ backgroundColor: `${groupColor}20`, color: groupColor }}
                            title="Añadir a superserie abierta"
                          >
                            <Plus size={14} />
                          </button>
                        )}
                        <div className="flex gap-1">
                          <button onClick={() => addSet(ex.exercise_id)} className="p-1.5 rounded-lg" style={{ backgroundColor: 'var(--color-surface-2)' }}>
                            <Plus size={14} />
                          </button>
                          <button onClick={() => removeExerciseFromWorkout(ex.exercise_id)} className="p-1.5 rounded-lg" style={{ backgroundColor: 'var(--color-surface-2)' }}>
                            <Trash2 size={14} className="text-[var(--color-danger)]" />
                          </button>
                        </div>
                      </div>

                      {/* Sets */}
                      <div className="p-2 space-y-1.5">
                        {ex.sets.map((set, setIdx) => (
                          <div key={set.id} className="flex items-center gap-1.5 text-xs flex-wrap">
                            <span className="w-5 text-center font-mono flex-shrink-0" style={{ color: 'var(--color-text-2)' }}>{setIdx + 1}</span>

                            {/* Set type */}
                            <button
                              onClick={() => {
                                const types: SetType[] = ['normal', 'warmup', 'drop', 'failure', 'superset'];
                                const currentIdx = types.indexOf(set.set_type);
                                updateSetType(ex.exercise_id, set.id, types[(currentIdx + 1) % types.length]);
                              }}
                              className="px-1 py-0.5 rounded text-[10px] font-bold flex-shrink-0 min-w-[20px] text-center transition-all"
                              style={{
                                color: SET_TYPE_COLORS[set.set_type],
                                backgroundColor: set.set_type !== 'normal' ? `${SET_TYPE_COLORS[set.set_type]}20` : 'var(--color-surface-2)',
                                border: set.set_type !== 'normal' ? `1px solid ${SET_TYPE_COLORS[set.set_type]}50` : '1px solid var(--color-border)',
                              }}
                              title={set.set_type === 'normal' ? 'Pulsa para cambiar tipo' : set.set_type}
                            >
                              {SET_TYPE_LABELS[set.set_type] || '—'}
                            </button>

                            {/* Weight */}
                            <div className="relative flex-1 min-w-0">
                              <input
                                type="number"
                                value={set.weight || ''}
                                onChange={e => updateSet(ex.exercise_id, set.id, { weight: parseFloat(e.target.value) || 0 })}
                                placeholder={unit.toUpperCase()}
                                className="w-full px-1.5 py-1 rounded text-center text-sm pr-6"
                                style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                              />
                              <button
                                onClick={() => { setCalcExId(ex.exercise_id); setCalcSetId(set.id); setCalcWeight(set.weight); }}
                                className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded opacity-50 hover:opacity-100"
                                style={{ color: 'var(--color-text-2)' }}
                                title="Calculadora de peso"
                              >
                                <Calculator size={12} />
                              </button>
                            </div>
                            <span className="text-xs flex-shrink-0" style={{ color: 'var(--color-text-2)' }}>×</span>

                            {/* Reps */}
                            <input
                              type="number"
                              value={set.reps || ''}
                              onChange={e => updateSet(ex.exercise_id, set.id, { reps: parseInt(e.target.value) || 0 })}
                              placeholder="Reps"
                              className="w-12 px-1.5 py-1 rounded text-center text-sm flex-shrink-0"
                              style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                            />

                            {/* Set notes */}
                            <button
                              onClick={() => {
                                if (editingSetNotes?.exId === ex.exercise_id && editingSetNotes?.setId === set.id) {
                                  setEditingSetNotes(null);
                                } else {
                                  setEditingSetNotes({ exId: ex.exercise_id, setId: set.id });
                                  setSetNotesValue(set.notes || '');
                                }
                              }}
                              className="p-1 rounded flex-shrink-0"
                              style={{
                                color: set.notes ? 'var(--color-primary)' : 'var(--color-text-2)',
                                backgroundColor: editingSetNotes?.exId === ex.exercise_id && editingSetNotes?.setId === set.id ? 'var(--color-surface-2)' : 'transparent',
                              }}
                            >
                              <MessageSquare size={12} />
                            </button>

                            {/* Complete */}
                            <button
                              onClick={() => completeSet(ex.exercise_id, set.id)}
                              className="w-7 h-7 rounded-full flex items-center justify-center transition-colors flex-shrink-0"
                              style={{
                                backgroundColor: set.completed ? 'var(--color-success)' : 'var(--color-surface-2)',
                                color: set.completed ? '#fff' : 'var(--color-text-2)',
                              }}
                            >
                              <CheckCircle2 size={13} />
                            </button>

                            {/* F291 — PR close indicator: amber trophy when completed set is ≥90% of stored PR */}
                            {set.completed && exercisePRs[ex.exercise_id] && set.weight >= exercisePRs[ex.exercise_id] * 0.9 && (
                              <span
                                className="flex items-center gap-0.5 flex-shrink-0"
                                style={{ color: '#f59e0b' }}
                                title={`¡Cerca del PR! (${Math.round(set.weight / exercisePRs[ex.exercise_id] * 100)}% del récord de ${exercisePRs[ex.exercise_id]}kg)`}
                              >
                                <Trophy size={11} />
                              </span>
                            )}

                            {/* RPE */}
                            <button
                              onClick={() => {
                                const next = set.rpe == null ? 7 : set.rpe >= 10 ? null : set.rpe + 1;
                                updateSetRPE(ex.exercise_id, set.id, next);
                              }}
                              className="px-1 py-0.5 rounded text-[10px] font-bold flex-shrink-0 min-w-[22px] text-center"
                              style={{
                                color: set.rpe != null ? rpeColor(set.rpe) : 'var(--color-text-2)',
                                backgroundColor: set.rpe != null ? `${rpeColor(set.rpe)}20` : 'var(--color-surface-2)',
                                border: set.rpe != null ? `1px solid ${rpeColor(set.rpe)}50` : '1px solid var(--color-border)',
                              }}
                              title={set.rpe != null ? `RPE ${set.rpe}/10 — pulsa para cambiar` : 'RPE — pulsa para añadir'}
                            >
                              {set.rpe != null ? `R${set.rpe}` : 'R—'}
                            </button>
                          </div>
                        ))}

                        {/* Set notes inline */}
                        {editingSetNotes && editingSetNotes.exId === ex.exercise_id && (
                          <div className="flex items-center gap-1.5 px-1">
                            <span className="w-5" />
                            <input
                              value={setNotesValue}
                              onChange={e => setSetNotesValue(e.target.value)}
                              placeholder="Nota de la serie..."
                              className="flex-1 px-2 py-1 rounded text-xs"
                              style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                              autoFocus
                              onKeyDown={e => {
                                if (e.key === 'Enter') { setSetNotes(editingSetNotes.exId, editingSetNotes.setId, setNotesValue); setEditingSetNotes(null); }
                                if (e.key === 'Escape') setEditingSetNotes(null);
                              }}
                            />
                            <button onClick={() => { setSetNotes(editingSetNotes.exId, editingSetNotes.setId, setNotesValue); setEditingSetNotes(null); }} className="p-1 rounded" style={{ color: 'var(--color-success)' }}>
                              <X size={12} />
                            </button>
                            <button onClick={() => setEditingSetNotes(null)} className="p-1 rounded" style={{ color: 'var(--color-text-2)' }}>
                              <X size={12} />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Exercise notes */}
                      <div className="px-3 py-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
                        {editingExNotes === ex.exercise_id ? (
                          <div className="space-y-1.5">
                            <textarea
                              value={exNotesValue}
                              onChange={e => setExNotesValue(e.target.value)}
                              placeholder="Nota sobre este ejercicio..."
                              className="w-full px-2 py-1.5 rounded-lg text-xs resize-none"
                              style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                              rows={2}
                              autoFocus
                            />
                            <div className="flex gap-2">
                              <button onClick={() => { setExerciseNotes(ex.exercise_id, exNotesValue); setEditingExNotes(null); }} className="flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold" style={{ backgroundColor: 'var(--color-success)', color: '#fff' }}>
                                <CheckCircle2 size={10} /> Guardar
                              </button>
                              <button onClick={() => setEditingExNotes(null)} className="px-2 py-1 rounded text-xs" style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text-2)' }}>
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setEditingExNotes(ex.exercise_id); setExNotesValue(ex.notes || ''); }}
                            className="flex items-center gap-1.5 text-xs w-full"
                            style={{ color: ex.notes ? 'var(--color-text)' : 'var(--color-text-2)' }}
                          >
                            <MessageSquare size={11} />
                            <span className="truncate">{ex.notes || 'Añadir nota...'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              });
            })()
          )}
        </div>

        {/* Cancel */}
        <div className="p-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
          <button onClick={cancelWorkout} className="w-full py-2 text-sm rounded-lg" style={{ color: 'var(--color-danger)' }}>
            Cancelar workout
          </button>
        </div>

        {/* Plate Calculator */}
        {calcExId && (
          <PlateCalculator
            unit={unit}
            initialWeight={calcWeight}
            onClose={() => setCalcExId(null)}
            onFill={(weight) => {
              if (calcExId && calcSetId) {
                updateSet(calcExId, calcSetId, { weight });
              }
            }}
          />
        )}

        {/* Copy Exercises Modal */}
        {showCopyModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <div className="w-full max-w-sm rounded-xl p-4 space-y-3" style={{ backgroundColor: 'var(--color-surface-2)' }}>
              <div className="flex items-center justify-between">
                <h3 className="font-bold">Copiar ejercicios</h3>
                <button onClick={() => { setShowCopyModal(false); setCopyTargetWorkout(null); }} className="p-1">
                  <X size={16} />
                </button>
              </div>
              <p className="text-xs" style={{ color: 'var(--color-text-2)' }}>
                Selecciona un workout para copiar sus ejercicios a este workout activo.
              </p>
              {copyTargetWorkout ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 p-2 rounded-lg" style={{ backgroundColor: 'var(--color-surface)' }}>
                    <CheckCircle2 size={14} style={{ color: 'var(--color-primary)' }} />
                    <span className="text-sm font-medium">{copyTargetWorkout.name}</span>
                  </div>
                  <button
                    onClick={() => {
                      if (!copyTargetWorkout) return;
                      const db = getDb();
                      if (!db) return;
                      const sets = getWorkoutSets(db, copyTargetWorkout.id);
                      // Group sets by exercise
                      const setsByEx = new Map<string, WorkoutSet[]>();
                      for (const s of sets) {
                        if (!setsByEx.has(s.exercise_id)) setsByEx.set(s.exercise_id, []);
                        setsByEx.get(s.exercise_id)!.push(s);
                      }
                      // F161 — batch load exercise names to avoid N+1 (F292: use Record-returning getExercisesByIdsAll)
                      const exIds = Array.from(setsByEx.keys());
                      const exerciseNames = getExercisesByIdsAll(db, exIds);

                      // Add each exercise with its sets
                      for (const [exId, exSets] of setsByEx) {
                        const orderedSets = exSets.sort((a, b) => a.set_number - b.set_number);
                        const exName = exerciseNames[exId]?.name || exId;
                        const setsToAdd = orderedSets.map(s => ({
                          reps: s.reps,
                          weight: s.weight,
                          set_type: s.set_type || 'normal',
                        }));
                        addExerciseToWorkout(exId, exName, orderedSets.length, setsToAdd);
                      }
                      setShowCopyModal(false);
                      setCopyTargetWorkout(null);
                    }}
                    className="w-full py-2 rounded-lg text-sm font-semibold"
                    style={{ backgroundColor: 'var(--color-primary)', color: '#000' }}
                  >
                    Copiar {copyTargetExerciseCount} ejercicios
                  </button>
                  <button onClick={() => setCopyTargetWorkout(null)} className="w-full py-1.5 text-xs" style={{ color: 'var(--color-text-2)' }}>
                    ← Elegir otro
                  </button>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {workoutHistory.filter(w => w.finished_at).length === 0 ? (
                    <p className="text-xs text-center py-4" style={{ color: 'var(--color-text-2)' }}>
                      No hay workouts completados
                    </p>
                  ) : (
                    workoutHistory.filter(w => w.finished_at).slice(0, 10).map(w => (
                      <button
                        key={w.id}
                        onClick={() => {
                        setCopyTargetWorkout(w);
                        // F150 — compute exercise count for this copy target
                        const db = getDb();
                        if (db) {
                          const sets = getWorkoutSets(db, w.id);
                          const exIds = new Set(sets.map((s: WorkoutSet) => s.exercise_id));
                          setCopyTargetExerciseCount(exIds.size);
                        }
                      }}
                        className="w-full flex items-center gap-2 p-2 rounded-lg text-left"
                        style={{ backgroundColor: 'var(--color-surface)' }}
                      >
                        <FileText size={12} style={{ color: 'var(--color-text-2)' }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{w.name}</p>
                          <p className="text-xs" style={{ color: 'var(--color-text-2)' }}>
                            {w.started_at ? format(new Date(w.started_at), 'd MMM', { locale: es }) : ''}
                          </p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Workout Summary Modal (F66) */}
        {summaryModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
            <div className="w-full max-w-sm rounded-2xl overflow-hidden" style={{ backgroundColor: 'var(--color-surface-2)' }}>
              {/* Header */}
              <div className="p-5 text-center" style={{ background: 'linear-gradient(135deg, var(--color-primary) 0%, #6366f1 100%)' }}>
                <div className="w-14 h-14 rounded-full mx-auto mb-2 flex items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,20%)' }}>
                  <CheckCircle2 size={28} color="#fff" />
                </div>
                <h2 className="text-xl font-bold text-white">¡Workout Terminado!</h2>
                {/* F327 — Editable workout name with suggestions */}
                <div className="flex items-center justify-center gap-1 mt-1">
                  <p className="text-sm text-white opacity-90">{summaryModal.name}</p>
                  <button
                    onClick={() => {
                      const newName = window.prompt('Nombre del workout:', summaryModal.name);
                      if (newName && newName.trim() && newName !== summaryModal.name) {
                        const db = getDb();
                        if (db) {
                          updateWorkoutName(db, summaryModal.workoutId, newName.trim());
                          setSummaryModal({ ...summaryModal, name: newName.trim() });
                          toastStore.success('Nombre actualizado', newName.trim());
                        }
                      }
                    }}
                    className="p-1 rounded"
                    style={{ backgroundColor: 'rgba(255,255,255,15%)' }}
                  >
                    <Edit2 size={12} color="#fff" />
                  </button>
                </div>
                {/* F327 — Workout name suggestions */}
                {suggestedNames.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-1 mt-2">
                    {suggestedNames.slice(0, 8).map((name) => (
                      <button
                        key={name}
                        onClick={() => {
                          if (name === summaryModal.name) return;
                          const db = getDb();
                          if (db) {
                            updateWorkoutName(db, summaryModal.workoutId, name);
                            setSummaryModal({ ...summaryModal, name });
                            toastStore.success('Nombre aplicado', name);
                          }
                        }}
                        className="px-2 py-0.5 rounded-full text-xs"
                        style={{
                          backgroundColor: name === summaryModal.name ? 'rgba(255,255,255,30%)' : 'rgba(255,255,255,15%)',
                          color: '#fff',
                          border: name === summaryModal.name ? '1px solid rgba(255,255,255,40%)' : '1px solid transparent',
                        }}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                )}
                {/* F193 — Intensity classification badge */}
                {summaryModal.intensity && (
                  <div
                    className="inline-block mt-2 px-3 py-1 rounded-full text-xs font-bold"
                    style={{ backgroundColor: summaryModal.intensity.bg, color: summaryModal.intensity.color }}
                  >
                    {summaryModal.intensity.label}
                  </div>
                )}
              </div>

              {/* Stats grid */}
              <div className="p-4 grid grid-cols-2 gap-3">
                {/* Duration */}
                <div className="p-3 rounded-xl text-center" style={{ backgroundColor: 'var(--color-surface)' }}>
                  <Clock size={16} className="mx-auto mb-1" style={{ color: 'var(--color-primary)' }} />
                  <p className="text-lg font-bold">{formatDuration(summaryModal.duration)}</p>
                  <p className="text-[10px]" style={{ color: 'var(--color-text-2)' }}>Duración</p>
                </div>
                {/* Volume */}
                <div className="p-3 rounded-xl text-center" style={{ backgroundColor: 'var(--color-surface)' }}>
                  <Dumbbell size={16} className="mx-auto mb-1" style={{ color: 'var(--color-primary)' }} />
                  <p className="text-lg font-bold">
                    {summaryModal.volume > 0 ? `${(summaryModal.volume / 1000).toFixed(1)}k kg` : '—'}
                  </p>
                  <p className="text-[10px]" style={{ color: 'var(--color-text-2)' }}>Volumen total</p>
                </div>
                {/* Exercises */}
                <div className="p-3 rounded-xl text-center" style={{ backgroundColor: 'var(--color-surface)' }}>
                  <Layers size={16} className="mx-auto mb-1" style={{ color: 'var(--color-primary)' }} />
                  <p className="text-lg font-bold">{summaryModal.exerciseCount}</p>
                  <p className="text-[10px]" style={{ color: 'var(--color-text-2)' }}>Ejercicios</p>
                </div>
                {/* Sets */}
                <div className="p-3 rounded-xl text-center" style={{ backgroundColor: 'var(--color-surface)' }}>
                  <Award size={16} className="mx-auto mb-1" style={{ color: 'var(--color-primary)' }} />
                  <p className="text-lg font-bold">{summaryModal.setCount}</p>
                  <p className="text-[10px]" style={{ color: 'var(--color-text-2)' }}>Series completadas</p>
                </div>
              </div>

              {/* F166 — Set completion rate progress bar */}
              {summaryModal.plannedSetCount > 0 && (
                <div className="mx-4 mb-3 p-3 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>Series completadas</span>
                    <span className="text-sm font-bold" style={{ color: 'var(--color-primary)' }}>
                      {summaryModal.completedSetCount}/{summaryModal.plannedSetCount}
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-surface-2)' }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.round((summaryModal.completedSetCount / summaryModal.plannedSetCount) * 100)}%`,
                        backgroundColor: summaryModal.completedSetCount === summaryModal.plannedSetCount
                          ? '#22c55e'
                          : summaryModal.completedSetCount < summaryModal.plannedSetCount * 0.5
                            ? '#ef4444'
                            : 'var(--color-primary)',
                      }}
                    />
                  </div>
                  <p className="text-[10px] mt-1 text-right" style={{ color: 'var(--color-text-2)' }}>
                    {summaryModal.completedSetCount === summaryModal.plannedSetCount
                      ? '✓ 100% completado'
                      : `${Math.round((summaryModal.completedSetCount / summaryModal.plannedSetCount) * 100)}% completado — ${summaryModal.plannedSetCount - summaryModal.completedSetCount} series vacías`}
                  </p>
                </div>
              )}

              {/* F51 — Average RPE across completed sets */}
              {summaryModal.avgRpe != null && (
                <div className="mx-4 mb-3 p-3 rounded-xl flex items-center justify-between" style={{ backgroundColor: 'var(--color-surface)' }}>
                  <div className="flex items-center gap-2">
                    <Target size={14} style={{ color: 'var(--color-primary)' }} />
                    <span className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>RPE medio</span>
                  </div>
                  <span className="text-sm font-bold" style={{ color: 'var(--color-primary)' }}>
                    RPE {summaryModal.avgRpe}
                  </span>
                </div>
              )}

              {/* Best set */}
              {summaryModal.bestSet && summaryModal.bestSet.weight > 0 && (
                <div className="mx-4 mb-3 p-3 rounded-xl flex items-center justify-between" style={{ backgroundColor: 'rgba(59,130,246,0.1)' }}>
                  <div className="flex items-center gap-2">
                    <Trophy size={14} style={{ color: '#3b82f6' }} />
                    <span className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>Mejor serie</span>
                  </div>
                  <span className="text-sm font-bold" style={{ color: '#3b82f6' }}>
                    {summaryModal.bestSet.weight} {unit === 'lbs' ? 'lb' : 'kg'} × {summaryModal.bestSet.reps}
                  </span>
                </div>
              )}

              {/* F189 — Star rating */}
              <div className="mx-4 mb-3">
                <p className="text-[10px] font-medium mb-2" style={{ color: 'var(--color-text-2)' }}>Valoración</p>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      onClick={() => setModalRating(star === modalRating ? 0 : star)}
                      className="p-1 rounded transition-transform active:scale-90"
                    >
                      <Star
                        size={22}
                        className="transition-colors"
                        style={{ color: star <= modalRating ? '#f59e0b' : 'var(--color-surface-2)', fill: star <= modalRating ? '#f59e0b' : 'transparent' }}
                      />
                    </button>
                  ))}
                </div>
              </div>

              {/* F168 — Tags quick-select */}
              <div className="mx-4 mb-3">
                <p className="text-[10px] font-medium mb-2" style={{ color: 'var(--color-text-2)' }}>Etiquetas</p>
                <div className="flex gap-1.5 flex-wrap">
                  {WORKOUT_TAGS.map(tag => {
                    const selected = modalTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        onClick={() => {
                          setModalTags(prev =>
                            prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
                          );
                        }}
                        className="px-2.5 py-1 rounded-full text-xs font-medium capitalize transition-all"
                        style={{
                          backgroundColor: selected ? 'var(--color-primary)' : 'var(--color-surface)',
                          color: selected ? '#000' : 'var(--color-text-2)',
                          border: selected ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                          fontWeight: selected ? '600' : '400',
                        }}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* F255 — Feel emoji tags quick-select */}
              <div className="mx-4 mb-3">
                <p className="text-[10px] font-medium mb-2" style={{ color: 'var(--color-text-2)' }}>¿Cómo te sentiste?</p>
                <div className="flex gap-2 flex-wrap">
                  {FEEL_TAGS.map(ft => {
                    const selected = modalTags.includes(ft.value);
                    return (
                      <button
                        key={ft.value}
                        onClick={() => {
                          setModalTags(prev =>
                            prev.includes(ft.value) ? prev.filter(t => t !== ft.value) : [...prev, ft.value]
                          );
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all"
                        style={{
                          backgroundColor: selected ? 'var(--color-primary)' : 'var(--color-surface)',
                          color: selected ? '#000' : 'var(--color-text)',
                          border: selected ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                          fontWeight: selected ? '600' : '400',
                        }}
                        title={ft.label}
                      >
                        <span className="text-base">{ft.emoji}</span>
                        <span className="text-xs">{ft.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* F179 — Workout notes in the finish modal */}
              <div className="mx-4 mb-3">
                <p className="text-[10px] font-medium mb-1.5" style={{ color: 'var(--color-text-2)' }}>Notas</p>
                <textarea
                  value={modalNotes}
                  onChange={e => setModalNotes(e.target.value)}
                  placeholder="Añade notas sobre este workout..."
                  rows={2}
                  className="w-full rounded-xl px-3 py-2 text-xs resize-none"
                  style={{
                    backgroundColor: 'var(--color-surface)',
                    color: 'var(--color-text)',
                    border: '1px solid var(--color-border)',
                  }}
                />
              </div>

              {/* PRs achieved */}
              {summaryModal.prs && summaryModal.prs.length > 0 && (
                <div className="mx-4 mb-3 p-3 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
                  <p className="text-xs font-bold mb-2 flex items-center gap-1.5">
                    <Award size={12} style={{ color: 'var(--color-primary)' }} />
                    Nuevos récords personales
                  </p>
                  {summaryModal.prs.map((pr, i) => (
                    <p key={i} className="text-xs font-medium" style={{ color: 'var(--color-primary)' }}>
                      {pr.exerciseName} — {pr.type === 'max_weight' ? 'Peso máx.' : '1RM'} {pr.value} kg
                    </p>
                  ))}
                </div>
              )}

              {/* Close button */}
              <div className="p-4 pt-2">
                <button
                  onClick={() => {
                    // F168 — Save edited tags using the stored workout ID (not getWorkouts which has a 50-workout limit)
                    // F179 — Save edited notes
                    if (summaryModal?.workoutId) {
                      const db = getDb();
                      if (db) {
                        updateWorkoutTags(db, summaryModal.workoutId, modalTags);
                        updateWorkoutNotes(db, summaryModal.workoutId, modalNotes);
                        // F189 — Save rating
                        if (modalRating > 0) {
                          updateWorkoutRating(db, summaryModal.workoutId, modalRating);
                          // F189 fix: update in-memory workoutHistory so rating badge shows immediately without reload
                          setWorkoutHistory(prev => prev.map(w =>
                            w.id === summaryModal.workoutId ? { ...w, rating: modalRating } : w
                          ));
                        }
                      }
                    }
                    if (summaryModal?.prs.length > 0) setPrToast(summaryModal.prs);
                    setSummaryModal(null);
                  }}
                  className="w-full py-3 rounded-xl text-sm font-bold"
                  style={{ backgroundColor: 'var(--color-primary)', color: '#000' }}
                >
                  ¡Genial!
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Rest timer */}
        <RestTimer />

        {/* F4 — PR auto-fill panel */}
        {showPRPanel && (
          <div className="px-4 pb-3">
            <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--color-surface)' }}>
              {/* Panel header */}
              <div className="p-3 flex items-center justify-between border-b" style={{ borderColor: 'var(--color-border)' }}>
                <div className="flex items-center gap-2">
                  <Trophy size={16} style={{ color: 'var(--color-primary)' }} />
                  <span className="font-semibold text-sm">Récords Personales</span>
                </div>
                <button onClick={() => { setShowPRPanel(false); setPrSearch(''); }} className="p-1 rounded">
                  <X size={16} style={{ color: 'var(--color-text-2)' }} />
                </button>
              </div>
              {/* Search */}
              <div className="p-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--color-surface-2)' }}>
                  <Search size={14} style={{ color: 'var(--color-text-2)' }} />
                  <input
                    type="text"
                    placeholder="Buscar ejercicio..."
                    value={prSearch}
                    onChange={e => setPrSearch(e.target.value)}
                    className="flex-1 bg-transparent text-sm outline-none"
                    style={{ color: 'var(--color-text)' }}
                  />
                  {prSearch && (
                    <button onClick={() => setPrSearch('')} className="p-0.5 rounded hover:bg-black/10">
                      <X size={12} style={{ color: 'var(--color-text-2)' }} />
                    </button>
                  )}
                </div>
              </div>
              {/* PR list */}
              <div className="max-h-64 overflow-y-auto">
              <PRPanelContent
                prSearch={prSearch}
                activeWorkoutExercises={activeWorkout.exercises}
                justAddedIds={justAddedIds}
                onAutoFill={(exerciseId: string, exerciseName: string, sets: { reps: number; weight: number; set_type: SetType }[]) => {
                  const alreadyIn = activeWorkout.exercises.some((e: ActiveWorkoutExercise) => e.exercise_id === exerciseId);
                  if (alreadyIn) return;
                  const setsToAdd = sets.map((s, i) => ({
                    id: generateId(),
                    set_number: i + 1,
                    set_type: s.set_type,
                    reps: s.reps,
                    weight: s.weight,
                    rpe: null,
                    notes: '',
                    completed: false,
                  }));
                  // F245b — update state so "Añadido" state reflects synchronously
                  setJustAddedIds(prev => new Set([...prev, exerciseId]));
                  addExerciseToWorkout(exerciseId, exerciseName, undefined, setsToAdd);
                }}
              />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ===== HISTORY VIEW =====
  return (
    <div className="flex flex-col h-full">
      {/* PR Toast (F16) */}
      {prToast && prToast.length > 0 && (
        <div
          className="mx-4 mt-3 p-3 rounded-xl flex items-start gap-3 cursor-pointer"
          style={{ backgroundColor: 'var(--color-primary)', color: '#000' }}
          onClick={() => setPrToast(null)}
        >
          <Award size={16} className="flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold mb-0.5">🎉 ¡Nuevo Récord Personal!</p>
            {prToast.map((pr, i) => (
              <p key={i} className="text-xs font-medium">
                {pr.exerciseName} — {pr.type === 'max_weight' ? 'Peso máx.' : '1RM'} {pr.value} kg
              </p>
            ))}
          </div>
          <button onClick={() => setPrToast(null)} className="p-0.5 flex-shrink-0">
            <X size={14} />
          </button>
        </div>
      )}

      {/* F100 — Streak milestone celebration toast */}
      {streakMilestone && (
        <div
          className="mx-4 mt-3 p-4 rounded-xl flex items-center gap-3 cursor-pointer"
          style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', color: '#fff' }}
          onClick={() => setStreakMilestone(null)}
        >
          <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(255,255,255,25%)' }}>
            <Trophy size={20} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold">🔥 ¡Racha de {streakMilestone} días!</p>
            <p className="text-xs opacity-90">Keep it up! Consistency is key.</p>
          </div>
          <button onClick={(e) => { e.stopPropagation(); setStreakMilestone(null); }} className="p-1 flex-shrink-0">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="p-4 border-b flex items-center justify-between">
        <h1 className="text-2xl font-bold">Workouts</h1>
        <button
          onClick={() => setShowTemplateModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
          style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          <FileText size={12} />
          Templates
        </button>
      </div>

      <div className="p-4">
        {/* F334 — Quick-start workout name chips */}
        {!activeWorkout && quickStartNames.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3 justify-center">
            {quickStartNames.map((name) => (
              <button
                key={name}
                onClick={() => handleQuickStart(name)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium"
                style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
              >
                ▶ {name}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={handleStartWorkout}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-xl text-sm font-bold"
          style={{ backgroundColor: 'var(--color-primary)', color: '#000' }}
        >
          <Play size={18} />
          Iniciar Workout
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {/* F79 — Tag filter chips */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          <button
            onClick={() => setSelectedTags([])}
            className="px-2.5 py-1 rounded-full text-xs font-medium border transition-colors"
            style={{
              backgroundColor: selectedTags.length === 0 ? 'var(--color-primary)' : 'transparent',
              color: selectedTags.length === 0 ? '#000' : 'var(--color-text-2)',
              borderColor: selectedTags.length === 0 ? 'var(--color-primary)' : 'var(--color-border)',
            }}
          >
            Todas
          </button>
          {WORKOUT_TAGS.map(tag => {
            const selected = selectedTags.includes(tag);
            return (
              <button
                key={tag}
                onClick={() => {
                  setSelectedTags(selected ? [] : [tag]);
                }}
                className="px-2.5 py-1 rounded-full text-xs font-medium border transition-colors"
                style={{
                  backgroundColor: selected ? 'var(--color-primary)' : 'transparent',
                  color: selected ? '#000' : 'var(--color-text-2)',
                  borderColor: selected ? 'var(--color-primary)' : 'var(--color-border)',
                }}
              >
                {tag}
              </button>
            );
          })}
        </div>

        {/* F243 — Time-of-day filter chips */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          <button
            onClick={() => setSelectedTimeOfDay(null)}
            className="px-2.5 py-1 rounded-full text-xs font-medium border transition-colors"
            style={{
              backgroundColor: selectedTimeOfDay === null ? 'var(--color-primary)' : 'transparent',
              color: selectedTimeOfDay === null ? '#000' : 'var(--color-text-2)',
              borderColor: selectedTimeOfDay === null ? 'var(--color-primary)' : 'var(--color-border)',
            }}
          >
            Todos
          </button>
          {(Object.keys(TIME_OF_DAY_LABELS) as TimeOfDay[]).map(tod => {
            const selected = selectedTimeOfDay === tod;
            return (
              <button
                key={tod}
                onClick={() => setSelectedTimeOfDay(selected ? null : tod)}
                className="px-2.5 py-1 rounded-full text-xs font-medium border transition-colors"
                style={{
                  backgroundColor: selected ? TIME_OF_DAY_COLORS[tod] : 'transparent',
                  color: selected ? '#fff' : 'var(--color-text-2)',
                  borderColor: selected ? TIME_OF_DAY_COLORS[tod] : 'var(--color-border)',
                }}
              >
                {TIME_OF_DAY_LABELS[tod]}
              </button>
            );
          })}
        </div>

        {/* F144 — Notes search input */}
        {notesSearch.length > 0 && (
          <div className="mb-2 px-1 flex items-center gap-2">
            <Search size={12} style={{ color: 'var(--color-primary)' }} />
            <span className="text-xs" style={{ color: 'var(--color-text-2)' }}>
              {filteredHistory.length === 1 ? '1 resultado' : `${filteredHistory.length} resultados`}
            </span>
            <button
              onClick={() => setNotesSearch('')}
              className="ml-auto p-0.5 rounded"
              style={{ color: 'var(--color-text-2)' }}
            >
              <X size={12} />
            </button>
          </div>
        )}

        {/* F224 — Muscle group filter chips — tappable row to select muscle groups */}
        <div className="mb-2 px-1 flex items-center gap-1.5 overflow-x-auto">
          <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--color-text-2)' }}>Músculo:</span>
          {WORKOUT_MUSCLE_GROUPS.map(mg => {
            const isActive = selectedMuscleGroups.includes(mg);
            return (
              <button
                key={mg}
                onClick={() => {
                  if (isActive) {
                    setSelectedMuscleGroups(prev => prev.filter(m => m !== mg));
                  } else {
                    setSelectedMuscleGroups(prev => [...prev, mg]);
                  }
                }}
                className="flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium transition-all"
                style={{
                  backgroundColor: isActive ? 'var(--color-primary)' : 'var(--color-surface-2)',
                  color: isActive ? '#000' : 'var(--color-text-2)',
                }}
              >
                {MUSCLE_GROUP_LABELS[mg]}
              </button>
            );
          })}
        </div>

        {/* F224 — Muscle group filter chips for workout history */}
        {selectedMuscleGroups.length > 0 && (
          <div className="mb-2 px-1 flex items-center gap-1.5 flex-wrap">
            {selectedMuscleGroups.map(mg => (
              <span
                key={mg}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)' }}
              >
                {MUSCLE_GROUP_LABELS[mg] || mg}
                <button
                  onClick={() => setSelectedMuscleGroups(prev => prev.filter(m => m !== mg))}
                  className="ml-0.5 flex-shrink-0"
                  style={{ color: 'var(--color-text-2)' }}
                >
                  <X size={10} />
                </button>
              </span>
            ))}
            <button
              onClick={() => setSelectedMuscleGroups([])}
              className="text-xs px-1.5 py-0.5 rounded"
              style={{ color: 'var(--color-text-2)' }}
            >
              Limpiar
            </button>
          </div>
        )}

        {/* F264 — Equipment filter chips */}
        <div className="mb-2 px-1 flex items-center gap-1.5 overflow-x-auto">
          <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--color-text-2)' }}>Equipo:</span>
          {WORKOUT_EQUIPMENT_GROUPS.map(eq => {
            const isActive = selectedEquipment === eq;
            return (
              <button
                key={eq}
                onClick={() => {
                  if (isActive) {
                    setSelectedEquipment(null);
                  } else {
                    setSelectedEquipment(eq);
                  }
                }}
                className="flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium transition-all"
                style={{
                  backgroundColor: isActive ? 'var(--color-primary)' : 'var(--color-surface-2)',
                  color: isActive ? '#000' : 'var(--color-text-2)',
                }}
              >
                {EQUIPMENT_LABELS[eq]}
              </button>
            );
          })}
        </div>

        {/* F264 — Equipment filter active pill */}
        {selectedEquipment && (
          <div className="mb-2 px-1 flex items-center gap-1.5 flex-wrap">
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
              style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)' }}
            >
              {EQUIPMENT_LABELS[selectedEquipment]}
              <button
                onClick={() => setSelectedEquipment(null)}
                className="ml-0.5 flex-shrink-0"
                style={{ color: 'var(--color-text-2)' }}
              >
                <X size={10} />
              </button>
            </span>
            <button
              onClick={() => setSelectedEquipment(null)}
              className="text-xs px-1.5 py-0.5 rounded"
              style={{ color: 'var(--color-text-2)' }}
            >
              Limpiar
            </button>
          </div>
        )}

        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          {/* F329 — Streak calendar chip */}
          {streakDays.size > 0 && (
            <button
              onClick={() => setShowStreakCalendar(!showStreakCalendar)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold"
              style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)' }}
            >
              <span>🔥</span>
              <span>{streakDays.size} días</span>
              <span style={{ color: 'var(--color-text-2)', fontSize: 10 }}>
                {showStreakCalendar ? '▲' : '▼'}
              </span>
            </button>
          )}
          {/* F329 — Streak calendar popup */}
          {showStreakCalendar && (
            <div className="w-full mt-2 p-3 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
              <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-text-2)' }}>Últimos 7 días</p>
              <div className="grid grid-cols-7 gap-1">
                {last7Days.map(({ dateStr, dayLabel, dayNum }) => {
                  const hasWorkout = streakDays.has(dateStr);
                  return (
                    <div key={dateStr} className="flex flex-col items-center">
                      <span className="text-[9px] uppercase" style={{ color: 'var(--color-text-2)' }}>{dayLabel}</span>
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold mt-0.5"
                        style={{
                          backgroundColor: hasWorkout ? 'var(--color-success)' : 'var(--color-surface-2)',
                          color: hasWorkout ? '#fff' : 'var(--color-text-2)',
                        }}
                      >
                        {dayNum}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-2)' }}>
            Historial <span className="text-[10px] font-normal opacity-60">({workoutHistory.length})</span>
          </h2>
          {/* F265 — Date range filter + date jump */}
          <div className="flex items-center gap-2 flex-wrap">
            {(dateRangeStart || dateRangeEnd) ? (
              <div className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)' }}>
                <Calendar size={10} />
                <span className="max-w-[140px] truncate">
                  {dateRangeStart || '…'} → {dateRangeEnd || '…'}
                </span>
                <button onClick={() => { setDateRangeStart(''); setDateRangeEnd(''); }} className="ml-0.5 flex-shrink-0">
                  <X size={10} />
                </button>
              </div>
            ) : (
              <input
                type="date"
                value={dateRangeStart}
                onChange={e => setDateRangeStart(e.target.value)}
                className="px-2 py-1 rounded-lg text-xs"
                style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', outline: 'none', border: '1px solid var(--color-border)' }}
                title="Desde fecha"
              />
            )}
            {dateRangeStart && !dateRangeEnd && (
              <>
                <span className="text-xs" style={{ color: 'var(--color-text-2)' }}>→</span>
                <input
                  type="date"
                  value={dateRangeEnd}
                  onChange={e => setDateRangeEnd(e.target.value)}
                  className="px-2 py-1 rounded-lg text-xs"
                  style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', outline: 'none', border: '1px solid var(--color-border)' }}
                  title="Hasta fecha"
                />
              </>
            )}
          </div>
          {/* F144 — Notes search input: visible when notesSearch has content, otherwise shows a toggle button */}
          <div className="flex items-center gap-2">
            <div className="relative">
              {notesSearch.length > 0 ? (
                <div className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)' }}>
                  <Search size={10} />
                  <span className="max-w-[100px] truncate">{notesSearch}</span>
                  <button onClick={() => setNotesSearch('')} className="ml-0.5 flex-shrink-0">
                    <X size={10} />
                  </button>
                </div>
              ) : (
                <input
                  type="text"
                  value={notesSearch}
                  onChange={e => setNotesSearch(e.target.value)}
                  placeholder="Buscar en notas..."
                  className="px-2 py-1 rounded-lg text-xs w-[120px]"
                  style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', outline: 'none' }}
                />
              )}
            </div>
            <button
              onClick={() => setViewMode('list')}
              className="px-2 py-1 rounded text-[10px] font-medium"
              style={{
                backgroundColor: viewMode === 'list' ? 'var(--color-surface)' : 'transparent',
                color: viewMode === 'list' ? 'var(--color-text)' : 'var(--color-text-2)',
              }}
            >
              <Layers size={12} />
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className="px-2 py-1 rounded text-[10px] font-medium"
              style={{
                backgroundColor: viewMode === 'calendar' ? 'var(--color-surface)' : 'transparent',
                color: viewMode === 'calendar' ? 'var(--color-text)' : 'var(--color-text-2)',
              }}
            >
              <Calendar size={12} />
            </button>
            {viewMode === 'list' && (['date', 'duration', 'volume'] as const).map(s => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                className="px-2 py-1 rounded text-[10px] font-medium uppercase tracking-wide"
                style={{
                  backgroundColor: sortBy === s ? 'var(--color-primary)' : 'var(--color-surface)',
                  color: sortBy === s ? '#000' : 'var(--color-text-2)',
                }}
              >
                {s === 'date' ? 'Fecha' : s === 'duration' ? 'Duración' : 'Volumen'}
              </button>
            ))}
            {viewMode === 'list' && (
              <button
                onClick={() => { setCompareMode(!compareMode); if (compareMode) setSelectedForCompare(new Set()); }}
                className="px-2 py-1 rounded text-[10px] font-medium uppercase tracking-wide"
                style={{
                  backgroundColor: compareMode ? 'var(--color-primary)' : 'var(--color-surface)',
                  color: compareMode ? '#000' : 'var(--color-text-2)',
                }}
              >
                <GitCompare size={12} />
              </button>
            )}
            {compareMode && selectedForCompare.size === 2 && (
              <button
                onClick={() => {
                  const ids = Array.from(selectedForCompare);
                  navigate(`/workout-compare?a=${ids[0]}&b=${ids[1]}`);
                }}
                className="px-3 py-1 rounded text-[10px] font-semibold uppercase tracking-wide"
                style={{ backgroundColor: 'var(--color-primary)', color: '#000' }}
              >
                Comparar 2
              </button>
            )}
          </div>
        </div>

        {viewMode === 'calendar' && (
          <div className="mb-3">
            <CalendarView
              workoutHistory={workoutHistory}
              onSelectWorkout={(id) => navigate(`/workout/${id}`)}
            />
          </div>
        )}

          {filteredHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-8">
              <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--color-surface)' }}>
                <DumbbellIcon size={32} className="opacity-20" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>No hay workouts todavía</p>
                <p className="text-xs mt-1" style={{ color: 'var(--color-text-2)' }}>¡Empieza tu primer workout y registra tu progreso!</p>
              </div>
              <button
                onClick={handleStartWorkout}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold"
                style={{ backgroundColor: 'var(--color-primary)', color: '#000' }}
              >
                <Play size={16} />
                Empezar
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredHistory.map(w => {
                // F146 — use pre-loaded batch data instead of per-card DB queries
                const batchData = workoutSetsBatch.get(w.id);
                const wSets = batchData?.sets ?? [];
                const wVolume = batchData?.volume ?? 0;
                const exCount = new Set(wSets.map((s: WorkoutSet) => s.exercise_id)).size;
                const intensity = getIntensity(w, wVolume);
                // F58 — best set: highest weight × reps across all sets
                const bestSet = wSets.reduce((best: WorkoutSet | null, s: WorkoutSet) => {
                  const vol = (s.weight || 0) * (s.reps || 0);
                  const bestVol = (best?.weight || 0) * (best?.reps || 0);
                  return vol > bestVol ? s : best;
                }, null);
                const bestSetLabel = bestSet && bestSet.weight > 0
                  ? `${bestSet.weight} ${unit === 'lbs' ? 'lb' : 'kg'} × ${bestSet.reps}`
                  : null;
                // F288 — Top exercise by volume: which exercise contributed most volume to this workout
                const exVolMap = new Map<string, number>();
                wSets.forEach((s: WorkoutSet) => { exVolMap.set(s.exercise_id, (exVolMap.get(s.exercise_id) || 0) + (s.weight || 0) * (s.reps || 0)); });
                let topExId = ''; let topExVol = 0;
                exVolMap.forEach((vol, exId) => { if (vol > topExVol) { topExVol = vol; topExId = exId; } });
                const topExName = topExId && allExerciseNames[topExId]?.name || '';
                const topExChip = topExName && topExVol > 0
                  ? <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ backgroundColor: 'rgba(59,130,246,0.12)', color: '#3b82f6' }} title={`Ejercicio con mayor volumen: ${topExName} (${topExVol}kg)`}><span className="hidden">🏋️</span>{topExName}</span>
                  : null;
                // F107 — workout average rest time — F146 uses pre-loaded restTimeBatch
                const wRestData = restTimeBatch.get(w.id);
                const wAvgRest = wRestData?.avg ?? 0;
                const wAvgRestColor = getRestTimeColor(wAvgRest);
                // F98 — workout quality score: hoisted + avgVolume/sortedHistory passed as args
                const qualityScore = wSets.length > 0 ? computeQualityScore(wSets, wVolume, w.duration_seconds || 0, avgVolume, sortedHistory) : 0;
                const qualityColor = qualityScore >= 80 ? '#22c55e' : qualityScore >= 50 ? '#eab308' : '#ef4444';
                return (
                  <div
                    key={w.id}
                    className="flex flex-col rounded-xl cursor-pointer transition-opacity hover:opacity-80"
                    style={{ backgroundColor: compareMode ? (selectedForCompare.has(w.id!) ? 'var(--color-surface-2)' : 'var(--color-surface)') : 'var(--color-surface)' }}
                    onClick={() => { if (compareMode) { toggleCompare(w.id!); } else { navigate(`/workout/${w.id}`); } }}
                  >
                    {/* Fila principal: icono + contenido + duración */}
                    <div className="flex flex-col gap-3 p-3">
                    {compareMode ? (
                      <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--color-surface-2)' }}>
                        {selectedForCompare.has(w.id!) ? (
                          <CheckCircle2 size={18} style={{ color: 'var(--color-primary)' }} />
                        ) : (
                          <Circle size={18} style={{ color: 'var(--color-text-2)' }} />
                        )}
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--color-surface-2)' }}>
                        <CheckCircle2 size={18} className="text-[var(--color-success)]" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate flex items-center gap-1">
                        {w.name}
                        {/* F189 — Star rating badge in history card */}
                        {w.rating && w.rating > 0 && (
                          <span className="flex items-center gap-0.5 text-xs font-bold" style={{ color: '#f59e0b' }}>
                            <Star size={11} style={{ fill: '#f59e0b' }} />
                            {w.rating}
                          </span>
                        )}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--color-text-2)' }}>
                        {w.started_at ? format(new Date(w.started_at), "d 'de' MMMM, yyyy", { locale: es }) : ''}
                        {/* F243 — Time-of-day badge */}
                        {(() => {
                          const tod = getTimeOfDay(w.started_at);
                          if (!tod) return null;
                          return (
                            <span
                              className="ml-1.5 px-1 py-0 rounded text-[10px] font-medium"
                              style={{ backgroundColor: `${TIME_OF_DAY_COLORS[tod]}25`, color: TIME_OF_DAY_COLORS[tod] }}
                              title={`Entreno de ${TIME_OF_DAY_LABELS[tod]}`}
                            >
                              {TIME_OF_DAY_LABELS[tod]}
                            </span>
                          );
                        })()}
                        {w.notes && <span className="ml-2 inline-flex items-center gap-0.5"><MessageSquare size={9} /> nota</span>}
                      </p>
                      {/* F288 — Top exercise by volume chip */}
                      {topExChip && (
                        <p className="text-xs truncate">{topExChip}</p>
                      )}
                      {w.tags && w.tags.length > 0 && (
                        <div className="flex gap-1 mt-0.5 flex-wrap">
                          {(w.tags as string[]).map(tag => {
                            // F255 + F254 — Feel tags get colored pill style; regular tags use default
                            const feelTag = FEEL_TAGS.find(f => f.value === tag);
                            return (
                              <span
                                key={tag}
                                className="px-1.5 py-0.5 rounded text-xs capitalize"
                                style={feelTag
                                  ? { backgroundColor: 'var(--color-primary)', color: '#000', fontWeight: 600 }
                                  : { backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text-2)' }
                                }
                              >
                                {feelTag ? feelTag.emoji : tag}
                              </span>
                            );
                          })}
                        </div>
                      )}
                      {/* Exercise count + volume badges — always shown */}
                      <div className="flex gap-1.5 mt-1 flex-wrap">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text-2)' }}>
                          {exCount} {exCount === 1 ? 'ejercicio' : 'ejercicios'}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text-2)' }}>
                          {wVolume > 0 ? `${(wVolume / 1000).toFixed(1)}k kg` : '—'}
                        </span>
                        {/* F145 — Estimated kcal badge in history card */}
                        {wVolume > 0 && w.duration_seconds && (() => {
                          const kcal = Math.round(0.05 * wVolume + 0.02 * (w.duration_seconds / 60));
                          return kcal > 0 ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }} title="Estimación aproximada">
                              🔥 ~{kcal}
                            </span>
                          ) : null;
                        })()}
                        {intensity && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ backgroundColor: intensity.bg, color: intensity.color }}>
                            {intensity.label}
                          </span>
                        )}
                        {bestSetLabel && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ backgroundColor: 'rgba(59,130,246,0.15)', color: '#3b82f6' }}>
                            {bestSetLabel}
                          </span>
                        )}
                        {wAvgRest > 0 && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ backgroundColor: `${wAvgRestColor}15`, color: wAvgRestColor }}>
                            ↔ {wAvgRest}s avg
                          </span>
                        )}
                        {/* F306 — PR count badge: count how many sets in this workout match all-time max weight */}
                        {(() => {
                          const wSets = batchData?.sets ?? [];
                          let prCount = 0;
                          for (const s of wSets) {
                            if (s.weight > 0 && exercisePRMap[s.exercise_id] === s.weight) {
                              prCount++;
                            }
                          }
                          return prCount > 0 ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold flex items-center gap-0.5" style={{ backgroundColor: 'rgba(250,204,21,0.12)', color: '#f59e0b' }} title={`${prCount} récord${prCount !== 1 ? 's' : ''} personal${prCount !== 1 ? 'es' : ''} en este workout`}>
                              <Trophy size={9} className="text-amber-400" />
                              {prCount} PR{prCount !== 1 ? 's' : ''}
                            </span>
                          ) : null;
                        })()}
                        {qualityScore > 0 && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ backgroundColor: `${qualityColor}15`, color: qualityColor }} title="Puntuación de calidad (RPE consistencia + eficiencia)">
                            ★ {qualityScore}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-text-2)' }}>
                      <Clock size={12} />
                      {w.duration_seconds ? formatDuration(w.duration_seconds) : '--'}
                    </div>
                    {/* F173+F250 — Expandable per-exercise breakdown: volume bars + top sets */}
                    {exCount >= 1 && (
                      <button
                        className="flex items-center justify-center gap-1 py-1.5 text-xs rounded-b-xl transition-colors"
                        style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text-2)' }}
                        onClick={(e) => { e.stopPropagation(); setExpandedWorkoutId(prev => prev === w.id ? null : w.id!); }}
                      >
                        {expandedWorkoutId === w.id ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        <span>{expandedWorkoutId === w.id ? 'Ocultar' : 'Ver'} ejercicios</span>
                      </button>
                    )}
                    {expandedWorkoutId === w.id && wSets.length > 0 && (() => {
                      // Compute per-exercise volume breakdown + top set
                      const exVolumeMap = new Map<string, number>();
                      const exTopSetMap = new Map<string, { weight: number; reps: number }>();
                      wSets.forEach((s: WorkoutSet) => {
                        const vol = (s.weight || 0) * (s.reps || 0);
                        exVolumeMap.set(s.exercise_id, (exVolumeMap.get(s.exercise_id) || 0) + vol);
                        const prev = exTopSetMap.get(s.exercise_id);
                        if (!prev || s.weight > prev.weight || (s.weight === prev.weight && s.reps > prev.reps)) {
                          exTopSetMap.set(s.exercise_id, { weight: s.weight || 0, reps: s.reps || 0 });
                        }
                      });
                      const sortedExercises = Array.from(exVolumeMap.entries())
                        .sort((a, b) => b[1] - a[1]);
                      const maxVol = sortedExercises[0]?.[1] || 1;
                      return (
                        <div className="px-3 pb-3 pt-1 flex flex-col gap-1.5">
                          {sortedExercises.map(([exId, vol]) => {
                            const exInfo = allExerciseNames[exId];
                            const muscleGroup = exInfo?.muscle_group || '';
                            const pct = Math.round((vol / wVolume) * 100);
                            const topSet = exTopSetMap.get(exId);
                            const barColor = muscleGroup === 'chest' ? '#ef4444'
                              : muscleGroup === 'back' ? '#3b82f6'
                              : muscleGroup === 'legs' ? '#22c55e'
                              : muscleGroup === 'shoulders' ? '#f59e0b'
                              : muscleGroup === 'arms' ? '#8b5cf6'
                              : muscleGroup === 'core' ? '#06b6d4'
                              : 'var(--color-primary)';
                            return (
                              <div key={exId} className="flex items-center gap-2">
                                <span className="text-[10px] font-medium truncate flex-shrink-0 w-24" style={{ color: 'var(--color-text)' }} title={exInfo?.name || exId}>
                                  {exInfo?.name || exId}
                                </span>
                                <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-border)' }}>
                                  <div
                                    className="h-full rounded-full"
                                    style={{ width: `${(vol / maxVol) * 100}%`, backgroundColor: barColor }}
                                  />
                                </div>
                                <span className="text-[10px] font-bold flex-shrink-0" style={{ color: barColor }}>
                                  {vol >= 1000 ? `${(vol / 1000).toFixed(1)}k` : vol}kg
                                </span>
                                <span className="text-[9px] flex-shrink-0" style={{ color: 'var(--color-text-2)' }}>
                                  {pct}%
                                </span>
                                {topSet && topSet.weight > 0 && (
                                  <span className="flex-shrink-0 text-[9px] px-1 py-0.5 rounded" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text-2)' }}>
                                    {topSet.weight} {unit === 'lbs' ? 'lb' : 'kg'} × {topSet.reps}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                    </div>
                  </div>
                );
              })}
          </div>
        )}

        {/* Template Modal */}
        <TemplateModal
          show={showTemplateModal}
          onClose={() => setShowTemplateModal(false)}
          activeWorkout={activeWorkout!}
          onStartFromTemplate={handleStartFromTemplate}
          onSaveAsTemplate={handleSaveAsTemplate}
        />

        {/* Edit Time Modal */}
        {showEditTimeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <div className="w-full max-w-xs rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--color-surface-2)' }}>
              <div className="p-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
                <h2 className="font-bold text-lg">Editar hora de inicio</h2>
              </div>
              <div className="p-4 space-y-4">
                <p className="text-sm" style={{ color: 'var(--color-text-2)' }}>
                  Cambia la hora a la que empezaste el workout. El tiempo transcurrido se mantiene (restando las pausas).
                </p>
                <input
                  type="datetime-local"
                  value={editTimeInput}
                  onChange={e => setEditTimeInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowEditTimeModal(false)}
                    className="flex-1 py-2 rounded-lg text-sm font-medium"
                    style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)' }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {
                      if (editTimeInput) {
                        editWorkoutTime(new Date(editTimeInput).toISOString());
                      }
                      setShowEditTimeModal(false);
                    }}
                    className="flex-1 py-2 rounded-lg text-sm font-semibold"
                    style={{ backgroundColor: 'var(--color-primary)', color: '#000' }}
                  >
                    Guardar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
function TemplateModal({
  show,
  onClose,
  activeWorkout,
  onStartFromTemplate,
  onSaveAsTemplate,
}: {
  show: boolean;
  onClose: () => void;
  activeWorkout: {
    id: string;
    name: string;
    notes: string;
    tags: string[];
    startedAt: string;
    routineId: string | null;
    exercises: ActiveWorkoutExercise[];
    superSets: string[][];
    pausedAt: string | null;
    totalPausedSeconds: number;
  };
  onStartFromTemplate: (routineId: string) => void;
  onSaveAsTemplate: (name: string) => void;
}) {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [templateName, setTemplateName] = useState('');
  const [tab, setTab] = useState<'use' | 'save'>('use');

  useEffect(() => {
    if (show) {
      const db = getDb();
      if (db) setRoutines(getAllRoutines(db));
    }
  }, [show]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="w-full max-w-sm rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--color-surface-2)' }}>
        <div className="flex border-b" style={{ borderColor: 'var(--color-border)' }}>
          <button
            onClick={() => setTab('use')}
            className="flex-1 py-2.5 text-sm font-medium"
            style={{ backgroundColor: tab === 'use' ? 'var(--color-surface)' : 'transparent', color: tab === 'use' ? 'var(--color-primary)' : 'var(--color-text-2)' }}
          >
            Usar template
          </button>
          <button
            onClick={() => setTab('save')}
            className="flex-1 py-2.5 text-sm font-medium"
            style={{ backgroundColor: tab === 'save' ? 'var(--color-surface)' : 'transparent', color: tab === 'save' ? 'var(--color-primary)' : 'var(--color-text-2)' }}
          >
            Guardar
          </button>
        </div>

        <div className="p-4 max-h-80 overflow-y-auto">
          {tab === 'use' ? (
            routines.length === 0 ? (
              <p className="text-xs text-center py-4" style={{ color: 'var(--color-text-2)' }}>
                No hay templates guardados
              </p>
            ) : (
              <div className="space-y-1.5">
                {routines.map(r => (
                  <button
                    key={r.id}
                    onClick={() => { onStartFromTemplate(r.id); onClose(); }}
                    className="w-full flex items-center gap-2 p-2.5 rounded-lg text-left"
                    style={{ backgroundColor: 'var(--color-surface)' }}
                  >
                    <FileText size={14} style={{ color: 'var(--color-primary)' }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{r.name}</p>
                      {r.description && <p className="text-xs truncate" style={{ color: 'var(--color-text-2)' }}>{r.description}</p>}
                    </div>
                    <Play size={12} style={{ color: 'var(--color-text-2)' }} />
                  </button>
                ))}
              </div>
            )
          ) : (
            <div className="space-y-3">
              <input
                type="text"
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
                placeholder="Nombre del template..."
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
              />
              <button
                onClick={() => {
                  if (templateName.trim()) {
                    onSaveAsTemplate(templateName.trim());
                    setTemplateName('');
                    onClose();
                  }
                }}
                disabled={!templateName.trim() || !activeWorkout}
                className="w-full py-2.5 rounded-lg text-sm font-semibold disabled:opacity-30"
                style={{ backgroundColor: 'var(--color-primary)', color: '#000' }}
              >
                Guardar workout actual
              </button>
              {!activeWorkout && (
                <p className="text-xs text-center" style={{ color: 'var(--color-text-2)' }}>
                  Inicia un workout primero para guardarlo
                </p>
              )}
            </div>
          )}
        </div>

        <div className="p-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
          <button onClick={onClose} className="w-full py-2 text-sm rounded-lg" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text-2)' }}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
