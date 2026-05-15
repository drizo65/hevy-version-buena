/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Star, TrendingUp, Weight, Repeat, Plus, BarChart2, Trophy, Lightbulb, Shuffle, Calculator, PlusCircle, X, Copy, Check, MessageSquare, Zap, Timer } from 'lucide-react';
import { getDb, generateId } from '../database/init';
import { saveRoutineExercise, saveExerciseDifficulty } from '../database/mutations';
import { calculate1RM, getBestSetForExercise } from '../database/queries';
import { getExerciseById, getExerciseSetsHistoryWithWorkout, getMaxWeightForExercise, getExerciseStats, getLastExerciseSets, getEstimated1RM, getLastWorkoutRPEForExercise, getLastExerciseNotes, getSimilarExercises, getPersonalRecords, getLastPerformedDates, getAllRoutines, getRoutineExercises, getExerciseDifficulty, getExerciseTrainingInterval } from '../database/queries';
import { useExerciseStore } from '../store/exerciseStore';
import { useSettingsStore } from '../store/settingsStore';
import { useWorkoutStore } from '../store/workoutStore';
import { toastStore } from '../components/ui/toastStore';
import { format } from 'date-fns';
import { formatTimeSince, getTimeSinceColor } from '../utils/dateUtils';
import { es } from 'date-fns/locale';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid } from 'recharts';
import type { Exercise, WorkoutSet, PersonalRecord, Routine, RoutineExercise } from '../types';

type HistorySet = WorkoutSet & { workout_date: string; workout_id: string; workout_name: string; workout_tags: string[] };

const SET_TYPE_COLORS_HISTORY: Record<string, string> = {
  normal: 'var(--color-text-2)',
  warmup: '#f59e0b',
  drop: '#8b5cf6',
  failure: '#ef4444',
  superset: '#10b981',
};

const equipmentColors: Record<string, string> = {
  barbell: '#3b82f6',
  dumbbell: '#8b5cf6',
  machine: '#10b981',
  cable: '#f59e0b',
  bodyweight: '#ef4444',
  kettlebell: '#ec4899',
  bands: '#06b6d4',
  other: '#6b7280',
};

const muscleLabels: Record<string, string> = {
  chest: 'Pecho',
  back: 'Espalda',
  legs: 'Piernas',
  shoulders: 'Hombros',
  arms: 'Brazos',
  core: 'Core',
  cardio: 'Cardio',
  full_body: 'Full Body',
};

const EQUIPMENT_LABELS: Record<string, string> = {
  barbell: 'Barra',
  dumbbell: 'Mancuernas',
  machine: 'Máquina',
  cable: 'Cable',
  bodyweight: 'Bodyweight',
  kettlebell: 'Kettlebell',
  bands: 'Bandas',
  other: 'Otro',
};

function formatWeight(w: number, unit: string): string {
  if (unit === 'lb') return `${Math.round(w)} lb`;
  return `${w.toFixed(1)} kg`;
}


