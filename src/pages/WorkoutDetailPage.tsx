/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, Edit2, Check, X, MessageSquare, Trash2, Timer, GitCompare, RotateCcw, Layers, Copy, Share2, Target, Plus, Search, GripVertical, AlertTriangle, Save, FileText, Trophy, Star, Link, Weight, Flame, Tag } from 'lucide-react';
import { getDb, generateId } from '../database/init';
import { getWorkoutById, getWorkoutSets, getExercisesByIdsAll, getWorkoutExerciseOrder, getRestTimeStats, getWorkouts, getWorkoutCount, getPreviousExerciseSets, getRoutineExerciseTargetRPEMap, searchExercises, getLastExerciseSets, getAverageWorkoutDuration, getAverageWorkoutVolume, getPersonalRecordsByIdsAll, getWarmupSets, getLastWeightPerExerciseAll, getRestTimeAnalytics, getWeeklyVolumeComparison } from '../database/queries';
import { updateWorkoutNotes, updateWorkoutSetNotes, updateWorkoutSetRPE, updateWorkoutName, updateWorkoutDate, reorderWorkoutExercises, removeExerciseFromWorkoutDb, saveRoutine, saveRoutineExercise, saveWorkout, updateWorkoutTags } from '../database/mutations';
import { useWorkoutStore } from '../store/workoutStore';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useSettingsStore } from '../store/settingsStore';
import type { Workout, WorkoutSet, SetType, Exercise, Equipment, PersonalRecord } from '../types';
import WorkoutShareCard from '../components/WorkoutShareCard';
import WorkoutShare from '../components/WorkoutShare';
import { toastStore } from '../components/ui/toastStore';

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

function rpeColor(rpe: number): string {
  if (rpe <= 5) return '#22c55e';
  if (rpe <= 7) return '#eab308';
  if (rpe <= 8) return '#f97316';
  return '#ef4444';
}

// F294 — Workout quality score: RPE consistency (0-50) + volume efficiency (0-50)
function computeQualityScore(sets: WorkoutSet[], volume: number, durationSec: number, avgVolume: number, sortedHistory: Workout[]): number {
  if (sets.length === 0) return 0;
  // Filter working sets (exclude warmup and drop sets)
  const workingSets = sets.filter((s: WorkoutSet) => s.set_type !== 'warmup' && s.set_type !== 'drop');
  // RPE consistency score (0-50 points): lower variance = higher score
  const rpeSets = workingSets.filter((s: WorkoutSet) => s.rpe != null && s.rpe > 0);
  let rpeScore = 25;
  if (rpeSets.length >= 3) {
    const rpes = rpeSets.map((s: WorkoutSet) => s.rpe as number);
    const mean = rpes.reduce((a: number, b: number) => a + b, 0) / rpes.length;
    const variance = rpes.reduce((a: number, r: number) => a + (r - mean) ** 2, 0) / rpes.length;
    rpeScore = Math.max(0, 50 - (variance * 12.5));
  } else if (rpeSets.length > 0) {
    rpeScore = 30;
  }
  // Volume efficiency score (0-50 points)
  const volPerMin = durationSec > 0 ? (volume / durationSec) * 60 : 0;
  const avgDur = sortedHistory.reduce((sum: number, h: Workout) => sum + (h.duration_seconds || 0), 0) / Math.max(sortedHistory.length, 1);
  const avgVolPerMin = avgDur > 0 ? (avgVolume / avgDur) * 60 : 0;
  let effScore = 25;
  if (avgVolPerMin > 0 && volPerMin > 0) {
    const effRatio = volPerMin / avgVolPerMin;
    effScore = Math.min(50, Math.round(50 * Math.min(effRatio, 2 / effRatio)));
  }
  return Math.round(rpeScore + effScore);
}