export default function ExerciseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { favorites, toggleFavorite } = useExerciseStore();
  const { activeWorkout, addExerciseToWorkout, swapExerciseInWorkout, startWorkout } = useWorkoutStore();
  const { unit, defaultSets, defaultReps } = useSettingsStore();

  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [history, setHistory] = useState<HistorySet[]>([]);
  const [maxWeight, setMaxWeight] = useState<number | null>(null);
  const [stats, setStats] = useState<{ maxWeight: number; totalVolume: number; setCount: number } | null>(null);
  const [workoutCount, setWorkoutCount] = useState(0);
  const [estimated1RM, setEstimated1RM] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [addedFeedback, setAddedFeedback] = useState(false);
  // F144 — Copy last sets to clipboard feedback
  const [copiedFeedback, setCopiedFeedback] = useState(false);
  const [suggestedWeight, setSuggestedWeight] = useState<{ weight: number; reason: string } | null>(null);
  const [variations, setVariations] = useState<Exercise[]>([]);
  // F94/F181 — PR achievement date for max_weight; F181 timeline needs workout_id
  const [personalRecords, setPersonalRecords] = useState<PersonalRecord[]>([]);
  // F103 — Last performed date
  const [lastPerformed, setLastPerformed] = useState<string | null>(null);
  // F123 — Add to routine modal
  const [showAddToRoutine, setShowAddToRoutine] = useState(false);
  const [routineList, setRoutineList] = useState<{ id: string; name: string }[]>([]);
  const [selectedRoutineId, setSelectedRoutineId] = useState<string | null>(null);
  const [routineSets, setRoutineSets] = useState(defaultSets);
  const [routineReps, setRoutineReps] = useState(String(defaultReps));
  const [routineWeight, setRoutineWeight] = useState('');
  // F180 — Exercise difficulty rating (1-5)
  const [difficulty, setDifficulty] = useState(0);
  // F229 — Quick-start feedback: shows briefly after starting a workout from ExerciseDetailPage
  const [quickStarted, setQuickStarted] = useState(false);
  // F230 — Workout session timer: elapsed seconds since activeWorkout startedAt
  // Lazy-initialize to the true elapsed value so there's no 00:00 flash on mount
  const [elapsedSeconds, setElapsedSeconds] = useState(() => {
    if (activeWorkout) {
      return Math.floor((Date.now() - new Date(activeWorkout.startedAt).getTime()) / 1000);
    }
    return 0;
  });
  // F241 — Training interval: average days between workout sessions for this exercise
  const [trainingInterval, setTrainingInterval] = useState<{ avgDays: number; recommendedDays: number; sessions: number } | null>(null);

  // F259 — Best set for this exercise (for "Usar mejor serie" auto-fill)
  const [bestSet, setBestSet] = useState<{ workout_id: string; workout_name: string; weight: number; reps: number; achieved_at: string } | null>(null);
  // F319 — PR prediction: weight × reps needed to beat current maxWeight PR
  const [prPrediction, setPrPrediction] = useState<{ weight: number; reps: number } | null>(null);

  useEffect(() => {
    if (!id) return;
    const db = getDb();
    if (!db) return;

    // F180 — Load difficulty rating
    setDifficulty(getExerciseDifficulty(db, id));

    const ex = getExerciseById(db, id);
    if (ex) {
      setExercise(ex);
      const sets = getExerciseSetsHistoryWithWorkout(db, id, 50) as HistorySet[];
      setHistory(sets);
      const mw = getMaxWeightForExercise(db, id);
      setMaxWeight(mw);
      // F260 — Fix: use getMaxWeightForExercise (unlimited sets) for stats.maxWeight
      // to match the trophy badge's true PR. getExerciseStats caps at 100 sets.
      const st = getExerciseStats(db, id);
      setStats(st ? { ...st, maxWeight: mw ?? st.maxWeight } : st);
      const e1rm = getEstimated1RM(db, id);
      setEstimated1RM(e1rm);

      // Load similar/variation exercises (F12)
      const similar = getSimilarExercises(db, id, 4);
      setVariations(similar);

      // F94 — Load personal records to show PR achievement dates
      const prs = getPersonalRecords(db, id);
      setPersonalRecords(prs);

      // F319 — Compute PR prediction: find weight × reps combo that would beat current maxWeight PR
      if (prs.length > 0 && sets.length > 0) {
        const prRecord = prs.find(pr => pr.type === 'max_weight');
        if (prRecord) {
          const best = sets.reduce<{ weight: number; reps: number } | null>((best, s) => {
            if (!s.weight || s.weight <= 0) return best;
            if (!best || s.weight * s.reps > best.weight * best.reps) return { weight: s.weight, reps: s.reps };
            return best;
          }, null);
          if (best) {
            const reps = best.reps > 0 ? best.reps : 5;
            // Invert Epley: weight = (E1RM * 30 - E1RM * reps) / (reps + 30)
            const required = (prRecord.value * 30 - prRecord.value * reps) / (reps + 30);
            if (required > 0) setPrPrediction({ weight: Math.round(required * 10) / 10, reps });
          }
        }
      }

      // F103 — Load last performed date
      const allLastPerformed = getLastPerformedDates(db);
      setLastPerformed(allLastPerformed[id] || null);

      // F241 — Load training interval for this exercise
      setTrainingInterval(getExerciseTrainingInterval(db, id));

      // F259 — Load best set for this exercise
      setBestSet(getBestSetForExercise(db, id));

      // Count unique workouts with this exercise
      const uniqueWorkouts = new Set(sets.map(s => s.workout_id));
      setWorkoutCount(uniqueWorkouts.size);

      // Smart weight suggestion based on RPE (F21)
      const lastRPE = getLastWorkoutRPEForExercise(db, id);
      if (lastRPE && lastRPE.weight > 0) {
        const { rpe, weight } = lastRPE;
        let suggestion: { weight: number; reason: string } | null = null;
        if (rpe === null || rpe === undefined) {
          // No RPE recorded, suggest maintaining weight
          suggestion = { weight, reason: 'Sin RPE - mantener peso' };
        } else if (rpe < 8) {
          // Too easy — suggest increasing
          suggestion = { weight: weight + 2.5, reason: `RPE ${rpe} — demasiado fácil, probar +2.5kg` };
        } else if (rpe >= 8 && rpe <= 9) {
          // Good range — suggest maintaining or small increase
          suggestion = { weight, reason: `RPE ${rpe} — buen rango, mantener peso` };
        } else if (rpe >= 10) {
          // At failure — suggest decreasing or maintaining
          suggestion = { weight: Math.max(weight - 2.5, 0), reason: `RPE ${rpe} — al fallo, reducir a ${weight - 2.5}kg` };
        }
        setSuggestedWeight(suggestion);
      }
    }
    setLoading(false);
  }, [id]);

  // F230 — Workout session timer: update elapsed seconds every second while activeWorkout is running
  useEffect(() => {
    if (!activeWorkout) {
      setElapsedSeconds(0);
      return;
    }
    const updateElapsed = () => {
      const started = new Date(activeWorkout.startedAt).getTime();
      const now = Date.now();
      setElapsedSeconds(Math.floor((now - started) / 1000));
    };
    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [activeWorkout]);

  // Group history by workout (F135 — group by workout_id to show workout name)
  const historyByDate = useMemo(() => {
    const map: Record<string, { date: string; sets: HistorySet[]; workout_name: string; workout_id: string; workout_tags: string[] }> = {};
    history.forEach(set => {
      const wid = set.workout_id || set.workout_date;
      if (!map[wid]) {
        map[wid] = { date: set.workout_date ? format(new Date(set.workout_date), 'yyyy-MM-dd') : 'unknown', sets: [], workout_name: set.workout_name || '', workout_id: set.workout_id || '', workout_tags: (set as HistorySet).workout_tags || [] };
      }
      map[wid].sets.push(set);
    });
    return Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
  }, [history]);

  const [chartMetric, setChartMetric] = useState<'weight' | '1rm'>('weight');
  const [showTrend, setShowTrend] = useState(true);

  // Build proper chart data grouped by workout date (F25 + F62 trend line)
  const chartData = useMemo(() => {
    type ChartEntry = { date: string; weight: number; reps: number; volume: number; estimated1rm: number; trend?: number };
    const byDate: Record<string, ChartEntry> = {};
    history.forEach(s => {
      if (!s.weight || s.weight <= 0) return;
      const d = s.workout_date ? format(new Date(s.workout_date), 'yyyy-MM-dd') : 'unknown';
      if (!byDate[d]) {
        byDate[d] = { date: d, weight: 0, reps: 0, volume: 0, estimated1rm: 0 };
      }
      if (s.weight > byDate[d].weight) {
        byDate[d].weight = s.weight;
        // Estimate 1RM from the heaviest set of the day
        byDate[d].estimated1rm = Math.round(calculate1RM(s.weight, s.reps) * 10) / 10;
      }
      byDate[d].reps += s.reps;
      byDate[d].volume += s.weight * s.reps;
    });
    const sorted = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
    // F62 — compute linear regression trend values
    if (sorted.length < 2) return sorted;
    const n = sorted.length;
    const xMean = (n - 1) / 2;
    const vals = sorted.map(d => chartMetric === 'weight' ? d.weight : d.estimated1rm);
    const yMean = vals.reduce((s, v) => s + v, 0) / n;
    let num = 0;
    let den = 0;
    vals.forEach((y, i) => {
      num += (i - xMean) * (y - yMean);
      den += (i - xMean) ** 2;
    });
    if (den === 0) return sorted;
    const slope = num / den;
    const intercept = yMean - slope * xMean;
    return sorted.map((d, i) => ({
      ...d,
      trend: Math.round((slope * i + intercept) * 10) / 10,
    }));
  }, [history, chartMetric]);

  // F218 — Pre-compute last sets/notes for the current exercise (used by the Add button and copy-to-clipboard)
  const currentExerciseLastSets = useMemo(() => {
    if (!id) return [];
    const db = getDb();
    if (!db) return [];
    return getLastExerciseSets(db, id);
  }, [id]);

  const currentExerciseLastNotes = useMemo(() => {
    if (!id) return '';
    const db = getDb();
    if (!db) return '';
    return getLastExerciseNotes(db, id);
  }, [id]);

  // F282 — Last session preview: summary of the most recent workout for this exercise
  const lastSessionPreview = useMemo(() => {
    if (currentExerciseLastSets.length === 0) return null;
    const topSet = currentExerciseLastSets.reduce((best, s) => {
      const e1rm = calculate1RM(s.weight, s.reps);
      const bestE1rm = calculate1RM(best.weight, best.reps);
      return e1rm > bestE1rm ? s : best;
    });
    const totalVolume = currentExerciseLastSets.reduce((sum, s) => sum + s.weight * s.reps, 0);
    const lastDate = history.length > 0 ? history[0].workout_date : null;
    return { topSet, totalSets: currentExerciseLastSets.length, totalVolume, lastDate };
  }, [currentExerciseLastSets, history]);

  // F144 — Copy last sets to clipboard
  const handleCopyLastSets = () => {
    if (currentExerciseLastSets.length === 0) return;
    const lines = currentExerciseLastSets
      .slice(0, 10)
      .map((s, i) => `Set ${i + 1}: ${s.weight} ${unit} × ${s.reps} reps`)
      .join('\n');
    navigator.clipboard.writeText(lines).then(() => {
      setCopiedFeedback(true);
      setTimeout(() => setCopiedFeedback(false), 2000);
    });
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p style={{ color: 'var(--color-text-2)' }}>Cargando...</p>
      </div>
    );
  }

  if (!exercise) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p style={{ color: 'var(--color-text-2)' }}>Ejercicio no encontrado</p>
        <button onClick={() => navigate(-1)} className="text-sm" style={{ color: 'var(--color-primary)' }}>
          Volver
        </button>
      </div>
    );
  }

  const isFav = favorites.includes(exercise.id);
  const bestVolume = stats ? Math.max(...history.filter(s => s.weight > 0).map(s => s.weight * s.reps), 0) : 0;
  const bestReps = stats ? Math.max(...history.map(s => s.reps), 0) : 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
        <button onClick={() => navigate(-1)} className="p-2 rounded-lg" style={{ backgroundColor: 'var(--color-surface)' }}>
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: equipmentColors[exercise.equipment] || equipmentColors.other }}
            />
            <h1 className="text-xl font-bold truncate">{exercise.name}</h1>
          </div>
          <p className="text-xs capitalize" style={{ color: 'var(--color-text-2)' }}>
            {muscleLabels[exercise.muscle_group] || exercise.muscle_group}
            {/* F285 — Show secondary muscles when present */}
            {exercise.secondary_muscles.length > 0 && (
              <span className="opacity-70">
                {' + '}{exercise.secondary_muscles.map(s => muscleLabels[s] || s).join(', ')}
              </span>
            )}
            {' • '}{EQUIPMENT_LABELS[exercise.equipment] || exercise.equipment}
          </p>
          {/* F234 — "Time since last workout" chip — hours/days instead of date */}
          {lastPerformed && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0"
              style={{ backgroundColor: `${getTimeSinceColor(lastPerformed)}20`, color: getTimeSinceColor(lastPerformed) }}
              title={`Último entreno: ${format(new Date(lastPerformed), 'dd MMM yyyy', { locale: es })}`}
            >
              {formatTimeSince(lastPerformed)}
            </span>
          )}
          {/* F241 — Training interval recommendation chip */}
          {trainingInterval && trainingInterval.avgDays > 0 && (() => {
            const ratio = trainingInterval.avgDays / trainingInterval.recommendedDays;
            const intervalColor = ratio <= 1 ? '#10b981' : ratio <= 1.4 ? '#f59e0b' : '#ef4444';
            const intervalLabel = ratio <= 1 ? `↻ ${trainingInterval.avgDays}d`
              : ratio <= 1.4 ? `⏳ ${trainingInterval.avgDays}d`
              : `⏰ ${trainingInterval.avgDays}d`;
            return (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0"
                title={`Media: cada ${trainingInterval.avgDays}d · recomendado: ${trainingInterval.recommendedDays}d · basado en ${trainingInterval.sessions} sesiones`}
                style={{
                  backgroundColor: `${intervalColor}20`,
                  color: intervalColor,
                }}
              >
                {intervalLabel}
              </span>
            );
          })()}
          {/* F230 — Workout session timer chip */}
          {activeWorkout && elapsedSeconds > 0 && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0 flex items-center gap-0.5"
              style={{ backgroundColor: 'var(--color-primary)', color: '#000' }}
              title={`Workout en curso — iniciado hace ${Math.floor(elapsedSeconds / 60)}m`}
            >
              <Timer size={10} />
              {String(Math.floor(elapsedSeconds / 60)).padStart(2, '0')}:{String(elapsedSeconds % 60).padStart(2, '0')}
            </span>
          )}
          {/* F282 — Last session preview chip */}
          {lastSessionPreview && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0"
              style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text-2)' }}
              title={`Última sesión: ${lastSessionPreview.totalSets} series · ${lastSessionPreview.totalVolume.toLocaleString()} kg totales`}
            >
              Última vez: {formatWeight(lastSessionPreview.topSet.weight, unit)} × {lastSessionPreview.topSet.reps} · {lastSessionPreview.totalSets}s
            </span>
          )}
        </div>
        <button
          onClick={() => toggleFavorite(exercise.id)}
          className="p-2 rounded-lg"
          style={{ backgroundColor: 'var(--color-surface)' }}
        >
          <Star
            size={20}
            className={isFav ? 'text-[var(--color-primary)] fill-[var(--color-primary)]' : 'text-[var(--color-text-2)]'}
          />
        </button>
        {exercise.is_custom && (
          <button
            onClick={() => navigate(`/exercise/custom/${exercise.id}`)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)' }}
          >
            Editar
          </button>
        )}
        {/* F218 — Add to active workout button (auto-fills last-used sets/notes) */}
        {activeWorkout && (
          <button
            onClick={() => {
              addExerciseToWorkout(exercise.id, exercise.name, undefined, currentExerciseLastSets, currentExerciseLastNotes);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold"
            style={{ backgroundColor: 'var(--color-primary)', color: '#000' }}
            title={suggestedWeight ? `Añadir con ${suggestedWeight.weight} ${unit}` : currentExerciseLastSets.length > 0 ? `Añadir con ${currentExerciseLastSets[0].weight} ${unit} × ${currentExerciseLastSets[0].reps} reps` : 'Añadir al workout'}
          >
            <Plus size={14} />
            Añadir
          </button>
        )}
        {/* F123 — Add to routine button */}
        <button
          onClick={() => {
            const db = getDb();
            if (!db) return;
            const routines = getAllRoutines(db);
            setRoutineList(routines.map((r: Routine) => ({ id: r.id, name: r.name })));
            setSelectedRoutineId(null);
            setRoutineSets(defaultSets);
            setRoutineReps(String(defaultReps));
            setRoutineWeight('');
            setShowAddToRoutine(true);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold"
          style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)' }}
          title="Añadir a una rutina"
        >
          <PlusCircle size={14} />
          Rutina
        </button>
        {/* F144 — Copy last sets button */}
        <button
          onClick={handleCopyLastSets}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
          style={{
            backgroundColor: copiedFeedback ? 'rgba(34,197,94,0.2)' : 'var(--color-surface-2)',
            color: copiedFeedback ? '#22c55e' : 'var(--color-text)',
          }}
          title="Copiar últimos sets"
        >
          {copiedFeedback ? <Check size={14} /> : <Copy size={14} />}
          {copiedFeedback ? '¡Copiado!' : 'Copiar últimos'}
        </button>
        {/* F259 — Best set badge: always visible so users can copy best set even without an active workout; click starts workout and auto-fills if needed */}
        {(maxWeight != null && maxWeight > 0 && bestSet) && (
          <button
            onClick={() => {
              if (!bestSet) return;
              if (!activeWorkout) {
                // F259 — No active workout: start one, add the exercise with its best set, navigate to workouts
                startWorkout();
                const newSets = [{ reps: bestSet.reps, weight: bestSet.weight, set_type: 'normal' as const }];
                setTimeout(() => {
                  addExerciseToWorkout(exercise.id, exercise.name, undefined, newSets, '');
                  toastStore.success('¡Workout iniciado con mejor serie!');
                  navigate('/workouts');
                }, 50);
              } else {
                addExerciseToWorkout(exercise.id, exercise.name, undefined, [{ reps: bestSet.reps, weight: bestSet.weight, set_type: 'normal' as const }], '');
                toastStore.success('¡Mejor serie añadida!');
              }
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg flex-shrink-0 transition-opacity"
            style={{ backgroundColor: 'rgba(250,204,21,0.15)', border: '1px solid rgba(250,204,21,0.3)' }}
            title={`${bestSet.weight} kg × ${bestSet.reps} reps — Pulsa para usar esta serie`}
          >
            <Trophy size={13} className="text-amber-400 flex-shrink-0" />
            <div className="flex flex-col items-start">
              <span className="text-[10px] font-bold text-amber-400 leading-none">{bestSet.weight}×{bestSet.reps}</span>
              <span className="text-[9px] text-amber-500/80 leading-none mt-0.5">1RM {estimated1RM.toFixed(0)}</span>
            </div>
            {!activeWorkout && (
              <Zap size={10} className="text-amber-400/70 flex-shrink-0 ml-0.5" />
            )}
            {activeWorkout && (
              <span className="text-[8px] font-bold text-amber-400/70 leading-none ml-1">+</span>
            )}
          </button>
        )}
        <button
          onClick={() => navigate(`/exercise-progress/${exercise.id}`)}
          className="p-2 rounded-lg"
          style={{ backgroundColor: 'var(--color-surface)' }}
          title="Ver progreso"
        >
          <BarChart2 size={20} style={{ color: 'var(--color-primary)' }} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* PR Cards */}
        <div className="p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--color-text-2)' }}>
            Récords Personales
          </h2>
          <div className="grid grid-cols-4 gap-2">
            {/* Max Weight */}
            <div className="flex flex-col items-center p-3 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
              <Weight size={16} className="mb-1" style={{ color: 'var(--color-primary)' }} />
              <p className="text-lg font-bold font-mono" style={{ color: 'var(--color-primary)' }}>
                {maxWeight ? formatWeight(maxWeight, unit) : '—'}
              </p>
              <p className="text-[10px]" style={{ color: 'var(--color-text-2)' }}>Peso máx.</p>
              {/* F94 — PR achievement date */}
              {personalRecords.find(pr => pr.type === 'max_weight') && (
                <p className="text-[9px] mt-0.5 px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text-2)' }}>
                  {format(new Date(personalRecords.find(pr => pr.type === 'max_weight')!.achieved_at), 'dd/MM/yy')}
                </p>
              )}
            </div>
            {/* Estimated 1RM */}
            <div className="flex flex-col items-center p-3 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
              <Trophy size={16} className="mb-1" style={{ color: 'var(--color-primary)' }} />
              <p className="text-lg font-bold font-mono" style={{ color: 'var(--color-primary)' }}>
                {estimated1RM > 0 ? formatWeight(estimated1RM, unit) : '—'}
              </p>
              <p className="text-[10px]" style={{ color: 'var(--color-text-2)' }}>1RM est.</p>
            </div>
            {/* Best Volume (single set) */}
            <div className="flex flex-col items-center p-3 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
              <TrendingUp size={16} className="mb-1" style={{ color: 'var(--color-success)' }} />
              <p className="text-lg font-bold font-mono" style={{ color: 'var(--color-success)' }}>
                {bestVolume > 0 ? formatWeight(bestVolume, unit) : '—'}
              </p>
              <p className="text-[10px]" style={{ color: 'var(--color-text-2)' }}>Mejor vol.</p>
            </div>
            {/* Max Reps */}
            <div className="flex flex-col items-center p-3 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
              <Repeat size={16} className="mb-1" style={{ color: 'var(--color-primary)' }} />
              <p className="text-lg font-bold font-mono" style={{ color: 'var(--color-primary)' }}>
                {bestReps > 0 ? bestReps : '—'}
              </p>
              <p className="text-[10px]" style={{ color: 'var(--color-text-2)' }}>Reps máx.</p>
            </div>
          </div>

          {/* F319 — PR prediction hint: weight × reps needed to beat current maxWeight PR */}
          {prPrediction && (
            <div className="flex items-center gap-2 mt-3 px-3 py-2.5 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
              <Trophy size={14} style={{ color: 'var(--color-primary)' }} />
              <div className="flex-1 min-w-0">
                <span className="text-xs" style={{ color: 'var(--color-text-2)' }}>Para nuevo PR:</span>
                <span className="ml-2 text-sm font-bold" style={{ color: 'var(--color-primary)' }}>
                  {prPrediction.weight} kg × {prPrediction.reps} reps
                </span>
              </div>
            </div>
          )}
        </div>

        {/* F180 — Difficulty rating */}
        <div className="px-4 pb-4">
          <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb size={14} style={{ color: 'var(--color-primary)' }} />
              <h3 className="text-sm font-semibold">Dificultad</h3>
              <span className="text-xs ml-auto" style={{ color: 'var(--color-text-2)' }}>
                {difficulty === 0 ? 'Sin calificar' : `${difficulty}/5`}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map(dot => {
                const diffColors = ['#22c55e', '#84cc16', '#f59e0b', '#f97316', '#ef4444'];
                const isActive = difficulty >= dot;
                return (
                  <button
                    key={dot}
                    onClick={() => {
                      const newDiff = difficulty === dot ? 0 : dot;
                      const db = getDb();
                      if (!db) return;
                      saveExerciseDifficulty(db, exercise.id, newDiff);
                      setDifficulty(newDiff);
                    }}
                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
                    style={{
                      backgroundColor: isActive ? diffColors[dot - 1] : 'var(--color-surface-2)',
                    }}
                    title={`Nivel ${dot}`}
                  >
                    <span className="text-xs font-bold" style={{ color: isActive ? '#fff' : 'var(--color-text-2)' }}>
                      {dot}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] mt-2" style={{ color: 'var(--color-text-2)' }}>
              Toca un número para calificar (1=Fácil · 5=Muy difícil) — vuelve a tocar el mismo número para borrar la calificación
            </p>
          </div>
        </div>

        {/* F181 — PR History Visual Timeline */}
        {personalRecords.length > 0 && (
          <div className="px-4 pb-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--color-text-2)' }}>
              Línea de tiempo — Récords Personales
            </h2>
            <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
              {/* Timeline entries grouped by type */}
              {(['max_weight', 'estimated_1rm'] as const).map(prType => {
                const recordsOfType = personalRecords.filter(pr => pr.type === prType);
                if (recordsOfType.length === 0) return null;
                return (
                  <div key={prType} className="mb-4 last:mb-0">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Trophy size={12} style={{ color: '#f59e0b' }} />
                      <span className="text-xs font-semibold" style={{ color: 'var(--color-text-2)' }}>
                        {prType === 'max_weight' ? 'Peso máximo' : '1RM estimado'}
                      </span>
                    </div>
                    {/* Timeline line with markers */}
                    <div className="relative">
                      {/* Vertical line */}
                      <div
                        className="absolute left-[7px] top-2 bottom-2 w-0.5 rounded-full"
                        style={{ backgroundColor: 'var(--color-border)' }}
                      />
                      {/* Entries */}
                      <div className="space-y-1.5 pl-5">
                        {recordsOfType.map((pr, i) => {
                          const isLatest = i === 0;
                          const isPR = pr.type === 'max_weight';
                          const color = isPR ? 'var(--color-primary)' : '#f59e0b';
                          return (
                            <div
                              key={pr.id}
                              className="relative flex items-center gap-3 p-2 rounded-lg transition-all cursor-pointer hover:opacity-90"
                              style={{ backgroundColor: 'var(--color-surface-2)' }}
                              onClick={() => pr.achieved_at && navigate(`/workout/${pr.workout_id}`)}
                              title={isLatest ? 'Récord actual — clic para ver workout' : `Logrado el ${format(new Date(pr.achieved_at), 'dd MMM yyyy', { locale: es })} — clic para ver workout`}
                            >
                              {/* Timeline dot */}
                              <div
                                className="absolute -left-[13px] top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center"
                                style={{
                                  backgroundColor: isLatest ? color : 'var(--color-surface)',
                                  borderColor: color,
                                  zIndex: 1,
                                }}
                              >
                                {isLatest && (
                                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#fff' }} />
                                )}
                              </div>
                              {/* PR type badge */}
                              <div
                                className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
                                style={{ backgroundColor: `${color}20` }}
                              >
                                <Trophy size={11} style={{ color }} />
                              </div>
                              {/* Content */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-sm font-bold" style={{ color }}>
                                      {formatWeight(pr.value, unit)}
                                    </span>
                                    {isLatest && (
                                      <span
                                        className="text-[9px] px-1.5 py-0.5 rounded font-bold"
                                        style={{ backgroundColor: `${color}25`, color }}
                                      >
                                        PR
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-xs font-medium" style={{ color: 'var(--color-text-2)' }}>
                                    {format(new Date(pr.achieved_at), "d MMM yy", { locale: es })}
                                  </span>
                                </div>
                                {/* Progress bar: how far this was from current PR */}
                                {isLatest && recordsOfType.length > 1 && (
                                  <div className="mt-1">
                                    <div
                                      className="h-1 rounded-full overflow-hidden"
                                      style={{ backgroundColor: 'var(--color-border)' }}
                                    >
                                      <div
                                        className="h-full rounded-full"
                                        style={{
                                          width: '100%',
                                          backgroundColor: color,
                                        }}
                                      />
                                    </div>
                                    <p className="text-[9px] mt-0.5" style={{ color: 'var(--color-text-2)' }}>
                                      Récord actual
                                    </p>
                                  </div>
                                )}
                                {!isLatest && (
                                  <p className="text-[9px]" style={{ color: 'var(--color-text-2)' }}>
                                    -{formatWeight(recordsOfType[0].value - pr.value, unit)} vs PR
                                  </p>
                                )}
                              </div>
                              {/* Arrow indicator */}
                              <div className="flex-shrink-0">
                                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                                  <path d="M3 1L6 4L3 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-2)' }} />
                                </svg>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
              {personalRecords.length === 0 && (
                <p className="text-xs text-center py-4" style={{ color: 'var(--color-text-2)' }}>
                  Sin récords personales registrados
                </p>
              )}
            </div>
          </div>
        )}

        {/* Weight Trend Chart (F25 — proper recharts LineChart) */}
        {chartData.length >= 2 && (
          <div className="px-4 pb-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--color-text-2)' }}>
              Tendencia de peso
            </h2>
            <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-medium" style={{ color: 'var(--color-text-2)' }}>
                  {chartMetric === 'weight' ? 'Peso (kg)' : '1RM estimado (kg)'}
                </h3>
                <div className="flex gap-1 items-center">
                  <button
                    onClick={() => setShowTrend(!showTrend)}
                    className="px-2 py-1 rounded text-[10px] font-medium"
                    style={{
                      backgroundColor: showTrend ? 'var(--color-primary)' : 'var(--color-surface-2)',
                      color: showTrend ? '#000' : 'var(--color-text-2)',
                    }}
                    title="Mostrar/ocultar tendencia"
                  >
                    Tend
                  </button>
                  <button
                    onClick={() => setChartMetric('weight')}
                    className="px-2 py-1 rounded text-[10px] font-medium"
                    style={{
                      backgroundColor: chartMetric === 'weight' ? 'var(--color-primary)' : 'var(--color-surface-2)',
                      color: chartMetric === 'weight' ? '#000' : 'var(--color-text-2)',
                    }}
                  >
                    Peso
                  </button>
                  <button
                    onClick={() => setChartMetric('1rm')}
                    className="px-2 py-1 rounded text-[10px] font-medium"
                    style={{
                      backgroundColor: chartMetric === '1rm' ? 'var(--color-primary)' : 'var(--color-surface-2)',
                      color: chartMetric === '1rm' ? '#000' : 'var(--color-text-2)',
                    }}
                  >
                    1RM
                  </button>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-2)" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={d => format(new Date(d), 'd/M')}
                    tick={{ fontSize: 9, fill: 'var(--color-text-2)' }}
                    interval="preserveStartEnd"
                    tickCount={4}
                  />
                  <YAxis
                    tick={{ fontSize: 9, fill: 'var(--color-text-2)' }}
                    tickFormatter={v => `${v}kg`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '8px',
                      fontSize: 11,
                    }}
                    labelFormatter={d => format(new Date(d), "d 'de' MMM", { locale: es })}
                    formatter={(v: unknown) => [`${v} kg`, chartMetric === 'weight' ? 'Peso' : '1RM est.'] as [string, string]}
                  />
                  {maxWeight && maxWeight > 0 && (
                    <ReferenceLine
                      y={maxWeight}
                      stroke="var(--color-primary)"
                      strokeDasharray="3 3"
                      strokeOpacity={0.4}
                      label={{ value: `PR ${maxWeight}kg`, position: 'right', fontSize: 9, fill: 'var(--color-text-2)' }}
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey={chartMetric}
                    stroke="var(--color-primary)"
                    strokeWidth={2}
                    dot={{ r: 3, fill: 'var(--color-primary)' }}
                    activeDot={{ r: 5 }}
                  />
                  {showTrend && chartData.some(d => d.trend != null) && (
                    <Line
                      type="monotone"
                      dataKey="trend"
                      stroke="#f59e0b"
                      strokeWidth={1.5}
                      strokeDasharray="5 3"
                      dot={false}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
              {chartData.length > 0 && (
                <div className="flex justify-between items-center mt-1">
                  <span className="text-[9px]" style={{ color: 'var(--color-text-2)' }}>{format(new Date(chartData[0].date), 'd MMM', { locale: es })}</span>
                  {showTrend && chartData.length >= 2 && (() => {
                    const first = chartData[0].trend ?? chartData[0].weight;
                    const last = chartData[chartData.length - 1].trend ?? chartData[chartData.length - 1].weight;
                    const delta = last - first;
                    if (Math.abs(delta) < 0.5) return <span className="text-[9px] font-medium" style={{ color: '#6b7280' }}>→ estable</span>;
                    const sign = delta > 0 ? '+' : '';
                    return <span className="text-[9px] font-medium" style={{ color: delta > 0 ? '#22c55e' : '#ef4444' }}>{delta > 0 ? '↑' : '↓'} {sign}{delta.toFixed(1)}kg</span>;
                  })()}
                  <span className="text-[9px]" style={{ color: 'var(--color-text-2)' }}>{format(new Date(chartData[chartData.length - 1].date), 'd MMM', { locale: es })}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {chartData.length === 1 && (
          <div className="px-4 pb-4">
            <div className="p-4 rounded-xl text-center" style={{ backgroundColor: 'var(--color-surface)' }}>
              <p className="text-xs" style={{ color: 'var(--color-text-2)' }}>Solo 1 dato. Completa más workouts para ver la tendencia.</p>
            </div>
          </div>
        )}

        {/* Stats summary */}
        <div className="px-4 pb-4">
          <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs mb-1" style={{ color: 'var(--color-text-2)' }}>Workouts con este ejercicio</p>
                <p className="text-xl font-bold">{workoutCount}</p>
              </div>
              <div>
                <p className="text-xs mb-1" style={{ color: 'var(--color-text-2)' }}>Series registradas</p>
                <p className="text-xl font-bold">{history.length}</p>
              </div>
              <div>
                <p className="text-xs mb-1" style={{ color: 'var(--color-text-2)' }}>Volumen total</p>
                <p className="text-xl font-bold" style={{ color: 'var(--color-primary)' }}>
                  {stats && stats.totalVolume > 0 ? `${(stats.totalVolume / 1000).toFixed(1)}k` : 0}
                </p>
              </div>
              <div>
                <p className="text-xs mb-1" style={{ color: 'var(--color-text-2)' }}>Última vez</p>
                <p className="text-xl font-bold">
                  {history[0]?.workout_date
                    ? format(new Date(history[0].workout_date), "d MMM", { locale: es })
                    : 'Nunca'}
                </p>
              </div>
            </div>
            {/* TUT row (F42) */}
            <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
              <p className="text-xs mb-1" style={{ color: 'var(--color-text-2)' }}>Tiempo bajo tensión estimado</p>
              <p className="text-xl font-bold" style={{ color: 'var(--color-success)' }}>
                {(() => {
                  const totalTUT = history.reduce((acc: number, s: WorkoutSet) => acc + (s.reps || 0) * 3, 0);
                  const minutes = Math.floor(totalTUT / 60);
                  const seconds = totalTUT % 60;
                  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
                })()}
              </p>
            </div>
          </div>
        </div>

        {/* Smart weight suggestion based on RPE (F21) */}
        {suggestedWeight && (
          <div className="px-4 pb-4">
            <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb size={14} style={{ color: 'var(--color-primary)' }} />
                <h3 className="text-sm font-semibold">Sugerencia de peso</h3>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold" style={{ color: 'var(--color-primary)' }}>
                    {formatWeight(suggestedWeight.weight, unit)}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--color-text-2)' }}>
                    {suggestedWeight.reason}
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (!id || !activeWorkout) {
                      navigate('/workouts');
                      return;
                    }
                    const db = getDb();
                    if (db) {
                      const lastSets = getLastExerciseSets(db, id);
                      const lastNotes = getLastExerciseNotes(db, id);
                      addExerciseToWorkout(id, exercise.name, undefined, lastSets, lastNotes);
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ backgroundColor: 'var(--color-primary)', color: '#000' }}
                >
                  Añadir
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 1RM Calculator (F52) */}
        <div className="px-4 pb-4">
          <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
            <div className="flex items-center gap-2 mb-3">
              <Calculator size={14} style={{ color: 'var(--color-primary)' }} />
              <h3 className="text-sm font-semibold">Calculadora 1RM</h3>
            </div>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="text-[10px] mb-1 block" style={{ color: 'var(--color-text-2)' }}>Peso (kg)</label>
                <input
                  type="number"
                  id="calc1rm-weight"
                  className="w-full px-3 py-2 rounded-lg text-sm font-mono"
                  style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                  placeholder="0"
                  min="0"
                  step="0.5"
                />
              </div>
              <div className="flex-1">
                <label className="text-[10px] mb-1 block" style={{ color: 'var(--color-text-2)' }}>Reps</label>
                <input
                  type="number"
                  id="calc1rm-reps"
                  className="w-full px-3 py-2 rounded-lg text-sm font-mono"
                  style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                  placeholder="0"
                  min="1"
                  max="30"
                />
              </div>
              <button
                onClick={() => {
                  const weightInput = document.getElementById('calc1rm-weight') as HTMLInputElement;
                  const repsInput = document.getElementById('calc1rm-reps') as HTMLInputElement;
                  const weight = parseFloat(weightInput.value);
                  const reps = parseInt(repsInput.value);
                  if (weight > 0 && reps > 0) {
                    const oneRM = Math.round(weight * (1 + reps / 30) * 10) / 10;
                    const resultEl = document.getElementById('calc1rm-result');
                    if (resultEl) resultEl.textContent = `${oneRM} kg`;
                  }
                }}
                className="px-3 py-2 rounded-lg text-xs font-semibold"
                style={{ backgroundColor: 'var(--color-primary)', color: '#000' }}
              >
                Calcular
              </button>
            </div>
            <div className="mt-2 pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
              <span className="text-[10px]" style={{ color: 'var(--color-text-2)' }}>1RM estimado: </span>
              <span id="calc1rm-result" className="text-sm font-bold" style={{ color: 'var(--color-primary)' }}>—</span>
              <span className="text-[10px] ml-1" style={{ color: 'var(--color-text-2)' }}>(Epley)</span>
            </div>
          </div>
        </div>

        {/* Exercise variations / similar exercises (F12) */}
        {variations.length > 0 && (
          <div className="px-4 pb-4">
            <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
              <div className="flex items-center gap-2 mb-3">
                <Shuffle size={14} style={{ color: 'var(--color-primary)' }} />
                <h3 className="text-sm font-semibold">Variaciones</h3>
              </div>
              <div className="space-y-2">
                {variations.map(v => (
                  <div
                    key={v.id}
                    className="flex items-center gap-2 p-2 rounded-lg"
                    style={{ backgroundColor: 'var(--color-surface-2)' }}
                  >
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: equipmentColors[v.equipment] || equipmentColors.other }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{v.name}</p>
                      <p className="text-[10px]" style={{ color: 'var(--color-text-2)' }}>
                        {EQUIPMENT_LABELS[v.equipment] || v.equipment}
                      </p>
                    </div>
                    {activeWorkout ? (
                      <>
                        {/* F246 — Swap: replace current exercise in workout with this variant */}
                        {activeWorkout.exercises.some(e => e.exercise_id === exercise.id) && (
                          <button
                            onClick={() => {
                              swapExerciseInWorkout(exercise.id, v.id, v.name);
                              toastStore.success(`Intercambiado a ${v.name}`);
                            }}
                            className="px-2 py-1 rounded-lg text-xs font-medium flex-shrink-0"
                            style={{ backgroundColor: 'rgba(139,92,246,0.15)', color: '#8b5cf6' }}
                            title="Reemplazar en workout"
                          >
                            <Shuffle size={12} className="inline mr-0.5" />
                            Intercambiar
                          </button>
                        )}
                        {/* Only show add if exercise is NOT already in workout */}
                        {!activeWorkout.exercises.some(e => e.exercise_id === v.id) && (
                          <button
                            onClick={() => {
                              const db = getDb();
                              if (db) {
                                const lastSets = getLastExerciseSets(db, v.id);
                                const lastNotes = getLastExerciseNotes(db, v.id);
                                addExerciseToWorkout(v.id, v.name, undefined, lastSets, lastNotes);
                              }
                            }}
                            className="px-2 py-1 rounded-lg text-xs font-medium flex-shrink-0"
                            style={{ backgroundColor: 'var(--color-primary)', color: '#000' }}
                          >
                            + Añadir
                          </button>
                        )}
                      </>
                    ) : (
                      <button
                        onClick={() => {
                          startWorkout();
                          setTimeout(() => {
                            const db = getDb();
                            if (db) {
                              const lastSets = getLastExerciseSets(db, v.id);
                              const lastNotes = getLastExerciseNotes(db, v.id);
                              addExerciseToWorkout(v.id, v.name, undefined, lastSets, lastNotes);
                              toastStore.success('¡Workout iniciado!');
                              navigate('/workouts');
                            }
                          }, 50);
                        }}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold flex-shrink-0"
                        style={{ backgroundColor: 'var(--color-primary)', color: '#000' }}
                        title="Iniciar workout con esta variación"
                      >
                        <Zap size={11} className="inline mr-0.5" />
                        Iniciar
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* History by workout */}
        <div className="px-4 pb-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--color-text-2)' }}>
            Historial reciente
          </h2>
          {historyByDate.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2" style={{ backgroundColor: 'var(--color-surface)', borderRadius: '12px' }}>
              <p className="text-sm" style={{ color: 'var(--color-text-2)' }}>Sin historial todavía</p>
              <p className="text-xs" style={{ color: 'var(--color-text-2)' }}>Completa un workout con este ejercicio</p>
            </div>
          ) : (
            <div className="space-y-3">
              {historyByDate.map(group => (
                <div key={group.workout_id || group.date} className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--color-surface)' }}>
                  {/* F135 — Workout name + date header */}
                  <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
                    <div className="flex items-center gap-2 min-w-0">
                      <button
                        onClick={() => navigate(`/workout/${group.workout_id}`)}
                        className="text-xs font-medium truncate max-w-[160px]"
                        style={{ color: 'var(--color-primary)' }}
                        title={group.workout_name || ' Workout'}
                      >
                        {group.workout_name || 'Workout'}
                      </button>
                      <span className="text-xs" style={{ color: 'var(--color-text-2)' }}>
                        {format(new Date(group.date), "d MMM", { locale: es })}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {group.workout_tags && group.workout_tags.length > 0 && (
                        <div className="flex gap-1">
                          {group.workout_tags.slice(0, 2).map(tag => (
                            <span key={tag} className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ backgroundColor: 'var(--color-primary)', color: '#000' }}>
                              {tag}
                            </span>
                          ))}
                          {group.workout_tags.length > 2 && (
                            <span className="text-[10px]" style={{ color: 'var(--color-text-2)' }}>+{group.workout_tags.length - 2}</span>
                          )}
                        </div>
                      )}
                      <span className="text-xs" style={{ color: 'var(--color-text-2)' }}>
                        {group.sets.length} series
                      </span>
                    </div>
                  </div>
                  <div className="p-2 space-y-1">
                    {group.sets.map((set, idx) => (
                      <div key={set.id || idx} className="flex items-center gap-3 text-sm py-1 px-1">
                        <span className="w-5 text-center text-xs font-mono" style={{ color: 'var(--color-text-2)' }}>
                          {set.set_number}
                        </span>
                        {/* F135 — Set type badge with improved colors */}
                        <span
                          className="px-2 py-0.5 rounded text-xs font-bold"
                          style={{
                            backgroundColor: `${SET_TYPE_COLORS_HISTORY[set.set_type] || SET_TYPE_COLORS_HISTORY.normal}20`,
                            color: SET_TYPE_COLORS_HISTORY[set.set_type] || SET_TYPE_COLORS_HISTORY.normal,
                          }}
                        >
                          {set.set_type === 'warmup' ? 'W' : set.set_type === 'drop' ? 'D' : set.set_type === 'failure' ? 'F' : set.set_type === 'superset' ? 'S' : ''}
                        </span>
                        <span className="font-mono font-bold" style={{ color: 'var(--color-primary)' }}>
                          {set.weight > 0 ? formatWeight(set.weight, unit) : '—'}
                        </span>
                        <span style={{ color: 'var(--color-text-2)' }}>×</span>
                        <span className="font-mono">{set.reps > 0 ? set.reps : '—'}</span>
                        {set.rpe && (
                          <span className="ml-1 text-xs" style={{ color: 'var(--color-text-2)' }}>
                            RPE {set.rpe}
                          </span>
                        )}
                        {/* F210 — Set notes indicator in history */}
                        {set.notes && (
                          <span
                            className={set.rpe ? 'ml-1' : 'ml-auto'}
                            style={{ color: 'var(--color-primary)' }}
                            title={set.notes}
                          >
                            <MessageSquare size={10} />
                            <span className="text-xs truncate max-w-[80px] ml-0.5">{set.notes}</span>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add to workout shortcut */}
        <div className="px-4 pb-4">
          <button
            onClick={() => {
              if (!exercise || !id) return;
              if (!activeWorkout) {
                // F229 — Quick-start: no confirmation, just start and add exercise
                startWorkout(exercise.name);
                const db = getDb();
                if (db) {
                  const lastSets = getLastExerciseSets(db, id);
                  const lastNotes = getLastExerciseNotes(db, id);
                  addExerciseToWorkout(id, exercise.name, undefined, lastSets, lastNotes);
                  setQuickStarted(true);
                  setTimeout(() => {
                    setQuickStarted(false);
                    navigate('/workouts');
                  }, 1200);
                } else {
                  navigate('/workouts');
                }
                return;
              }
              const db = getDb();
              if (db) {
                const lastSets = getLastExerciseSets(db, id);
                const lastNotes = getLastExerciseNotes(db, id);
                addExerciseToWorkout(id, exercise.name, undefined, lastSets, lastNotes);
                setAddedFeedback(true);
                setTimeout(() => setAddedFeedback(false), 1500);
              }
            }}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold"
            style={{
              backgroundColor: addedFeedback ? 'var(--color-success)' : quickStarted ? 'var(--color-success)' : 'var(--color-primary)',
              color: addedFeedback || quickStarted ? '#fff' : '#000',
              transition: 'background-color 0.3s ease',
            }}
          >
            <Zap size={18} />
            {quickStarted ? '¡Workout started!' : addedFeedback ? '¡Añadido!' : activeWorkout ? 'Añadir a workout' : 'Iniciar workout'}
          </button>
        </div>
      </div>

      {/* F123 — Add to routine modal */}
      {showAddToRoutine && exercise && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}>
          {/* Modal header */}
          <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
            <h2 className="text-lg font-bold">Añadir a rutina</h2>
            <button
              onClick={() => setShowAddToRoutine(false)}
              className="p-2 rounded-lg"
              style={{ backgroundColor: 'var(--color-surface-2)' }}
            >
              <X size={20} />
            </button>
          </div>

          {/* Routine selector */}
          <div className="p-4 space-y-3">
            <p className="text-sm font-medium" style={{ color: 'var(--color-text-2)' }}>
              Selecciona una rutina:
            </p>
            {routineList.length === 0 ? (
              <p className="text-sm text-center py-4" style={{ color: 'var(--color-text-2)' }}>
                No tienes rutinas. Créala primero en la página de Rutinas.
              </p>
            ) : (
              <div className="space-y-1">
                {routineList.map(r => (
                  <button
                    key={r.id}
                    onClick={() => setSelectedRoutineId(r.id)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg text-left"
                    style={{
                      backgroundColor: selectedRoutineId === r.id ? 'var(--color-primary)' : 'var(--color-surface-2)',
                      color: selectedRoutineId === r.id ? '#000' : 'var(--color-text)',
                    }}
                  >
                    <div className="w-3 h-3 rounded-full" style={{
                      backgroundColor: selectedRoutineId === r.id ? '#000' : 'var(--color-primary)',
                      opacity: selectedRoutineId === r.id ? 1 : 0.6,
                    }} />
                    <span className="text-sm font-medium">{r.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Sets/Reps/Weight config — only show when routine selected */}
          {selectedRoutineId && (
            <div className="px-4 pb-2 space-y-3">
              <p className="text-sm font-medium" style={{ color: 'var(--color-text-2)' }}>
                Configurar series y peso:
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--color-text-2)' }}>Series</label>
                  <input
                    type="number"
                    value={routineSets}
                    onChange={e => setRoutineSets(parseInt(e.target.value) || 1)}
                    min={1}
                    max={20}
                    className="w-full rounded-lg px-3 py-2 text-sm"
                    style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                  />
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--color-text-2)' }}>Reps</label>
                  <input
                    type="number"
                    value={routineReps}
                    onChange={e => setRoutineReps(e.target.value)}
                    min={1}
                    max={100}
                    className="w-full rounded-lg px-3 py-2 text-sm"
                    style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                  />
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--color-text-2)' }}>Peso ({unit})</label>
                  <input
                    type="number"
                    value={routineWeight}
                    onChange={e => setRoutineWeight(e.target.value)}
                    placeholder="—"
                    step="0.5"
                    className="w-full rounded-lg px-3 py-2 text-sm"
                    style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Confirm button */}
          <div className="mt-auto p-4 border-t" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
            <button
              onClick={() => {
                if (!selectedRoutineId || !exercise) return;
                const db = getDb();
                if (!db) return;
                // Check if already in routine
                const existing = getRoutineExercises(db, selectedRoutineId);
                if (existing.some((re: RoutineExercise) => re.exercise_id === exercise.id)) {
                  setShowAddToRoutine(false);
                  return;
                }
                saveRoutineExercise(db, {
                  id: generateId(),
                  routine_id: selectedRoutineId,
                  exercise_id: exercise.id,
                  order_index: existing.length,
                  target_sets: routineSets,
                  target_reps: routineReps,
                  target_weight: routineWeight ? parseFloat(routineWeight) : null,
                  target_rpe: null,
                  rest_seconds: 90,
                });
                setShowAddToRoutine(false);
              }}
              disabled={!selectedRoutineId}
              className="w-full py-3 rounded-xl text-sm font-bold disabled:opacity-40"
              style={{ backgroundColor: 'var(--color-primary)', color: '#000' }}
            >
              Añadir a {routineList.find(r => r.id === selectedRoutineId)?.name ?? 'rutina'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