// Time Under Tension helper — F42
const TUT_TEMPO_SECS = 3; // ~3s per rep (eccentric + concentric)
function calculateSetTUT(reps: number): number {
  return reps * TUT_TEMPO_SECS;
}
function formatTUT(seconds: number): string {
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${seconds}s`;
}

// F46 — Estimated 1RM using Epley formula: weight × (1 + reps/30)
// Only meaningful for completed sets with weight > 0 and reps > 0
function calculateEpley1RM(weight: number, reps: number): number | null {
  if (weight <= 0 || reps <= 0) return null;
  return weight * (1 + reps / 30);
}
function format1RM(rm: number, unit: string): string {
  return `${Math.round(rm)} ${unit}`;
}

// F316 — Color for rest time badge vs global average
function getRestTimeColor(avg: number, globalAvg: number): { bg: string; color: string } {
  if (avg === 0 || globalAvg === 0) return { bg: 'rgba(139,92,246,0.12)', color: '#a78bfa' };
  const ratio = avg / globalAvg;
  if (ratio <= 1.1) return { bg: 'rgba(34,197,94,0.12)', color: '#22c55e' };   // green — within 10% of average
  if (ratio <= 1.3) return { bg: 'rgba(234,179,8,0.12)', color: '#eab308' };   // yellow — 10-30% above
  return { bg: 'rgba(239,68,68,0.12)', color: '#ef4444' };                        // red — >30% above
}

type ExerciseSets = {
  exercise_id: string;
  exercise_name: string;
  muscle_group: string;
  sets: (WorkoutSet & { isEditing: boolean })[];
  isEditingNotes: boolean;
  notes: string;
};


export default function WorkoutDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { unit } = useSettingsStore();
  const { startWorkout, addExerciseToWorkout, activeWorkout } = useWorkoutStore();

  const [workout, setWorkout] = useState<Workout | null>(null);
  const [exercises, setExercises] = useState<ExerciseSets[]>([]);
  const [loading, setLoading] = useState(true);
  const [restTimeStats, setRestTimeStats] = useState<{ avg: number; min: number; max: number; sets: WorkoutSet[] } | null>(null);
  const [globalAvgRest, setGlobalAvgRest] = useState(0);
  const [exerciseGroupIds, setExerciseGroupIds] = useState<Map<string, string>>(new Map());
  // F43 — "Última vez" comparison data (previous workout sets per exercise)
  const [previousSets, setPreviousSets] = useState<Map<string, { sets: WorkoutSet[]; workoutDate: string }>>(new Map());
  // F93 — Target RPE per exercise when workout was started from a routine with target_rpe set
  const [targetRpeMap, setTargetRpeMap] = useState<Map<string, number>>(new Map());
  // F191 — PR badge state: Record<exerciseId, maxWeightPR> (F289: changed from Map to Record)
  const [exercisePRMap, setExercisePRMap] = useState<Record<string, number>>({});
  // F249 — Workout intensity score (0-100) computed from volume vs 30-day average
  const [intensityScore, setIntensityScore] = useState<number>(0);
  // F294 — Workout quality score (0-100) computed from RPE consistency + volume efficiency
  const [qualityScore, setQualityScore] = useState<number>(0);
  // F122 — Drag handle state for reordering exercises in completed workout
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

  // Compare modal (F10)
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [compareWorkouts, setCompareWorkouts] = useState<Workout[]>([]);

  // Edit states
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [editingNotes, setEditingNotes] = useState(false);
  const [workoutNotesValue, setWorkoutNotesValue] = useState('');
  const [editingSetNotes, setEditingSetNotes] = useState<{ exId: string; setId: string } | null>(null);
  const [editingRpe, setEditingRpe] = useState<{ exId: string; setId: string } | null>(null);
  const [setLevelNotesValue, setSetLevelNotesValue] = useState('');
  const [editingDate, setEditingDate] = useState(false);
  const [dateValue, setDateValue] = useState('');
  const [shareCopied, setShareCopied] = useState(false);
  const [showShareCard, setShowShareCard] = useState(false);
  // F331 — Weekly volume comparison state (this week vs last week)
  const [weeklyVolume, setWeeklyVolume] = useState<{ thisWeek: number; lastWeek: number; thisWeekWorkouts: number; lastWeekWorkouts: number } | null>(null);
  // F48 — Superset multi-select mode
  const [superSetSelectMode, setSuperSetSelectMode] = useState(false);
  const [superSetSelectedIds, setSuperSetSelectedIds] = useState<Set<string>>(new Set());
  const exerciseNotesRef = useRef<Map<string, string>>(new Map());
  const shareCardRef = useRef<HTMLDivElement | null>(null);
  // F108 — Quick-add exercise search modal
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddSearch, setQuickAddSearch] = useState('');
  const quickAddInputRef = useRef<HTMLInputElement>(null);
  // F228 — Muscle group filter for quick-add modal
  const [quickAddMuscleFilter, setQuickAddMuscleFilter] = useState<string>('all');
  // F262 — Equipment filter for quick-add modal
  const [quickAddEquipmentFilter, setQuickAddEquipmentFilter] = useState<Equipment | 'all'>('all');
  // F275 — Last weight per exercise for quick-add weight chip
  const [lastWeights, setLastWeights] = useState<Record<string, { weight: number; reps: number }>>({});
  // F275 — Ref sentinel to avoid stale closure without adding lastWeights to deps
  const lastWeightsLoaded = useRef(false);
  // F133 — Average workout duration (30-day) for pacing comparison
  const [avgDuration, setAvgDuration] = useState(0);
  // F110 — Superset auto-suggestion state + detection logic
  const [supersetSuggestion, setSupersetSuggestion] = useState<{ exerciseIds: string[]; reason: string } | null>(null);
  // F171 — Save workout as routine modal
  const [showSaveRoutineModal, setShowSaveRoutineModal] = useState(false);
  const [routineName, setRoutineName] = useState('');
  // F314 — Workout tags display/edit state
  const [showTagEditor, setShowTagEditor] = useState(false);
  const [editableTags, setEditableTags] = useState<string[]>([]);

  // F88 — Muscle group badges in WorkoutDetailPage header (moved before useEffect per React hooks rules)
  const muscleGroupBadges = useMemo(() => {
    const uniqueMuscles = [...new Set(exercises.map(ex => ex.muscle_group).filter(Boolean))];
    if (uniqueMuscles.length === 0) return null;
    return (
      <span className="inline-flex gap-1 ml-1">
        {uniqueMuscles.map(muscle => (
          <span key={muscle} className="px-1 py-0.5 rounded text-[10px] capitalize" style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text-2)' }}>
            {muscle}
          </span>
        ))}
      </span>
    );
  }, [exercises]);

  useEffect(() => {
    if (exercises.length < 2) { setSupersetSuggestion(null); return; }

    // Build group_id map for quick lookup
    const groupIdOf = (exId: string) => exerciseGroupIds.get(exId) ?? '';

    // Get non-superset exercises
    const nonSuperset = exercises.filter(ex => !groupIdOf(ex.exercise_id));

    // Group by muscle group
    const byMuscle: Record<string, string[]> = {};
    for (const ex of nonSuperset) {
      const mg = ex.muscle_group || 'other';
      if (!byMuscle[mg]) byMuscle[mg] = [];
      byMuscle[mg].push(ex.exercise_id);
    }

    // Complementary pairs: [group1, group2, label]
    const pairs: [string, string, string][] = [
      ['chest', 'back', 'Pecho + Espalda (push/pull)'],
      ['chest', 'shoulders', 'Pecho + Hombros (push)'],
      ['back', 'shoulders', 'Espalda + Hombros (pull/push)'],
      ['arms', 'chest', 'Brazos + Pecho'],
      ['arms', 'back', 'Brazos + Espalda'],
      ['legs', 'core', 'Piernas + Core'],
      ['chest', 'arms', 'Pecho + Brazos (empuje)'],
      ['back', 'arms', 'Espalda + Brazos (tracción)'],
    ];

    for (const [g1, g2, label] of pairs) {
      if (byMuscle[g1]?.length >= 1 && byMuscle[g2]?.length >= 1) {
        setSupersetSuggestion({
          exerciseIds: [byMuscle[g1][0], byMuscle[g2][0]],
          reason: `¿Crear super-serie? ${label}`,
        });
        return;
      }
    }

    setSupersetSuggestion(null);
  }, [exercises]); // eslint-disable-line react-hooks/exhaustive-deps

  // F108/F228 — Quick-add exercise search + muscle group filter
  const quickAddResults = useMemo(() => {
    const db = getDb();
    if (!db) return [];
    let results = searchExercises(db, quickAddSearch.trim());
    // F228 — Filter by muscle group
    if (quickAddMuscleFilter !== 'all') {
      results = results.filter((ex: Exercise) => ex.muscle_group === quickAddMuscleFilter);
    }
    // F262 — Filter by equipment
    if (quickAddEquipmentFilter !== 'all') {
      results = results.filter((ex: Exercise) => ex.equipment === quickAddEquipmentFilter);
    }
    return results.slice(0, 10);
  }, [quickAddSearch, quickAddMuscleFilter, quickAddEquipmentFilter]);

  const handleQuickAddExercise = (exerciseId: string, exerciseName: string) => {
    if (!activeWorkout) {
      startWorkout('Nuevo workout');
      setTimeout(() => {
        const db = getDb();
        const lastSets = db ? getLastExerciseSets(db, exerciseId) : [];
        const lastArr = Array.isArray(lastSets) ? lastSets.slice(-3) : [];
        addExerciseToWorkout(exerciseId, exerciseName, 3,
          lastArr.map((s: WorkoutSet) => ({ reps: s.reps, weight: s.weight, set_type: 'normal' as SetType })));
        navigate('/workouts');
      }, 50);
    } else {
      if (activeWorkout.exercises.find(e => e.exercise_id === exerciseId)) {
        toastStore.info('Ejercicio ya añadido', 'Ya está en el workout activo.');
        return;
      }
      addExerciseToWorkout(exerciseId, exerciseName);
      const db = getDb();
      if (db) {
        const lastSets = getLastExerciseSets(db, exerciseId);
        const lastArr = Array.isArray(lastSets) ? lastSets.slice(-3) : [];
        if (lastArr.length > 0) {
          toastStore.info('Sets copiados', `Se copiaron ${lastArr.length} sets del último workout.`);
        }
      }
      navigate('/workouts');
    }
    setShowQuickAdd(false);
    setQuickAddSearch('');
    setQuickAddMuscleFilter('all');
  };

  // F87 — Live elapsed time display (HH:MM:SS) for active workout being viewed
  // Moved before early returns to comply with React Rules of Hooks
  const [elapsedDisplay, setElapsedDisplay] = useState(0);

  // Update elapsedDisplay when workout data becomes available
  useEffect(() => {
    if (!workout) return;
    if (workout.finished_at && workout.started_at) {
      setElapsedDisplay(Math.floor((new Date(workout.finished_at).getTime() - new Date(workout.started_at).getTime()) / 1000));
    }
  }, [workout]);

  // F275 — Load last weights when quick-add modal opens (proper useEffect to avoid render-time side effect)
  useEffect(() => {
    if (!showQuickAdd || lastWeightsLoaded.current) return;
    const db = getDb();
    if (!db) return;
    const lw = getLastWeightPerExerciseAll(db);
    setLastWeights(lw);
    lastWeightsLoaded.current = true;
  }, [showQuickAdd]);

  // Tick for active (non-finished) workouts being viewed
  useEffect(() => {
    if (!workout?.started_at || workout.finished_at) return;
    const tick = () => {
      const elapsed = Math.floor((Date.now() - new Date(workout.started_at).getTime()) / 1000);
      setElapsedDisplay(elapsed);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [workout]);

  // F133 — Pacing indicator (computed, safe after useState calls)
  const pacingIndicator = useMemo(() => {
    if (workout?.finished_at || avgDuration <= 0) return null;
    const ratio = elapsedDisplay / avgDuration;
    if (ratio <= 1.1) return null; // within 10% of average — no indicator
    const overMins = Math.round((elapsedDisplay - avgDuration) / 60);
    const color = ratio > 1.5 ? '#ef4444' : '#f59e0b'; // red >50%, amber otherwise
    return (
      <span className="inline-flex items-center gap-0.5 ml-1" style={{ color }}>
        <AlertTriangle size={10} className="inline" />
        +{overMins}m vs prom
      </span>
    );
  }, [workout?.finished_at, avgDuration, elapsedDisplay]);

  useEffect(() => {
    if (!id) return;
    const db = getDb();
    if (!db) return;

    const w = getWorkoutById(db, id);
    if (!w) { setLoading(false); return; }

    setWorkout(w);
    setNameValue(w.name);
    setWorkoutNotesValue(w.notes || '');
    setEditableTags(w.tags || []);

    const allSets = getWorkoutSets(db, id);
    const exerciseOrder = getWorkoutExerciseOrder(db, id);

    // F161 — batch load all exercises in one query instead of per-exercise (F292: use Record-returning getExercisesByIdsAll)
    const exerciseIds = [...new Set(allSets.map(s => s.exercise_id))];
    const exerciseInfoMap = getExercisesByIdsAll(db, exerciseIds);

    const exerciseMap = new Map<string, ExerciseSets>();
    for (const set of allSets) {
      if (!exerciseMap.has(set.exercise_id)) {
        const info = exerciseInfoMap[set.exercise_id];
        exerciseMap.set(set.exercise_id, {
          exercise_id: set.exercise_id,
          exercise_name: info?.name || 'Ejercicio',
          muscle_group: info?.muscle_group || '',
          sets: [],
          isEditingNotes: false,
          notes: '',
        });
      }
      exerciseMap.get(set.exercise_id)!.sets.push({ ...set, isEditing: false });
    }

    const sorted = Array.from(exerciseMap.values()).sort((a, b) => {
      const orderA = exerciseOrder.get(a.exercise_id)?.order_index ?? 999;
      const orderB = exerciseOrder.get(b.exercise_id)?.order_index ?? 999;
      return orderA - orderB;
    });

    sorted.forEach(ex => {
      const stored = exerciseOrder.get(ex.exercise_id);
      if (stored?.notes) {
        ex.notes = stored.notes;
        exerciseNotesRef.current.set(ex.exercise_id, stored.notes);
      }
    });

    setExercises(sorted);
    setLoading(false);

    // F133 — Load 30-day average duration for pacing indicator
    setAvgDuration(getAverageWorkoutDuration(db));

    // F331 — Load weekly volume comparison
    setWeeklyVolume(getWeeklyVolumeComparison(db));

    // F43 — Load "última vez" data for each exercise
    if (id) {
      const prevMap = new Map<string, { sets: WorkoutSet[]; workoutDate: string }>();
      sorted.forEach(ex => {
        const prev = getPreviousExerciseSets(db, ex.exercise_id, id);
        if (prev) prevMap.set(ex.exercise_id, prev);
      });
      setPreviousSets(prevMap);
    }

    // Load group_ids for super-set grouping visual (F22)
    const groupMap = new Map<string, string>();
    exerciseOrder.forEach((val, exId) => {
      if (val.group_id) groupMap.set(exId, val.group_id);
    });
    setExerciseGroupIds(groupMap);

    // F93 — Load target RPE map if this workout was started from a routine
    if (w.routine_id) {
      const exIds = sorted.map(ex => ex.exercise_id);
      const rpeMap = getRoutineExerciseTargetRPEMap(db, w.routine_id, exIds);
      if (rpeMap.size > 0) setTargetRpeMap(rpeMap);
    }

    // Load rest time stats
    const stats = getRestTimeStats(db, id);
    if (stats.sets.length > 0) {
      setRestTimeStats(stats);
    }

    // F316 — Load global average rest time for color comparison
    const analytics = getRestTimeAnalytics(db);
    if (analytics.globalAvg > 0) {
      setGlobalAvgRest(analytics.globalAvg);
    }

    // F191 — Load personal records for all exercises in this workout (batch, single query) (F289: use Record-returning getPersonalRecordsByIdsAll)
    if (exerciseIds.length > 0) {
      const prAll = getPersonalRecordsByIdsAll(db, exerciseIds);
      const maxWeightPRs: Record<string, number> = {};
      Object.entries(prAll).forEach(([exId, prs]) => {
        const maxWeight = (prs as PersonalRecord[])
          .filter(pr => pr.type === 'max_weight')
          .reduce((max: number, pr) => Math.max(max, pr.value), 0);
        if (maxWeight > 0) maxWeightPRs[exId] = maxWeight;
      });
      setExercisePRMap(maxWeightPRs);
    }

    // F249 — Compute workout intensity score: volume vs 30-day average
    const vol = sorted.reduce((acc, ex) => acc + ex.sets.reduce((sAcc, s) => sAcc + (s.weight || 0) * (s.reps || 0), 0), 0);
    const avgVol = getAverageWorkoutVolume(db);
    if (avgVol > 0 && vol > 0) {
      const ratio = vol / avgVol;
      // Score 0-100: 75% of avg = 25pts, 100% = 50pts, 125% = 75pts, 150%+ = 100pts
      const score = Math.min(100, Math.round(25 + (ratio - 0.75) * 100));
      setIntensityScore(Math.max(0, score));
    }

    // F294 — Compute workout quality score: RPE consistency + volume efficiency
    const allWorkingSets = sorted.flatMap(ex => ex.sets.filter((s: WorkoutSet) => s.set_type !== 'warmup' && s.set_type !== 'drop'));
    const quality = computeQualityScore(allWorkingSets, vol, w.duration_seconds ?? 0, avgVol, getWorkouts(db));
    setQualityScore(quality);
  }, [id]);

  // Load workouts for compare modal (F10)
  useEffect(() => {
    if (!showCompareModal) return;
    const db = getDb();
    if (!db) return;
    const all = getWorkouts(db).filter(w => w.id !== id);
    setCompareWorkouts(all);
  }, [showCompareModal, id]);

  const handleSaveName = () => {
    if (!id || !nameValue.trim() || !workout) return;
    const db = getDb();
    if (!db) return;
    updateWorkoutName(db, id, nameValue.trim());
    setWorkout({ ...workout, name: nameValue.trim() });
    setEditingName(false);
  };

  const handleSaveDate = () => {
    if (!id || !dateValue || !workout) return;
    const newDate = new Date(dateValue);
    if (isNaN(newDate.getTime())) return;
    const db = getDb();
    if (!db) return;
    const startedAt = newDate.toISOString();
    const duration = workout.finished_at
      ? new Date(workout.finished_at).getTime() - new Date(workout.started_at).getTime()
      : 0;
    const finishedAt = new Date(newDate.getTime() + duration).toISOString();
    updateWorkoutDate(db, id, startedAt, finishedAt);
    setWorkout({ ...workout, started_at: startedAt, finished_at: finishedAt });
    setEditingDate(false);
  };

  const handleSaveWorkoutNotes = () => {
    if (!id || !workout) return;
    const db = getDb();
    if (!db) return;
    updateWorkoutNotes(db, id, workoutNotesValue);
    setWorkout({ ...workout, notes: workoutNotesValue });
    setEditingNotes(false);
  };

  const handleSaveSetNotes = (exerciseId: string, setId: string) => {
    const db = getDb();
    if (!db) return;
    updateWorkoutSetNotes(db, setId, setLevelNotesValue);
    setExercises(prev => prev.map(ex => {
      if (ex.exercise_id !== exerciseId) return ex;
      return {
        ...ex,
        sets: ex.sets.map(s => s.id === setId ? { ...s, notes: setLevelNotesValue } : s),
      };
    }));
    setEditingSetNotes(null);
  };

  // F49 — Update RPE for a set (persisted to DB)
  const handleSaveRPE = (exerciseId: string, setId: string, rpe: number | null) => {
    const db = getDb();
    if (!db) return;
    updateWorkoutSetRPE(db, setId, rpe);
    setExercises(prev => prev.map(ex => {
      if (ex.exercise_id !== exerciseId) return ex;
      return {
        ...ex,
        sets: ex.sets.map(s => s.id === setId ? { ...s, rpe } : s),
      };
    }));
    setEditingRpe(null);
  };



  const handleRemoveExercise = (exerciseId: string) => {
    if (!id) return;
    const db = getDb();
    if (!db) return;
    removeExerciseFromWorkoutDb(db, id, exerciseId);
    setExercises(prev => prev.filter(ex => ex.exercise_id !== exerciseId));
  };

  // F253 — Add warmup sets before the first set of an exercise in the active workout
  const handleAddWarmupSets = (ex: ExerciseSets) => {
    if (!activeWorkout) return;
    // Find the working weight from the first normal set with a weight
    const workingWeight = ex.sets
      .filter(s => s.set_type === 'normal' && s.weight > 0)
      .sort((a, b) => b.weight - a.weight)[0]?.weight ?? 0;
    if (workingWeight < 20) {
      toastStore.info('Peso demasiado bajo', 'Usa al menos 20kg para generar calentamiento.');
      return;
    }
    const warmupSets = getWarmupSets(workingWeight);
    if (warmupSets.length === 0) {
      toastStore.info('Sin calentamiento', 'Peso demasiado bajo para calentamiento.');
      return;
    }
    // Build ActiveSet objects with new IDs
    const newSets: import('../types').ActiveSet[] = warmupSets.map((ws, i) => ({
      id: generateId(),
      set_number: i + 1,
      set_type: 'warmup' as import('../types').SetType,
      reps: ws.reps,
      weight: ws.weight,
      rpe: null,
      notes: '',
      completed: false,
    }));
    const { addSetsToExercise } = useWorkoutStore.getState();
    addSetsToExercise(ex.exercise_id, newSets);
    toastStore.success('Calentamiento añadido', `${newSets.length} series de calentamiento añadidas.`);
  };

  // F326 — Quick "+1 set" button: add one extra working set to an exercise
  const handleAddSet = (ex: ExerciseSets) => {
    if (!activeWorkout) return;
    const normalSets = ex.sets.filter(s => s.set_type === 'normal');
    const lastSet = normalSets.length > 0 ? normalSets[normalSets.length - 1] : null;
    const nextSetNumber = normalSets.length + 1;
    const newSet: import('../types').ActiveSet = {
      id: generateId(),
      set_number: nextSetNumber,
      set_type: 'normal',
      reps: lastSet?.reps ?? 10,
      weight: lastSet?.weight ?? 0,
      rpe: null,
      notes: '',
      completed: false,
    };
    const { addSetsToExercise } = useWorkoutStore.getState();
    addSetsToExercise(ex.exercise_id, [newSet]);
    toastStore.success('+1 serie', `Serie ${nextSetNumber} añadida.`);
  };

  // F92 — Duplicate an exercise in-place (clones with new set IDs, inserted right after original)
  const handleDuplicateExercise = (exerciseId: string) => {
    const exIdx = exercises.findIndex(ex => ex.exercise_id === exerciseId);
    if (exIdx === -1) return;
    const original = exercises[exIdx];
    const cloned: ExerciseSets = {
      ...original,
      sets: original.sets.map(s => ({
        ...s,
        id: generateId(),
        notes: s.notes || '',
      })),
    };
    const newExercises = [...exercises];
    newExercises.splice(exIdx + 1, 0, cloned);
    setExercises(newExercises);
    // Persist the new exercise order to DB
    const db = getDb();
    if (db && id) {
      // Remove old order and re-insert all
      reorderWorkoutExercises(db, id, newExercises.map(ex => ex.exercise_id));
      // Insert the new exercise row for the duplicated exercise
      const newEx = newExercises[exIdx + 1];
      db.run(
        'INSERT OR REPLACE INTO workout_exercises (workout_id, exercise_id, notes, order_index, group_id) VALUES (?, ?, ?, ?, ?)',
        [id, newEx.exercise_id, newEx.notes || '', exIdx + 1, '']
      );
    }
  };

  const handleRepeatWorkout = () => {
    if (!workout) return;
    if (activeWorkout) {
      if (!confirm('Ya tienes un workout activo. ¿Deseas cancelarlo?')) return;
    }
    // Start new workout with same name
    startWorkout(`${workout.name} (copia)`);
    // Add all exercises with their actual completed weights/reps from this workout
    exercises.forEach(ex => {
      const lastSets = ex.sets
        .filter(s => s.set_type === 'normal' || s.set_type === 'warmup')
        .map(s => ({ reps: s.reps, weight: s.weight, set_type: s.set_type }));
      addExerciseToWorkout(ex.exercise_id, ex.exercise_name, ex.sets.length, lastSets, ex.notes);
    });
    navigate('/workouts');
  };

  // Copy exercises from this completed workout to the current active workout (F37)
  const handleCopyExercises = () => {
    if (!activeWorkout) {
      // No active workout — start one and copy exercises
      startWorkout(`${workout?.name || 'Workout'} (copia)`);
      exercises.forEach(ex => {
        addExerciseToWorkout(ex.exercise_id, ex.exercise_name, ex.sets.length, undefined, ex.notes);
      });
      navigate('/workouts');
      return;
    }
    // Add exercises to existing active workout
    const added: string[] = [];
    exercises.forEach(ex => {
      if (!activeWorkout.exercises.find(e => e.exercise_id === ex.exercise_id)) {
        addExerciseToWorkout(ex.exercise_id, ex.exercise_name, ex.sets.length, undefined, ex.notes);
        added.push(ex.exercise_name);
      }
    });
    if (added.length > 0) {
      toastStore.success('Ejercicios añadidos', added.join(', '));
    } else {
      toastStore.info('Sin cambios', 'Todos los ejercicios ya están en el workout activo.');
    }
    navigate('/workouts');
  };

  // F213 — Duplicate this workout as a new finished workout entry
  const handleDuplicateWorkout = () => {
    if (!workout) return;
    const db = getDb();
    if (!db) return;

    const newId = generateId();
    const now = new Date().toISOString();
    const clonedNotes = workout.notes
      ? `Clonado desde "${workout.name}"\n${workout.notes}`
      : `Clonado desde "${workout.name}"`;

    // Build the workout input for saveWorkout
    const workoutInput = {
      id: newId,
      routine_id: null,
      name: `${workout.name} (copia)`,
      started_at: now,
      finished_at: now,
      duration_seconds: workout.duration_seconds ?? 0,
      notes: clonedNotes,
      tags: workout.tags || [],
      rating: workout.rating ?? 0,
      intensity: workout.intensity ?? null, // F251 — persist intensity when duplicating
      is_public: false,
      exercises: exercises.map(ex => ({
        exercise_id: ex.exercise_id,
        exercise_name: ex.exercise_name,
        sets: ex.sets
          .filter(s => s.set_type === 'normal' || s.set_type === 'warmup')
          .map((s, i) => ({
            id: generateId(),
            workout_id: newId,
            exercise_id: ex.exercise_id,
            set_number: i + 1,
            set_type: s.set_type as SetType,
            reps: s.reps,
            weight: s.weight,
            rpe: s.rpe,
            notes: s.notes || '',
            completed_at: now,
            rest_time: s.rest_time || 0,
            completed: true,
          })),
        notes: ex.notes || '',
      })),
    };

    saveWorkout(db, workoutInput);
    toastStore.success('Workout duplicado', `"${workout.name} (copia)" guardado.`);
    navigate(`/workout/${newId}`);
  };

  // F48 — Create superset from multi-selected exercises
  const handleCreateSuperSetFromSelection = () => {
    if (superSetSelectedIds.size < 2) {
      toastStore.warning('Super-serie', 'Selecciona al menos 2 ejercicios.');
      return;
    }
    const workoutId = workout?.id;
    if (!workoutId) return;
    const db = getDb();
    if (!db) return;

    // Update DB directly with a new group ID for selected exercises
    const groupId = `ss_multi_${Date.now()}`;
    superSetSelectedIds.forEach(exId => {
      db.run(
        'UPDATE workout_exercises SET group_id = ? WHERE workout_id = ? AND exercise_id = ?',
        [groupId, workoutId, exId]
      );
      setExerciseGroupIds(prev => {
        const next = new Map(prev);
        next.set(exId, groupId);
        return next;
      });
    });

    setSuperSetSelectMode(false);
    setSuperSetSelectedIds(new Set());
  };

  // F235 — Superset quick-create: enter selection mode with first exercise pre-selected
  const handleQuickSuperset = (exerciseId: string) => {
    setSuperSetSelectMode(true);
    setSuperSetSelectedIds(new Set([exerciseId]));
  };
  const handleShareWorkout = () => {
    if (!workout) return;
    const lines: string[] = [];
    lines.push(`💪 ${workout.name}`);
    lines.push(`📅 ${workout.started_at ? format(new Date(workout.started_at), 'dd/MM/yyyy') : ''} • ${formatDurationLong(elapsedDisplay)} • ${totalVolume > 0 ? `${(totalVolume / 1000).toFixed(1)}k kg` : '0 kg'}`);
    if (workout.tags && workout.tags.length > 0) {
      lines.push(`🏷️ ${workout.tags.join(', ')}`);
    }
    lines.push('');
    exercises.forEach(ex => {
      const exVolume = ex.sets.reduce((sAcc, s) => sAcc + (s.weight || 0) * (s.reps || 0), 0);
      lines.push(`▸ ${ex.exercise_name}${exVolume > 0 ? ` (${exVolume} kg)` : ''}`);
      ex.sets.forEach(s => {
        if (s.set_type !== 'normal') {
          lines.push(`  ${s.weight}kg × ${s.reps} [${SET_TYPE_LABELS[s.set_type] || s.set_type.toUpperCase()}]`);
        } else {
          lines.push(`  ${s.weight}kg × ${s.reps}`);
        }
      });
    });
    lines.push('');
    lines.push('— Entreno registrado con HEVY');

    const text = lines.join('\n');
    navigator.clipboard.writeText(text).then(() => {
      // Small toast-like feedback via a brief state change
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    }).catch(() => {
      toastStore.error('Error', 'No se pudo copiar al portapapeles.');
    });
  };

  const handleSaveExerciseNotes = (exerciseId: string, notes: string) => {
    if (!id) return;
    const db = getDb();
    if (!db) return;
    db.run(
      'UPDATE workout_exercises SET notes = ? WHERE workout_id = ? AND exercise_id = ?',
      [notes, id, exerciseId]
    );
    const stmt = db.prepare('SELECT 1 FROM workout_exercises WHERE workout_id = ? AND exercise_id = ?');
    stmt.bind([id, exerciseId]);
    if (!stmt.step()) {
      stmt.free();
      db.run(
        'INSERT INTO workout_exercises (workout_id, exercise_id, notes, order_index) VALUES (?, ?, ?, ?)',
        [id, exerciseId, notes, exercises.findIndex(e => e.exercise_id === exerciseId)]
      );
    } else {
      stmt.free();
    }
    exerciseNotesRef.current.set(exerciseId, notes);
    setExercises(prev => prev.map(ex => ex.exercise_id === exerciseId ? { ...ex, isEditingNotes: false, notes } : ex));
  };

  // F171 — Save workout as a new routine
  const handleSaveAsRoutine = () => {
    if (!workout || !routineName.trim()) return;
    const db = getDb();
    if (!db) return;
    const routineId = generateId();
    saveRoutine(db, {
      id: routineId,
      name: routineName.trim(),
      description: workout.notes || '',
      estimated_duration_minutes: null,
      is_public: false,
    });
    exercises.forEach((ex, idx) => {
      saveRoutineExercise(db, {
        id: generateId(),
        routine_id: routineId,
        exercise_id: ex.exercise_id,
        order_index: idx,
        target_sets: ex.sets.length,
        target_reps: ex.sets[0]?.reps ?? null,
        target_weight: null,
        target_rpe: null,
        rest_seconds: null,
        target_reps_override: null,
      });
    });
    setShowSaveRoutineModal(false);
    setRoutineName('');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p style={{ color: 'var(--color-text-2)' }}>Cargando...</p>
      </div>
    );
  }

  if (!workout) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p style={{ color: 'var(--color-text-2)' }}>Workout no encontrado</p>
        <button onClick={() => navigate(-1)} className="px-4 py-2 rounded-lg" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)' }}>
          Volver
        </button>
      </div>
    );
  }

  const totalVolume = exercises.reduce((acc, ex) =>
    acc + ex.sets.reduce((sAcc, s) => sAcc + (s.weight || 0) * (s.reps || 0), 0), 0);

  function formatDurationLong(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b" style={{ borderColor: 'var(--color-border)' }}>
        {/* Row 1: Back + Title + Main actions */}
        <div className="p-3 flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg flex-shrink-0" style={{ backgroundColor: 'var(--color-surface)' }}>
            <ArrowLeft size={20} />
          </button>

          {editingName ? (
            <div className="flex-1 flex items-center gap-2">
              <input
                value={nameValue}
                onChange={e => setNameValue(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded-lg text-sm min-w-0"
                style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter') handleSaveName();
                  if (e.key === 'Escape') { setEditingName(false); setNameValue(workout.name); }
                }}
              />
              <button onClick={handleSaveName} className="p-1.5 rounded-lg flex-shrink-0" style={{ backgroundColor: 'var(--color-success)', color: '#fff' }}><Check size={16} /></button>
              <button onClick={() => { setEditingName(false); setNameValue(workout.name); }} className="p-1.5 rounded-lg flex-shrink-0" style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text-2)' }}><X size={16} /></button>
            </div>
          ) : (
            <>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold truncate">{workout.name}</h1>
                <button onClick={() => setEditingName(true)} className="p-1 rounded flex-shrink-0"><Edit2 size={14} style={{ color: 'var(--color-text-2)' }} /></button>
              </div>
              <p className="text-[11px] truncate" style={{ color: 'var(--color-text-2)' }}>
                {editingDate ? (
                  <span className="inline-flex items-center gap-1">
                    <input
                      type="date"
                      value={dateValue}
                      onChange={e => setDateValue(e.target.value)}
                      className="px-1 py-0.5 rounded text-[10px] min-w-0"
                      style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                      autoFocus
                    />
                    <button onClick={handleSaveDate} className="p-0.5 rounded" style={{ backgroundColor: 'var(--color-success)', color: '#fff' }}><Check size={10} /></button>
                    <button onClick={() => setEditingDate(false)} className="p-0.5 rounded" style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text-2)' }}><X size={10} /></button>
                  </span>
                ) : (
                  <button
                    onClick={() => {
                      setDateValue(workout.started_at ? format(new Date(workout.started_at), 'yyyy-MM-dd') : '');
                      setEditingDate(true);
                    }}
                    className="hover:underline"
                  >
                    {workout.started_at ? format(new Date(workout.started_at), "d 'de' MMM, yyyy", { locale: es }) : ''}
                  </button>
                )}
                {' • '}<Clock size={10} className="inline" /> {formatDurationLong(elapsedDisplay)}
                {' • '}{exercises.length} ejs
                {/* F88 — Muscle group badges in WorkoutDetailPage header */}
                {muscleGroupBadges}
                {' • '}{totalVolume > 0 ? `${(totalVolume / 1000).toFixed(1)}k kg` : '0 kg'}
                {restTimeStats && (
                  <span className="inline-flex items-center gap-0.5" style={{ color: 'var(--color-text-2)' }}>
                    {' • '}<Timer size={10} className="inline" />{restTimeStats.avg}s prom
                  </span>
                )}
                {/* F331 — Weekly volume comparison chip */}
                {weeklyVolume && weeklyVolume.lastWeek > 0 && (
                  (() => {
                    const pct = Math.round((weeklyVolume.thisWeek / weeklyVolume.lastWeek - 1) * 100);
                    const isUp = pct > 0;
                    const color = isUp ? '#10b981' : '#ef4444';
                    return (
                      <span className="inline-flex items-center gap-0.5 ml-1" style={{ color }}>
                        {' • '}<Flame size={10} className="inline" />{isUp ? '+' : ''}{pct}% vs sem. pas
                      </span>
                    );
                  })()
                )}
                {/* F133 — Pacing indicator */}
                {pacingIndicator}
              </p>
            </div>
            {/* Main action icons — always visible */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => { setShowQuickAdd(true); setQuickAddSearch(''); setQuickAddMuscleFilter('all'); setQuickAddEquipmentFilter('all'); setTimeout(() => quickAddInputRef.current?.focus(), 50); }}
                className="p-1.5 rounded-lg"
                style={{ backgroundColor: 'var(--color-surface)' }}
                title="Añadir ejercicio"
              >
                <Plus size={16} style={{ color: 'var(--color-primary)' }} />
              </button>
              <button
                onClick={handleRepeatWorkout}
                className="p-1.5 rounded-lg"
                style={{ backgroundColor: 'var(--color-surface)' }}
                title="Repetir workout"
              >
                <RotateCcw size={16} style={{ color: 'var(--color-primary)' }} />
              </button>
              <button
                onClick={handleShareWorkout}
                className="p-1.5 rounded-lg relative"
                style={{ backgroundColor: shareCopied ? 'var(--color-success)' : 'var(--color-surface)' }}
                title="Compartir"
              >
                <Share2 size={16} style={{ color: shareCopied ? '#fff' : 'var(--color-primary)' }} />
              </button>
              <button
                onClick={() => {
                  document.getElementById('workout-notes-section')?.scrollIntoView({ behavior: 'smooth' });
                  if (!editingNotes && !workout.notes) setEditingNotes(true);
                }}
                className="p-1.5 rounded-lg"
                style={{ backgroundColor: workout.notes ? 'var(--color-primary)' : 'var(--color-surface)' }}
                title="Notas"
              >
                <MessageSquare size={16} style={{ color: workout.notes ? '#000' : 'var(--color-text-2)' }} />
              </button>
            </div>
            </>
          )}
        </div>

        {/* Row 2: Secondary actions — horizontal scroll on mobile */}
        {!editingName && (
          <div className="px-3 pb-2 flex items-center gap-1 overflow-x-auto scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            <button
              onClick={() => setShowCompareModal(true)}
              className="p-1.5 rounded-lg flex-shrink-0"
              style={{ backgroundColor: 'var(--color-surface)' }}
              title="Comparar"
            >
              <GitCompare size={15} style={{ color: 'var(--color-primary)' }} />
            </button>
            <button
              onClick={handleCopyExercises}
              className="p-1.5 rounded-lg flex-shrink-0"
              style={{ backgroundColor: 'var(--color-surface)' }}
              title="Copiar ejercicios"
            >
              <Copy size={15} style={{ color: 'var(--color-primary)' }} />
            </button>
            {/* F171 — Save as routine */}
            <button
              onClick={() => { setShowSaveRoutineModal(true); setRoutineName(workout?.name || ''); }}
              className="p-1.5 rounded-lg flex-shrink-0"
              style={{ backgroundColor: 'var(--color-surface)' }}
              title="Guardar como rutina"
            >
              <FileText size={15} style={{ color: 'var(--color-primary)' }} />
            </button>
            {/* F213 — Duplicate workout as finished entry */}
            <button
              onClick={handleDuplicateWorkout}
              className="p-1.5 rounded-lg flex-shrink-0"
              style={{ backgroundColor: 'var(--color-surface)' }}
              title="Duplicar workout"
            >
              <Save size={15} style={{ color: 'var(--color-primary)' }} />
            </button>
            {/* Superset mode toggle */}
            {superSetSelectMode ? (
              <>
                <button
                  onClick={() => { setSuperSetSelectMode(false); setSuperSetSelectedIds(new Set()); }}
                  className="p-1.5 rounded-lg flex-shrink-0"
                  style={{ backgroundColor: 'var(--color-surface)' }}
                  title="Cancelar"
                >
                  <X size={15} style={{ color: 'var(--color-danger)' }} />
                </button>
                <button
                  onClick={handleCreateSuperSetFromSelection}
                  className="p-1.5 rounded-lg flex-shrink-0"
                  style={{ backgroundColor: superSetSelectedIds.size >= 2 ? 'var(--color-primary)' : 'var(--color-surface-2)' }}
                  title="Crear super-serie"
                >
                  <Check size={15} style={{ color: superSetSelectedIds.size >= 2 ? '#000' : 'var(--color-text-2)' }} />
                </button>
              </>
            ) : (
              <button
                onClick={() => setSuperSetSelectMode(true)}
                className="p-1.5 rounded-lg flex-shrink-0"
                style={{ backgroundColor: 'var(--color-surface)' }}
                title="Crear super-serie"
              >
                <Layers size={15} style={{ color: 'var(--color-primary)' }} />
              </button>
            )}
            {/* F314 — Workout tags edit button */}
            <button
              onClick={() => { setShowTagEditor(v => !v); }}
              className="p-1.5 rounded-lg flex-shrink-0"
              style={{ backgroundColor: (workout?.tags && workout.tags.length > 0) ? 'var(--color-primary)' : 'var(--color-surface)' }}
              title="Editar tags"
            >
              <Tag size={15} style={{ color: (workout?.tags && workout.tags.length > 0) ? '#000' : 'var(--color-text-2)' }} />
            </button>
          </div>
        )}
      </div>

      {/* F314 — Workout tags editor panel */}
      {showTagEditor && (
        <div className="px-3 pb-3" style={{ backgroundColor: 'var(--color-surface)' }}>
          <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--color-surface-2)' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold" style={{ color: 'var(--color-text-2)' }}>Etiquetas</span>
              <button
                onClick={() => {
                  const db = getDb();
                  if (db && workout) {
                    updateWorkoutTags(db, workout.id, editableTags);
                    setWorkout({ ...workout, tags: editableTags });
                    toastStore.success('Tags actualizados');
                  }
                  setShowTagEditor(false);
                }}
                className="px-2 py-1 rounded text-xs font-medium"
                style={{ backgroundColor: 'var(--color-primary)', color: '#000' }}
              >
                Guardar
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {['strength', 'cardio', 'hiit', 'full body', 'upper', 'lower', 'push', 'pull', 'legs', 'core', 'mobility', 'stretching', 'warmup', 'deload', 'pr day', 'technique'].map(tag => {
                const isSelected = editableTags.includes(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => {
                      setEditableTags(prev =>
                        isSelected ? prev.filter(t => t !== tag) : [...prev, tag]
                      );
                    }}
                    className="px-2.5 py-1 rounded-full text-xs font-medium capitalize transition-colors"
                    style={{
                      backgroundColor: isSelected ? 'var(--color-primary)' : 'var(--color-surface)',
                      color: isSelected ? '#000' : 'var(--color-text-2)',
                      border: isSelected ? 'none' : '1px solid var(--color-border)',
                    }}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* F222 — Floating workout summary chip (sticky between header and exercise list) */}
      {exercises.length > 0 && (
        <div
          className="sticky top-0 z-10 mx-3 mt-2 px-3 py-2 rounded-lg flex items-center justify-between gap-3 shadow-sm"
          style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1 font-semibold" style={{ color: 'var(--color-primary)' }}>
              <Weight size={12} />
              {totalVolume > 0 ? `${(totalVolume / 1000).toFixed(1)}k kg` : '0 kg'}
            </span>
            <span className="flex items-center gap-1" style={{ color: 'var(--color-text-2)' }}>
              <Clock size={12} />
              {formatDurationLong(elapsedDisplay)}
            </span>
            <span style={{ color: 'var(--color-text-2)' }}>
              {exercises.length} ejs
            </span>
          </div>
          {restTimeStats && (
            <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-text-2)' }}>
              <Timer size={11} />
              {restTimeStats.avg}s prom
            </span>
          )}
          {/* F249 — Workout intensity score badge */}
          {intensityScore > 0 && (
            <span
              className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium"
              style={{
                backgroundColor: intensityScore >= 75 ? 'rgba(239,68,68,0.15)' : intensityScore >= 50 ? 'rgba(99,102,241,0.15)' : 'rgba(34,197,94,0.15)',
                color: intensityScore >= 75 ? '#ef4444' : intensityScore >= 50 ? 'var(--color-primary)' : '#22c55e',
              }}
              title="Intensidad vs promedio 30 días"
            >
              <Target size={11} />
              {intensityScore >= 75 ? 'Máxima' : intensityScore >= 50 ? 'Alta' : 'Moderada'}
            </span>
          )}
          {/* F294 — Workout quality score badge */}
          {qualityScore > 0 && (
            <span
              className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium"
              style={{
                backgroundColor: qualityScore >= 70 ? 'rgba(34,197,94,0.15)' : qualityScore >= 40 ? 'rgba(251,191,36,0.15)' : 'rgba(239,68,68,0.15)',
                color: qualityScore >= 70 ? '#22c55e' : qualityScore >= 40 ? '#fbbf24' : '#ef4444',
              }}
              title="Calidad: consistencia RPE + eficiencia volumen"
            >
              <Star size={11} />
              {qualityScore >= 70 ? 'Alta' : qualityScore >= 40 ? 'Media' : 'Baja'}
            </span>
          )}
        </div>
      )}

      {/* Compare Modal (F10) */}
      {showCompareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-sm rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
            <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--color-border)' }}>
              <h2 className="text-lg font-bold">Comparar workout</h2>
              <button onClick={() => setShowCompareModal(false)} className="p-1.5 rounded-lg" style={{ backgroundColor: 'var(--color-surface)' }}>
                <X size={16} />
              </button>
            </div>
            <div className="p-4 max-h-80 overflow-y-auto">
              {compareWorkouts.length === 0 ? (
                <p className="text-sm text-center" style={{ color: 'var(--color-text-2)' }}>No hay otros workouts para comparar</p>
              ) : (
                <div className="space-y-2">
                  {compareWorkouts.slice(0, 20).map(w => (
                    <button
                      key={w.id}
                      onClick={() => {
                        setShowCompareModal(false);
                        navigate(`/workout-compare?a=${id}&b=${w.id}`);
                      }}
                      className="w-full flex items-center justify-between p-3 rounded-lg text-left"
                      style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{w.name}</p>
                        <p className="text-xs" style={{ color: 'var(--color-text-2)' }}>
                          {w.started_at ? format(new Date(w.started_at), "d 'de' MMM", { locale: es }) : ''}
                        </p>
                      </div>
                      <GitCompare size={14} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* F108 — Quick-add exercise modal */}
      {showQuickAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-sm rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
            <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--color-border)' }}>
              <h2 className="text-lg font-bold">Añadir ejercicio</h2>
              <button onClick={() => { setShowQuickAdd(false); setQuickAddSearch(''); setQuickAddMuscleFilter('all'); setQuickAddEquipmentFilter('all'); }} className="p-1.5 rounded-lg" style={{ backgroundColor: 'var(--color-surface)' }}>
                <X size={16} />
              </button>
            </div>
            <div className="p-4">
              {/* Search input */}
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2" size={16} style={{ color: 'var(--color-text-2)' }} />
                <input
                  ref={quickAddInputRef}
                  type="text"
                  placeholder="Buscar ejercicio..."
                  value={quickAddSearch}
                  onChange={e => setQuickAddSearch(e.target.value)}
                  className="w-full rounded-lg pl-9 pr-3 py-2.5 text-sm"
                  style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                />
              </div>
              {/* F228 — Muscle group filter chips */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {[
                  { key: 'all', label: 'Todos' },
                  { key: 'chest', label: 'Pecho' },
                  { key: 'back', label: 'Espalda' },
                  { key: 'legs', label: 'Piernas' },
                  { key: 'shoulders', label: 'Hombros' },
                  { key: 'arms', label: 'Brazos' },
                  { key: 'core', label: 'Core' },
                  { key: 'cardio', label: 'Cardio' },
                ].map(mg => {
                  const isActive = quickAddMuscleFilter === mg.key;
                  const chipColors: Record<string, { bg: string; text: string }> = {
                    chest: { bg: 'rgba(239,68,68,0.15)', text: '#ef4444' },
                    back: { bg: 'rgba(59,130,246,0.15)', text: '#3b82f6' },
                    legs: { bg: 'rgba(16,185,129,0.15)', text: '#10b981' },
                    shoulders: { bg: 'rgba(245,158,11,0.15)', text: '#f59e0b' },
                    arms: { bg: 'rgba(139,92,246,0.15)', text: '#8b5cf6' },
                    core: { bg: 'rgba(6,182,212,0.15)', text: '#06b6d4' },
                    cardio: { bg: 'rgba(236,72,153,0.15)', text: '#ec4899' },
                  };
                  const colors = chipColors[mg.key] || { bg: 'var(--color-surface-2)', text: 'var(--color-text-2)' };
                  return (
                    <button
                      key={mg.key}
                      onClick={() => {
                        setQuickAddMuscleFilter(mg.key);
                        setQuickAddSearch('');
                      }}
                      className="px-2 py-1 rounded-lg text-xs font-medium transition-colors"
                      style={{
                        backgroundColor: isActive ? colors.bg : 'var(--color-surface-2)',
                        color: isActive ? colors.text : 'var(--color-text-2)',
                        border: isActive ? `1px solid ${colors.text}40` : '1px solid transparent',
                      }}
                    >
                      {mg.label}
                    </button>
                  );
                })}
              </div>
              {/* F262 — Equipment filter chips */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {([
                  { key: 'all', label: 'Todo' },
                  { key: 'barbell', label: 'Barra' },
                  { key: 'dumbbell', label: 'Mancuernas' },
                  { key: 'machine', label: 'Máquina' },
                  { key: 'cable', label: 'Cable' },
                  { key: 'bodyweight', label: 'Bodyweight' },
                  { key: 'kettlebell', label: 'Kettlebell' },
                  { key: 'bands', label: 'Bandas' },
                  { key: 'other', label: 'Otro' },
                ] as { key: Equipment | 'all'; label: string }[]).map(eq => {
                  const isActive = quickAddEquipmentFilter === eq.key;
                  const eqColors: Record<string, { bg: string; text: string }> = {
                    barbell: { bg: 'rgba(245,158,11,0.15)', text: '#f59e0b' },
                    dumbbell: { bg: 'rgba(59,130,246,0.15)', text: '#3b82f6' },
                    machine: { bg: 'rgba(139,92,246,0.15)', text: '#8b5cf6' },
                    cable: { bg: 'rgba(6,182,212,0.15)', text: '#06b6d4' },
                    bodyweight: { bg: 'rgba(16,185,129,0.15)', text: '#10b981' },
                    kettlebell: { bg: 'rgba(236,72,153,0.15)', text: '#ec4899' },
                    bands: { bg: 'rgba(249,115,22,0.15)', text: '#f97316' },
                    other: { bg: 'var(--color-surface-2)', text: 'var(--color-text-2)' },
                  };
                  const colors = eqColors[eq.key] || { bg: 'var(--color-surface-2)', text: 'var(--color-text-2)' };
                  return (
                    <button
                      key={eq.key}
                      onClick={() => setQuickAddEquipmentFilter(eq.key)}
                      className="px-2 py-1 rounded-lg text-xs font-medium transition-colors"
                      style={{
                        backgroundColor: isActive ? colors.bg : 'var(--color-surface-2)',
                        color: isActive ? colors.text : 'var(--color-text-2)',
                        border: isActive ? `1px solid ${colors.text}40` : '1px solid transparent',
                      }}
                    >
                      {eq.label}
                    </button>
                  );
                })}
              </div>
              {/* Results */}
              <div className="max-h-72 overflow-y-auto space-y-1.5">
                {quickAddResults.length === 0 ? (
                  <p className="text-xs text-center py-4" style={{ color: 'var(--color-text-2)' }}>
                    {quickAddSearch.trim().length < 2 && quickAddMuscleFilter === 'all' && quickAddEquipmentFilter === 'all'
                      ? 'Escribe al menos 2 caracteres para buscar'
                      : 'No se encontraron ejercicios'}
                  </p>
                ) : (
                  quickAddResults.map((ex: Exercise) => {
                    const alreadyInWorkout = activeWorkout?.exercises.find(e => e.exercise_id === ex.id);
                    return (
                      <button
                        key={ex.id}
                        onClick={() => !alreadyInWorkout && handleQuickAddExercise(ex.id, ex.name)}
                        disabled={Boolean(alreadyInWorkout)}
                        className="w-full flex items-center justify-between p-3 rounded-lg text-left transition-colors"
                        style={{
                          backgroundColor: alreadyInWorkout ? 'var(--color-surface-2)' : 'var(--color-surface)',
                          border: '1px solid var(--color-border)',
                          opacity: alreadyInWorkout ? 0.5 : 1,
                          cursor: alreadyInWorkout ? 'default' : 'pointer',
                        }}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{ex.name}</p>
                          <p className="text-xs capitalize" style={{ color: 'var(--color-text-2)' }}>{ex.muscle_group} · {ex.equipment}</p>
                        </div>
                        <div className="flex-shrink-0 ml-2 flex flex-col items-end gap-1">
                          {lastWeights[ex.id] && (
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                              style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text-2)' }}
                              title={`Último: ${lastWeights[ex.id].weight}kg × ${lastWeights[ex.id].reps} reps`}
                            >
                              {lastWeights[ex.id].weight}kg ×{lastWeights[ex.id].reps}
                            </span>
                          )}
                          {alreadyInWorkout ? (
                            <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text-2)' }}>Ya añadido</span>
                          ) : (
                            <Plus size={16} style={{ color: 'var(--color-primary)' }} />
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
              {!activeWorkout && (
                <p className="text-xs text-center mt-2" style={{ color: 'var(--color-text-2)' }}>Se creará un nuevo workout</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* F171 — Save workout as routine modal */}
      {showSaveRoutineModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-sm rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
            <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--color-border)' }}>
              <h2 className="text-lg font-bold">Guardar como rutina</h2>
              <button onClick={() => { setShowSaveRoutineModal(false); setRoutineName(''); }} className="p-1.5 rounded-lg" style={{ backgroundColor: 'var(--color-surface)' }}>
                <X size={16} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-xs mb-1.5" style={{ color: 'var(--color-text-2)' }}>Nombre de la rutina</label>
                <input
                  type="text"
                  value={routineName}
                  onChange={e => setRoutineName(e.target.value)}
                  placeholder="Nombre de la rutina..."
                  className="w-full rounded-lg px-3 py-2.5 text-sm"
                  style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                  onKeyDown={e => { if (e.key === 'Enter' && routineName.trim()) handleSaveAsRoutine(); }}
                  autoFocus
                />
              </div>
              <p className="text-xs" style={{ color: 'var(--color-text-2)' }}>
                Se guardarán <strong>{exercises.length}</strong> ejercicio{exercises.length !== 1 ? 's' : ''} de este workout como nueva rutina.
              </p>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => { setShowSaveRoutineModal(false); setRoutineName(''); }}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium"
                  style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)' }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveAsRoutine}
                  disabled={!routineName.trim()}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5"
                  style={{
                    backgroundColor: routineName.trim() ? 'var(--color-primary)' : 'var(--color-surface-2)',
                    color: routineName.trim() ? '#000' : 'var(--color-text-2)',
                    cursor: routineName.trim() ? 'pointer' : 'default',
                  }}
                >
                  <Save size={15} />
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* F74 — Workout Notes */}
      <div id="workout-notes-section" className="px-4 py-2 border-b" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
        {editingNotes ? (
          <div className="space-y-1.5">
            <textarea
              value={workoutNotesValue}
              onChange={e => setWorkoutNotesValue(e.target.value)}
              placeholder="Notas del workout..."
              className="w-full px-2 py-1.5 rounded-lg text-xs resize-none"
              style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
              rows={2}
              autoFocus
            />
            <div className="flex gap-2">
              <button onClick={handleSaveWorkoutNotes} className="flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold" style={{ backgroundColor: 'var(--color-success)', color: '#fff' }}>
                <Check size={10} /> Guardar
              </button>
              <button onClick={() => { setEditingNotes(false); setWorkoutNotesValue(workout.notes || ''); }} className="px-2 py-1 rounded text-xs" style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text-2)' }}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setEditingNotes(true)} className="flex items-center gap-1.5 text-xs w-full" style={{ color: workout.notes ? 'var(--color-text)' : 'var(--color-text-2)' }}>
            <MessageSquare size={11} />
            <span className="truncate">{workout.notes || 'Añadir nota del workout...'}</span>
          </button>
        )}
      </div>

      {/* F110 — Superset auto-suggestion banner */}
      {supersetSuggestion && (
        <div className="mx-3 mb-1 p-3 rounded-xl flex items-center gap-2"
          style={{ backgroundColor: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)' }}>
          <Layers size={16} style={{ color: '#10b981' }} className="flex-shrink-0" />
          <p className="text-xs flex-1" style={{ color: 'var(--color-text)' }}>
            {supersetSuggestion.reason}
          </p>
          <button
            onClick={() => {
              // Auto-select the suggested exercises and enter superset mode
              setSuperSetSelectMode(true);
              setSuperSetSelectedIds(new Set(supersetSuggestion.exerciseIds));
              setSupersetSuggestion(null);
            }}
            className="px-2.5 py-1 rounded-lg text-xs font-semibold flex-shrink-0"
            style={{ backgroundColor: '#10b981', color: '#fff' }}
          >
            Crear
          </button>
          <button
            onClick={() => setSupersetSuggestion(null)}
            className="p-1 rounded flex-shrink-0"
            style={{ color: 'var(--color-text-2)' }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Exercises */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {(() => {
          // Build super-set groups for visual rendering (F22)
          const rendered = new Set<string>();
          const superSetGroups: { groupId: string; exercises: ExerciseSets[] }[] = [];
          exercises.forEach(ex => {
            if (rendered.has(ex.exercise_id)) return;
            const groupId = exerciseGroupIds.get(ex.exercise_id);
            if (groupId) {
              // This exercise belongs to a superset — collect all members
              const groupExIds = exercises
                .filter(e => exerciseGroupIds.get(e.exercise_id) === groupId)
                .map(e => e.exercise_id);
              groupExIds.forEach(id => rendered.add(id));
              superSetGroups.push({
                groupId,
                exercises: exercises.filter(e => groupExIds.includes(e.exercise_id)),
              });
            } else {
              rendered.add(ex.exercise_id);
              superSetGroups.push({ groupId: '', exercises: [ex] });
            }
          });

          const exerciseElements: React.ReactNode[] = superSetGroups.map((group) => {
            const isSuperSet = group.groupId !== '';
            const groupColor = '#10b981';

            if (isSuperSet) {
              return (
                <div key={`ss_${group.groupId}`}>
                  {/* Super-set label */}
                  <div className="flex items-center gap-2 px-1 mb-1">
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                      style={{ backgroundColor: `${groupColor}20`, color: groupColor, border: `1px solid ${groupColor}40` }}>
                      <Layers size={10} />
                      SUPER-SERIE
                    </div>
                    <div className="flex-1 h-px" style={{ backgroundColor: `${groupColor}30` }} />
                  </div>
                  {group.exercises.map((ex) => {
                    const idx = exercises.indexOf(ex);
                    return (
                      <div
                        key={ex.exercise_id}
                        draggable
                        onDragStart={() => { setDraggingIdx(idx); }}
                        onDragOver={(e) => { e.preventDefault(); setDragOverIdx(idx); }}
                        onDragEnd={() => {
                          if (draggingIdx !== null && draggingIdx !== idx && draggingIdx >= 0 && draggingIdx < exercises.length) {
                            const newExercises = [...exercises];
                            [newExercises[draggingIdx], newExercises[idx]] = [newExercises[idx], newExercises[draggingIdx]];
                            setExercises(newExercises);
                            const _db = getDb(); if (_db) reorderWorkoutExercises(_db, id!, newExercises.map(ex => ex.exercise_id));
                          }
                          setDraggingIdx(null);
                          setDragOverIdx(null);
                        }}
                        onDragEnter={() => { if (draggingIdx !== null && draggingIdx !== idx) setDragOverIdx(idx); }}
                        className={`rounded-xl overflow-hidden mb-2 transition-all ${draggingIdx === idx ? 'opacity-40' : ''} ${dragOverIdx === idx && draggingIdx !== null && draggingIdx !== idx ? 'ring-2 ring-[var(--color-primary)]' : ''}`}
                        style={{
                          backgroundColor: 'var(--color-surface)',
                          borderLeft: `3px solid ${groupColor}`,
                        }}
                      >
                        {/* Exercise header */}
                        <div className="flex items-center gap-2 p-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
                          {superSetSelectMode && (
                            <button
                              onClick={() => {
                                setSuperSetSelectedIds(prev => {
                                  const next = new Set(prev);
                                  if (next.has(ex.exercise_id)) {
                                    next.delete(ex.exercise_id);
                                  } else {
                                    next.add(ex.exercise_id);
                                  }
                                  return next;
                                });
                              }}
                              className="p-1 rounded flex-shrink-0"
                              style={{
                                backgroundColor: superSetSelectedIds.has(ex.exercise_id) ? '#10b981' : 'var(--color-surface-2)',
                                color: superSetSelectedIds.has(ex.exercise_id) ? '#fff' : 'var(--color-text-2)',
                              }}
                            >
                              <Check size={14} />
                            </button>
                          )}
                          {/* F122 — Drag handle */}
                          <div
                            className="flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0 cursor-grab active:cursor-grabbing"
                            style={{ backgroundColor: 'var(--color-surface-2)' }}
                            title="Arrastra para reordenar"
                          >
                            <GripVertical size={16} style={{ color: 'var(--color-text-2)' }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              {/* F191 — PR badge in superset header */}
                              {(() => {
                                const prWeight = exercisePRMap[ex.exercise_id];
                                if (!prWeight) return null;
                                const workoutMaxWeight = Math.max(...ex.sets.filter((s: WorkoutSet) => s.set_type === 'normal' && s.weight > 0).map((s: WorkoutSet) => s.weight), 0);
                                if (workoutMaxWeight <= 0 || workoutMaxWeight < prWeight) return null;
                                return (
                                  <div
                                    className="flex items-center justify-center w-5 h-5 rounded flex-shrink-0"
                                    style={{ backgroundColor: 'rgba(250,204,21,0.2)' }}
                                    title={`¡Récord personal! ${workoutMaxWeight}kg ≥ PR anterior ${prWeight}kg`}
                                  >
                                    <Trophy size={11} className="text-amber-400" />
                                  </div>
                                );
                              })()}
                              <p className="font-semibold text-sm truncate">{ex.exercise_name}</p>
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              <p className="text-xs" style={{ color: 'var(--color-text-2)' }}>{ex.sets.length} series</p>
                              {/* TUT badge (F42) */}
                              {(() => {
                                const tutSeconds = ex.sets.reduce((acc: number, s: WorkoutSet) => acc + calculateSetTUT(s.reps || 0), 0);
                                return tutSeconds > 0 ? (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text-2)' }}>
                                    {formatTUT(tutSeconds)} TUT
                                  </span>
                                ) : null;
                              })()}
                              {/* F86/F316 — Average rest time per exercise (active workout view) with color vs global avg */}
                              {(() => {
                                const restTimes = ex.sets.map((s: WorkoutSet) => s.rest_time).filter((t): t is number => t != null && t > 0);
                                if (restTimes.length === 0) return null;
                                const avgRest = Math.round(restTimes.reduce((a, b) => a + b, 0) / restTimes.length);
                                const colors = getRestTimeColor(avgRest, globalAvgRest);
                                return (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ backgroundColor: colors.bg, color: colors.color }}>
                                    ↔ avg {avgRest}s
                                  </span>
                                );
                              })()}
                              {/* F93 — Target RPE badge when workout was started from a routine with target_rpe */}
                              {(() => {
                                const targetRpe = targetRpeMap.get(ex.exercise_id);
                                if (targetRpe == null) return null;
                                return (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5" style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#f59e0b' }} title="Objetivo RPE de la rutina">
                                    <Target size={9} />
                                    RPE {targetRpe}
                                  </span>
                                );
                              })()}
                              {/* F71 — Set completion progress dots */}
                              {ex.sets.length > 1 && (
                                <div className="flex items-center gap-0.5 flex-shrink-0">
                                  {ex.sets.map((s, si) => {
                                    const isWarmup = s.set_type === 'warmup';
                                    const isDrop = s.set_type === 'drop';
                                    const isFailure = s.set_type === 'failure';
                                    let dotColor = 'var(--color-text-2)';
                                    if (isWarmup) dotColor = '#f59e0b';
                                    else if (isDrop) dotColor = '#8b5cf6';
                                    else if (isFailure) dotColor = '#ef4444';
                                    else if (s.weight > 0 && s.reps > 0) dotColor = 'var(--color-primary)';
                                    return (
                                      <div
                                        key={si}
                                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: dotColor }}
                                        title={`Serie ${si + 1}: ${s.weight > 0 || s.reps > 0 ? `${s.weight}${unit} × ${s.reps}` : 'vacía'}`}
                                      />
                                    );
                                  })}
                                </div>
                              )}
                              {/* Volume bar (F38) */}
                              {(() => {
                                const exVol = ex.sets.reduce((acc: number, s: WorkoutSet) => acc + (s.weight || 0) * (s.reps || 0), 0);
                                if (exVol <= 0) return null;
                                const barWidth = totalVolume > 0 ? Math.round((exVol / totalVolume) * 100) : 0;
                                return (
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    <div className="w-12 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-surface-2)' }}>
                                      <div className="h-full rounded-full" style={{ width: `${barWidth}%`, backgroundColor: 'var(--color-primary)' }} />
                                    </div>
                                    <span className="text-[10px] font-medium" style={{ color: 'var(--color-primary)' }}>
                                      {exVol > 0 ? `${(exVol / 1000).toFixed(1)}k` : '—'}
                                    </span>
                                  </div>
                                );
                              })()}
                              {/* F43 — "Última vez" comparison badge */}
                              {(() => {
                                const prev = previousSets.get(ex.exercise_id);
                                if (!prev || prev.sets.length === 0) return null;
                                const prevBest = prev.sets[0];
                                const currentBest = ex.sets[0];
                                if (!currentBest || currentBest.weight === 0 || prevBest.weight === 0) return null;
                                const prevVol = (prevBest.weight || 0) * (prevBest.reps || 0);
                                const currentVol = (currentBest.weight || 0) * (currentBest.reps || 0);
                                const diff = currentVol - prevVol;
                                const diffSign = diff > 0 ? '↑' : diff < 0 ? '↓' : '—';
                                const diffColor = diff > 0 ? '#22c55e' : diff < 0 ? '#ef4444' : 'var(--color-text-2)';
                                return (
                                  <span
                                    className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                                    style={{ backgroundColor: 'var(--color-surface-2)', color: diffColor }}
                                    title={`Última vez: ${prevBest.weight}${unit} × ${prevBest.reps} — ${format(new Date(prev.workoutDate), "d 'de' MMM", { locale: es })}`}
                                  >
                                    {diffSign} {Math.abs(diff).toFixed(0)}kg
                                  </span>
                                );
                              })()}
                            </div>
                          </div>
                          {/* F253 — Add warmup sets */}
                          {(() => {
                            const hasWorkingWeight = ex.sets.some(s => s.weight > 0);
                            if (!hasWorkingWeight) return null;
                            return (
                              <button
                                onClick={() => handleAddWarmupSets(ex)}
                                className="p-1.5 rounded-lg flex-shrink-0"
                                style={{ color: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.1)' }}
                                title="Añadir calentamiento"
                              >
                                <Flame size={14} />
                              </button>
                            );
                          })()}
                          {/* F326 — Quick +1 set button */}
                          <button
                            onClick={() => handleAddSet(ex)}
                            className="p-1.5 rounded-lg flex-shrink-0"
                            style={{ color: '#22c55e', backgroundColor: 'rgba(34,197,94,0.1)' }}
                            title="+1 serie"
                          >
                            <Plus size={14} />
                          </button>
                          <button
                            onClick={() => handleDuplicateExercise(ex.exercise_id)}
                            className="p-1.5 rounded-lg flex-shrink-0"
                            style={{ color: '#f59e0b' }}
                            title="Duplicar ejercicio"
                          >
                            <Copy size={14} />
                          </button>
                          <button
                            onClick={() => handleRemoveExercise(ex.exercise_id)}
                            className="p-1.5 rounded-lg flex-shrink-0"
                            style={{ color: 'var(--color-danger)' }}
                            title="Eliminar ejercicio"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>

                        {/* Sets */}
                        <div className="p-2 space-y-1.5">
                          {ex.sets.map((set, setIdx) => (
                            <div key={set.id} className="flex items-center gap-1.5 text-xs flex-wrap">
                              <span className="w-5 text-center font-mono flex-shrink-0" style={{ color: 'var(--color-text-2)' }}>{setIdx + 1}</span>

                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold flex-shrink-0" style={{
                                backgroundColor: set.set_type === 'normal' ? 'var(--color-surface-2)' : `${SET_TYPE_COLORS[set.set_type as SetType]}20`,
                                color: set.set_type === 'normal' ? 'var(--color-text-2)' : SET_TYPE_COLORS[set.set_type as SetType],
                                border: set.set_type === 'normal' ? '1px solid var(--color-border)' : `1px solid ${SET_TYPE_COLORS[set.set_type as SetType]}50`,
                              }}>
                                {SET_TYPE_LABELS[set.set_type as SetType] || '—'}
                              </span>

                              <span className="flex-1 min-w-0 text-center text-sm" style={{ color: 'var(--color-text)' }}>
                                {set.weight > 0 ? `${set.weight} ${unit}` : '—'} × {set.reps}
                              </span>

                              {/* F266 — Individual PR badge: trophy on sets that exceed historical max weight PR */}
                              {set.set_type === 'normal' && set.weight > 0 && exercisePRMap[ex.exercise_id] && set.weight > exercisePRMap[ex.exercise_id] && (
                                <span
                                  className="flex items-center gap-0.5 text-[10px] px-1 rounded flex-shrink-0 font-bold"
                                  style={{ backgroundColor: 'rgba(250,204,21,0.15)', color: '#f59e0b', border: '1px solid rgba(250,204,21,0.3)' }}
                                  title={`Nuevo récord personal: ${set.weight}kg > ${exercisePRMap[ex.exercise_id]}kg`}
                                >
                                  <Trophy size={9} className="text-amber-400" />
                                </span>
                              )}

                              {/* F49 — RPE tappable badge + inline selector */}
                              {editingRpe?.exId === ex.exercise_id && editingRpe?.setId === set.id ? (
                                <div className="flex items-center gap-0.5 flex-shrink-0">
                                  {[6, 7, 8, 9, 10].map(r => (
                                    <button
                                      key={r}
                                      onClick={() => handleSaveRPE(ex.exercise_id, set.id, set.rpe === r ? null : r)}
                                      className="w-6 h-5 rounded text-[10px] font-bold"
                                      style={{
                                        backgroundColor: set.rpe === r ? `${rpeColor(r)}30` : 'var(--color-surface-2)',
                                        color: set.rpe === r ? rpeColor(r) : 'var(--color-text-2)',
                                        border: `1px solid ${set.rpe === r ? rpeColor(r) : 'var(--color-border)'}`,
                                      }}
                                    >
                                      {r}
                                    </button>
                                  ))}
                                  <button onClick={() => setEditingRpe(null)} className="w-5 h-5 flex items-center justify-center rounded" style={{ color: 'var(--color-text-2)' }}>
                                    <X size={10} />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setEditingRpe({ exId: ex.exercise_id, setId: set.id })}
                                  className="text-[10px] px-1 rounded font-bold flex-shrink-0"
                                  style={{
                                    backgroundColor: set.rpe ? `${rpeColor(set.rpe)}20` : 'var(--color-surface-2)',
                                    color: set.rpe ? rpeColor(set.rpe) : 'var(--color-text-2)',
                                    border: set.rpe ? `1px solid ${rpeColor(set.rpe)}50` : '1px solid var(--color-border)',
                                  }}
                                  title={set.rpe ? `RPE ${set.rpe}/10 — pulsa para editar` : 'RPE — pulsa para añadir'}
                                >
                                  {set.rpe ? `R${set.rpe}` : 'R—'}
                                </button>
                              )}
                              {/* F54 — Actual rest time badge (as recorded between sets) */}
                              {set.rest_time != null && set.rest_time > 0 && (
                                <span className="text-[10px] px-1 rounded flex-shrink-0" style={{
                                  backgroundColor: 'rgba(139,92,246,0.15)',
                                  color: '#8b5cf6',
                                }} title={`Descanso entre series`}>
                                  ↔ {set.rest_time}s
                                </span>
                              )}
                              {(() => {
                                const tut = calculateSetTUT(set.reps);
                                return tut > 0 ? (
                                  <span className="text-[10px] px-1 rounded flex-shrink-0" style={{
                                    backgroundColor: 'var(--color-surface-2)',
                                    color: 'var(--color-text-2)',
                                  }}>
                                    {formatTUT(tut)}
                                  </span>
                                ) : null;
                              })()}
                              {/* F46 — Estimated 1RM badge (Epley formula) */}
                              {(() => {
                                const rm = calculateEpley1RM(set.weight, set.reps);
                                if (!rm) return null;
                                return (
                                  <span className="text-[10px] px-1 rounded flex-shrink-0 font-medium" style={{
                                    backgroundColor: 'rgba(59,130,246,0.15)',
                                    color: '#3b82f6',
                                  }}
                                    title={`1RM estimado (Epley): ${format1RM(rm, unit)}`}
                                  >
                                    1RM {Math.round(rm)}
                                  </span>
                                );
                              })()}

                              {/* Set notes toggle */}
                              <button
                                onClick={() => {
                                  if (editingSetNotes?.exId === ex.exercise_id && editingSetNotes?.setId === set.id) {
                                    setEditingSetNotes(null);
                                  } else {
                                    setEditingSetNotes({ exId: ex.exercise_id, setId: set.id });
                                    setSetLevelNotesValue(set.notes || '');
                                  }
                                }}
                                className="p-1 rounded flex-shrink-0"
                                style={{ color: set.notes ? 'var(--color-primary)' : 'var(--color-text-2)', backgroundColor: editingSetNotes?.exId === ex.exercise_id && editingSetNotes?.setId === set.id ? 'var(--color-surface-2)' : 'transparent' }}
                              >
                                <MessageSquare size={12} />
                              </button>
                            </div>
                          ))}

                          {/* Set notes inline editor */}
                          {editingSetNotes && editingSetNotes.exId === ex.exercise_id && (
                            <div className="flex items-center gap-1.5 px-1">
                              <span className="w-5" />
                              <input
                                value={setLevelNotesValue}
                                onChange={e => setSetLevelNotesValue(e.target.value)}
                                placeholder="Nota de la serie..."
                                className="flex-1 px-2 py-1 rounded text-xs"
                                style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                                autoFocus
                                onKeyDown={e => {
                                  if (e.key === 'Enter') {
                                    if (editingSetNotes) handleSaveSetNotes(editingSetNotes.exId, editingSetNotes.setId);
                                  }
                                  if (e.key === 'Escape') setEditingSetNotes(null);
                                }}
                              />
                              <button onClick={() => { if (editingSetNotes) handleSaveSetNotes(editingSetNotes.exId, editingSetNotes.setId); }} className="p-1 rounded" style={{ color: 'var(--color-success)' }}>
                                <Check size={12} />
                              </button>
                              <button onClick={() => setEditingSetNotes(null)} className="p-1 rounded" style={{ color: 'var(--color-text-2)' }}>
                                <X size={12} />
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Exercise notes */}
                        <div className="px-3 py-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
                          {ex.isEditingNotes ? (
                            <div className="space-y-1.5">
                              <textarea
                                value={ex.notes}
                                onChange={e => {
                                  const val = e.target.value;
                                  setExercises(prev => prev.map(ex2 => ex2.exercise_id === ex.exercise_id ? { ...ex2, notes: val } : ex2));
                                }}
                                placeholder="Nota sobre este ejercicio..."
                                className="w-full px-2 py-1.5 rounded-lg text-xs resize-none"
                                style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                                rows={2}
                                autoFocus
                              />
                              <div className="flex gap-2">
                                <button onClick={() => handleSaveExerciseNotes(ex.exercise_id, ex.notes)} className="flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold" style={{ backgroundColor: 'var(--color-success)', color: '#fff' }}>
                                  <Check size={10} /> Guardar
                                </button>
                                <button onClick={() => {
                                  const saved = exerciseNotesRef.current.get(ex.exercise_id) || '';
                                  setExercises(prev => prev.map(ex2 => ex2.exercise_id === ex.exercise_id ? { ...ex2, isEditingNotes: false, notes: saved } : ex2));
                                }} className="px-2 py-1 rounded text-xs" style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text-2)' }}>
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => setExercises(prev => prev.map(ex2 => ex2.exercise_id === ex.exercise_id ? { ...ex2, isEditingNotes: true } : ex2))}
                              className="flex items-center gap-1.5 text-xs w-full"
                              style={{ color: ex.notes ? 'var(--color-text)' : 'var(--color-text-2)' }}
                            >
                              <MessageSquare size={11} />
                              <span className="truncate">{ex.notes || 'Añadir nota...'}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            }

            // Regular (non-superset) exercise
            const ex = group.exercises[0];
            const idx = exercises.indexOf(ex);
            return (
              <div
                key={ex.exercise_id}
                draggable
                onDragStart={() => { setDraggingIdx(idx); }}
                onDragOver={(e) => { e.preventDefault(); setDragOverIdx(idx); }}
                onDragEnd={() => {
                  if (draggingIdx !== null && draggingIdx !== idx && draggingIdx >= 0 && draggingIdx < exercises.length) {
                    const newExercises = [...exercises];
                    [newExercises[draggingIdx], newExercises[idx]] = [newExercises[idx], newExercises[draggingIdx]];
                    setExercises(newExercises);
                    const _db = getDb(); if (_db) reorderWorkoutExercises(_db, id!, newExercises.map(ex => ex.exercise_id));
                  }
                  setDraggingIdx(null);
                  setDragOverIdx(null);
                }}
                onDragEnter={() => { if (draggingIdx !== null && draggingIdx !== idx) setDragOverIdx(idx); }}
                className={`rounded-xl overflow-hidden transition-all ${draggingIdx === idx ? 'opacity-40' : ''} ${dragOverIdx === idx && draggingIdx !== null && draggingIdx !== idx ? 'ring-2 ring-[var(--color-primary)]' : ''}`}
                style={{ backgroundColor: 'var(--color-surface)' }}
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
                    <div className="flex items-center gap-1.5">
                      {/* F191 — PR badge: show trophy when this workout's max weight matches/exceeds stored PR */}
                      {(() => {
                        const prWeight = exercisePRMap[ex.exercise_id];
                        if (!prWeight) return null;
                        const workoutMaxWeight = Math.max(...ex.sets.filter((s: WorkoutSet) => s.set_type === 'normal' && s.weight > 0).map((s: WorkoutSet) => s.weight as number), 0);
                        if (workoutMaxWeight <= 0 || workoutMaxWeight < prWeight) return null;
                        return (
                          <div
                            className="flex items-center justify-center w-5 h-5 rounded flex-shrink-0"
                            style={{ backgroundColor: 'rgba(250,204,21,0.2)' }}
                            title={`¡Récord personal! ${workoutMaxWeight}kg ≥ PR anterior ${prWeight}kg`}
                          >
                            <Trophy size={11} className="text-amber-400" />
                          </div>
                        );
                      })()}
                      <p className="font-semibold text-sm truncate">{ex.exercise_name}</p>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <p className="text-xs" style={{ color: 'var(--color-text-2)' }}>{ex.sets.length} series</p>
                      <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text-2)' }}>
                        {(() => {
                          const vol = ex.sets.reduce((acc: number, s: WorkoutSet) => acc + (s.weight || 0) * (s.reps || 0), 0);
                          return vol > 0 ? `${(vol / 1000).toFixed(1)}k kg` : '—';
                        })()}
                      </span>
                      {/* F86/F316 — Average rest time per exercise (completed workout view) with color vs global avg */}
                      {(() => {
                        const restTimes = ex.sets.map((s: WorkoutSet) => s.rest_time).filter((t): t is number => t != null && t > 0);
                        if (restTimes.length === 0) return null;
                        const avgRest = Math.round(restTimes.reduce((a, b) => a + b, 0) / restTimes.length);
                        const colors = getRestTimeColor(avgRest, globalAvgRest);
                        return (
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ backgroundColor: colors.bg, color: colors.color }}>
                            ↔ avg {avgRest}s
                          </span>
                        );
                      })()}
                      {/* F43 — "Última vez" comparison badge */}
                      {(() => {
                        const prev = previousSets.get(ex.exercise_id);
                        if (!prev || prev.sets.length === 0) return null;
                        const prevBest = prev.sets[0];
                        const currentBest = ex.sets[0];
                        if (!currentBest || currentBest.weight === 0 || prevBest.weight === 0) return null;
                        const prevVol = (prevBest.weight || 0) * (prevBest.reps || 0);
                        const currentVol = (currentBest.weight || 0) * (currentBest.reps || 0);
                        const diff = currentVol - prevVol;
                        const diffSign = diff > 0 ? '↑' : diff < 0 ? '↓' : '—';
                        const diffColor = diff > 0 ? '#22c55e' : diff < 0 ? '#ef4444' : 'var(--color-text-2)';
                        return (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                            style={{ backgroundColor: 'var(--color-surface-2)', color: diffColor }}
                            title={`Última vez: ${prevBest.weight}${unit} × ${prevBest.reps} — ${format(new Date(prev.workoutDate), "d 'de' MMM", { locale: es })}`}
                          >
                            {diffSign} {Math.abs(diff).toFixed(0)}kg
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                  {/* F253 — Add warmup sets */}
                  {(() => {
                    const hasWorkingWeight = ex.sets.some(s => s.weight > 0);
                    if (!hasWorkingWeight) return null;
                    return (
                      <button
                        onClick={() => handleAddWarmupSets(ex)}
                        className="p-1.5 rounded-lg flex-shrink-0"
                        style={{ color: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.1)' }}
                        title="Añadir calentamiento"
                      >
                        <Flame size={14} />
                      </button>
                    );
                  })()}
                  {/* F326 — Quick +1 set button */}
                  <button
                    onClick={() => handleAddSet(ex)}
                    className="p-1.5 rounded-lg flex-shrink-0"
                    style={{ color: '#22c55e', backgroundColor: 'rgba(34,197,94,0.1)' }}
                    title="+1 serie"
                  >
                    <Plus size={14} />
                  </button>
                  <button
                    onClick={() => handleDuplicateExercise(ex.exercise_id)}
                    className="p-1.5 rounded-lg flex-shrink-0"
                    style={{ color: '#f59e0b' }}
                    title="Duplicar ejercicio"
                  >
                    <Copy size={14} />
                  </button>
                  {/* F235 — Superset quick-create: link icon to combine with another exercise */}
                  {!exerciseGroupIds.get(ex.exercise_id) && (
                    <button
                      onClick={() => handleQuickSuperset(ex.exercise_id)}
                      className="p-1.5 rounded-lg flex-shrink-0"
                      style={{ color: '#10b981' }}
                      title="Crear super-serie"
                    >
                      <Link size={14} />
                    </button>
                  )}
                  <button
                    onClick={() => handleRemoveExercise(ex.exercise_id)}
                    className="p-1.5 rounded-lg flex-shrink-0"
                    style={{ color: 'var(--color-danger)' }}
                    title="Eliminar ejercicio"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Sets */}
                <div className="p-2 space-y-1.5">
                  {ex.sets.map((set, setIdx) => (
                    <div key={set.id} className="flex items-center gap-1.5 text-xs flex-wrap">
                      <span className="w-5 text-center font-mono flex-shrink-0" style={{ color: 'var(--color-text-2)' }}>{setIdx + 1}</span>

                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold flex-shrink-0" style={{
                        backgroundColor: set.set_type === 'normal' ? 'var(--color-surface-2)' : `${SET_TYPE_COLORS[set.set_type as SetType]}20`,
                        color: set.set_type === 'normal' ? 'var(--color-text-2)' : SET_TYPE_COLORS[set.set_type as SetType],
                        border: set.set_type === 'normal' ? '1px solid var(--color-border)' : `1px solid ${SET_TYPE_COLORS[set.set_type as SetType]}50`,
                      }}>
                        {SET_TYPE_LABELS[set.set_type as SetType] || '—'}
                      </span>

                      <span className="flex-1 min-w-0 text-center text-sm" style={{ color: 'var(--color-text)' }}>
                        {set.weight > 0 ? `${set.weight} ${unit}` : '—'} × {set.reps}
                      </span>

                      {/* F49 — RPE tappable badge + inline selector */}
                      {editingRpe?.exId === ex.exercise_id && editingRpe?.setId === set.id ? (
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          {[6, 7, 8, 9, 10].map(r => (
                            <button
                              key={r}
                              onClick={() => handleSaveRPE(ex.exercise_id, set.id, set.rpe === r ? null : r)}
                              className="w-6 h-5 rounded text-[10px] font-bold"
                              style={{
                                backgroundColor: set.rpe === r ? `${rpeColor(r)}30` : 'var(--color-surface-2)',
                                color: set.rpe === r ? rpeColor(r) : 'var(--color-text-2)',
                                border: `1px solid ${set.rpe === r ? rpeColor(r) : 'var(--color-border)'}`,
                              }}
                            >
                              {r}
                            </button>
                          ))}
                          <button onClick={() => setEditingRpe(null)} className="w-5 h-5 flex items-center justify-center rounded" style={{ color: 'var(--color-text-2)' }}>
                            <X size={10} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setEditingRpe({ exId: ex.exercise_id, setId: set.id })}
                          className="text-[10px] px-1 rounded font-bold flex-shrink-0"
                          style={{
                            backgroundColor: set.rpe ? `${rpeColor(set.rpe)}20` : 'var(--color-surface-2)',
                            color: set.rpe ? rpeColor(set.rpe) : 'var(--color-text-2)',
                            border: set.rpe ? `1px solid ${rpeColor(set.rpe)}50` : '1px solid var(--color-border)',
                          }}
                          title={set.rpe ? `RPE ${set.rpe}/10 — pulsa para editar` : 'RPE — pulsa para añadir'}
                        >
                          {set.rpe ? `R${set.rpe}` : 'R—'}
                        </button>
                      )}
                      {/* F54 — Actual rest time badge (as recorded between sets) */}
                      {set.rest_time != null && set.rest_time > 0 && (
                        <span className="text-[10px] px-1 rounded flex-shrink-0" style={{
                          backgroundColor: 'rgba(139,92,246,0.15)',
                          color: '#8b5cf6',
                        }} title={`Descanso entre series`}>
                          ↔ {set.rest_time}s
                        </span>
                      )}
                      {/* F46 — Estimated 1RM badge for completed sets */}
                      {(() => {
                        const rm = calculateEpley1RM(set.weight, set.reps);
                        if (!rm) return null;
                        return (
                          <span className="text-[10px] px-1 rounded flex-shrink-0 font-medium" style={{
                            backgroundColor: 'rgba(59,130,246,0.15)',
                            color: '#3b82f6',
                          }}
                            title={`1RM estimado (Epley): ${format1RM(rm, unit)}`}
                          >
                            1RM {Math.round(rm)}
                          </span>
                        );
                      })()}

                      {/* Set notes toggle */}
                      <button
                        onClick={() => {
                          if (editingSetNotes?.exId === ex.exercise_id && editingSetNotes?.setId === set.id) {
                            setEditingSetNotes(null);
                          } else {
                            setEditingSetNotes({ exId: ex.exercise_id, setId: set.id });
                            setSetLevelNotesValue(set.notes || '');
                          }
                        }}
                        className="p-1 rounded flex-shrink-0"
                        style={{ color: set.notes ? 'var(--color-primary)' : 'var(--color-text-2)', backgroundColor: editingSetNotes?.exId === ex.exercise_id && editingSetNotes?.setId === set.id ? 'var(--color-surface-2)' : 'transparent' }}
                      >
                        <MessageSquare size={12} />
                      </button>
                    </div>
                  ))}

                  {/* Set notes inline editor */}
                  {editingSetNotes && editingSetNotes.exId === ex.exercise_id && (
                    <div className="flex items-center gap-1.5 px-1">
                      <span className="w-5" />
                      <input
                        value={setLevelNotesValue}
                        onChange={e => setSetLevelNotesValue(e.target.value)}
                        placeholder="Nota de la serie..."
                        className="flex-1 px-2 py-1 rounded text-xs"
                        style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            if (editingSetNotes) handleSaveSetNotes(editingSetNotes.exId, editingSetNotes.setId);
                          }
                          if (e.key === 'Escape') setEditingSetNotes(null);
                        }}
                      />
                      <button onClick={() => { if (editingSetNotes) handleSaveSetNotes(editingSetNotes.exId, editingSetNotes.setId); }} className="p-1 rounded" style={{ color: 'var(--color-success)' }}>
                        <Check size={12} />
                      </button>
                      <button onClick={() => setEditingSetNotes(null)} className="p-1 rounded" style={{ color: 'var(--color-text-2)' }}>
                        <X size={12} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Exercise notes */}
                <div className="px-3 py-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
                  {ex.isEditingNotes ? (
                    <div className="space-y-1.5">
                      <textarea
                        value={ex.notes}
                        onChange={e => {
                          const val = e.target.value;
                          setExercises(prev => prev.map(ex2 => ex2.exercise_id === ex.exercise_id ? { ...ex2, notes: val } : ex2));
                        }}
                        placeholder="Nota sobre este ejercicio..."
                        className="w-full px-2 py-1.5 rounded-lg text-xs resize-none"
                        style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                        rows={2}
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button onClick={() => handleSaveExerciseNotes(ex.exercise_id, ex.notes)} className="flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold" style={{ backgroundColor: 'var(--color-success)', color: '#fff' }}>
                          <Check size={10} /> Guardar
                        </button>
                        <button onClick={() => {
                          const saved = exerciseNotesRef.current.get(ex.exercise_id) || '';
                          setExercises(prev => prev.map(ex2 => ex2.exercise_id === ex.exercise_id ? { ...ex2, isEditingNotes: false, notes: saved } : ex2));
                        }} className="px-2 py-1 rounded text-xs" style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text-2)' }}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setExercises(prev => prev.map(ex2 => ex2.exercise_id === ex.exercise_id ? { ...ex2, isEditingNotes: true } : ex2))}
                      className="flex items-center gap-1.5 text-xs w-full"
                      style={{ color: ex.notes ? 'var(--color-text)' : 'var(--color-text-2)' }}
                    >
                      <MessageSquare size={11} />
                      <span className="truncate">{ex.notes || 'Añadir nota...'}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          });

          return exerciseElements;
        })()}
      </div>

      {/* Share card section */}
      <div className="p-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
        <button
          onClick={() => setShowShareCard(!showShareCard)}
          className="flex items-center gap-2 text-sm font-medium mb-2"
          style={{ color: 'var(--color-primary)' }}
        >
          <Share2 size={14} />
          {showShareCard ? 'Ocultar' : 'Generar imagen del workout'}
        </button>

        {showShareCard && workout && (
          <div className="space-y-3">
            {/* Hidden card rendered off-screen for html2canvas capture */}
            <div style={{ position: 'absolute', left: -9999, top: -9999 }}>
              <div ref={shareCardRef}>
                <WorkoutShareCard
                  workoutName={workout.name}
                  date={workout.started_at}
                  durationSeconds={workout.finished_at && workout.started_at
                    ? Math.floor((new Date(workout.finished_at).getTime() - new Date(workout.started_at).getTime()) / 1000)
                    : elapsedDisplay}
                  exercises={exercises.map(ex => ({
                    exercise_name: ex.exercise_name,
                    sets: ex.sets.map(s => ({
                      reps: s.reps,
                      weight: s.weight,
                      rpe: s.rpe,
                      set_type: s.set_type,
                    })),
                  }))}
                  totalVolume={totalVolume}
                  workoutCount={(() => {
                    const db = getDb();
                    return db ? getWorkoutCount(db) : 0;
                  })()}
                  muscleGroups={[...new Set(exercises.map(ex => ex.muscle_group).filter(Boolean))]}
                />
              </div>
            </div>

            <WorkoutShare cardRef={shareCardRef} workoutName={workout.name} />
          </div>
        )}
      </div>
    </div>
  );
}
