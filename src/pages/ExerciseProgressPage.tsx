/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, TrendingUp, Award, Calendar, Trophy, Target, Star, Plus, MessageSquare, Timer, AlertTriangle, Copy, Check } from 'lucide-react';
import { getDb } from '../database/init';
import EmptyState from '../components/ui/EmptyState';
import { getExerciseById, getExerciseSetsHistory, getEstimated1RM, getPersonalRecords, getExerciseTargetRPE, getMostRecentRoutineWorkoutForExercise, getLastPerformedDates, getExerciseSetsHistoryWithWorkout, calculate1RM, getExerciseFrequencyBatch, getExerciseWorkoutsThisMonth, getExerciseRestTimeAvg, getMuscleFrequencyForExercise } from '../database/queries';
import { useExerciseStore } from '../store/exerciseStore';
import { useWorkoutStore } from '../store/workoutStore';
import { format } from 'date-fns';
import { formatLastPerformed, getLastPerformedColor } from '../utils/dateUtils';
import { es } from 'date-fns/locale';
import { LineChart, Line, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis } from 'recharts';
import type { Exercise, WorkoutSet, PersonalRecord, SetType } from '../types';

type HistorySet = WorkoutSet & { workout_date: string; workout_id: string; workout_name: string; exercise_notes: string };

const SET_TYPE_COLORS_HISTORY: Record<SetType, string> = {
  normal: 'var(--color-text-2)',
  warmup: '#f59e0b',
  drop: '#8b5cf6',
  failure: '#ef4444',
  superset: '#10b981',
};

// F247 — Time Under Tension: ~3s per rep (eccentric + concentric)
const TUT_TEMPO_SECS = 3;

// F176 — Chart data entry with 1RM, trend line, and PR markers
type ChartEntry = {
  date: string;
  weight: number;
  reps: number;
  volume: number;
  avgRpe: number;
  estimated1rm: number;
  trend?: number;
  isPr?: boolean;
  prType?: string;
};

// F176 — Intermediate: per-date accumulator before trend/pr computation
type DateAccum = ChartEntry & { rpeCount: number; rpeSum: number };

// F176 — Enhanced: compute estimated1rm per date and trend line for weight chart
function buildChartData(sets: HistorySet[]): ChartEntry[] {
  const byDate: Record<string, DateAccum> = {};
  sets.forEach(s => {
    if (!s.weight || s.weight <= 0) return;
    const d = s.workout_date?.split('T')[0] || '';
    if (!byDate[d]) {
      byDate[d] = { date: d, weight: 0, reps: 0, volume: 0, avgRpe: 0, rpeCount: 0, rpeSum: 0, estimated1rm: 0 };
    }
    // Track max weight and total reps/volume for that day
    if (s.weight > byDate[d].weight) {
      byDate[d].weight = s.weight;
      // Estimate 1RM from the heaviest set of the day
      byDate[d].estimated1rm = Math.round(calculate1RM(s.weight, s.reps) * 10) / 10;
    }
    byDate[d].reps += s.reps;
    byDate[d].volume += s.weight * s.reps;
    // RPE averaging per workout
    if (s.rpe != null) {
      byDate[d].rpeSum += s.rpe;
      byDate[d].rpeCount++;
    }
  });
  const sorted = (Object.values(byDate) as DateAccum[]).map(entry => ({
    date: entry.date,
    weight: entry.weight,
    reps: entry.reps,
    volume: entry.volume,
    avgRpe: entry.rpeCount > 0 ? Math.round((entry.rpeSum / entry.rpeCount) * 10) / 10 : 0,
    estimated1rm: entry.estimated1rm,
  })).sort((a, b) => a.date.localeCompare(b.date)) as ChartEntry[];

  // F176 — Compute linear regression trend for estimated1rm (weight chart)
  if (sorted.length < 2) return sorted;
  const n = sorted.length;
  const xMean = (n - 1) / 2;
  const yMean = sorted.reduce((s, d) => s + d.estimated1rm, 0) / n;
  let num = 0;
  let den = 0;
  sorted.forEach((d, i) => {
    num += (i - xMean) * (d.estimated1rm - yMean);
    den += (i - xMean) ** 2;
  });
  if (den > 0) {
    const slope = num / den;
    const intercept = yMean - slope * xMean;
    sorted.forEach((d, i) => {
      d.trend = Math.round((slope * i + intercept) * 10) / 10;
    });
  }

  // F176 — Detect PR dates: mark first time each estimated1rm high-water is set
  let maxE1rm = 0;
  let maxWeight = 0;
  sorted.forEach(d => {
    if (d.estimated1rm > maxE1rm) {
      maxE1rm = d.estimated1rm;
      d.isPr = true;
      d.prType = 'e1rm';
    } else if (d.weight > maxWeight) {
      maxWeight = d.weight;
      d.isPr = true;
      d.prType = 'weight';
    }
  });

  return sorted;
}


function findPRs(sets: HistorySet[]) {
  let maxWeight = 0;
  let maxWeightDate = '';
  let maxVolume = 0;
  let maxVolumeDate = '';
  let maxReps = 0;
  let maxRepsDate = '';

  const byDate: Record<string, { weight: number; volume: number; reps: number }> = {};
  sets.forEach(s => {
    if (!s.weight || s.weight <= 0) return;
    const d = s.workout_date?.split('T')[0] || '';
    if (!byDate[d]) byDate[d] = { weight: 0, volume: 0, reps: 0 };
    if (s.weight > byDate[d].weight) byDate[d].weight = s.weight;
    byDate[d].volume += s.weight * s.reps;
    if (s.reps > byDate[d].reps) byDate[d].reps = s.reps;
  });

  Object.entries(byDate).forEach(([date, vals]) => {
    if (vals.weight > maxWeight) { maxWeight = vals.weight; maxWeightDate = date; }
    if (vals.volume > maxVolume) { maxVolume = vals.volume; maxVolumeDate = date; }
    if (vals.reps > maxReps) { maxReps = vals.reps; maxRepsDate = date; }
  });

  return { maxWeight, maxWeightDate, maxVolume, maxVolumeDate, maxReps, maxRepsDate };
}

// F57 — Group sets by ISO week, count sets per week for the last 12 weeks
function buildFrequencyData(sets: HistorySet[]) {
  const now = new Date();
  const weeks: { label: string; weekStart: string; sets: number; volume: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i * 7);
    const day = d.getDay(); // 0=Sun
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const label = format(monday, 'd MMM');
    weeks.push({ label, weekStart: format(monday, 'yyyy-MM-dd'), sets: 0, volume: 0 });
  }
  sets.forEach(s => {
    if (!s.workout_date) return;
    const d = new Date(s.workout_date);
    weeks.forEach(w => {
      const ws = new Date(w.weekStart);
      const we = new Date(ws);
      we.setDate(ws.getDate() + 7);
      if (d >= ws && d < we) {
        w.sets += 1;
        w.volume += (s.weight || 0) * (s.reps || 0);
      }
    });
  });
  return weeks;
}

export default function ExerciseProgressPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { favorites, toggleFavorite } = useExerciseStore();
  const { activeWorkout, addExerciseToWorkout, addSet } = useWorkoutStore();
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [history, setHistory] = useState<HistorySet[]>([]);
  const [chartData, setChartData] = useState<ChartEntry[]>([]);
  const [prs, setPrs] = useState<ReturnType<typeof findPRs>>({ maxWeight: 0, maxWeightDate: '', maxVolume: 0, maxVolumeDate: '', maxReps: 0, maxRepsDate: '' });
  const [estimated1RM, setEstimated1RM] = useState<number>(0);
  const [personalRecords, setPersonalRecords] = useState<PersonalRecord[]>([]);
  const [metric, setMetric] = useState<'weight' | 'volume' | 'rpe'>('weight');
  const [freqData, setFreqData] = useState<ReturnType<typeof buildFrequencyData>>([]);
  // F77 — Target RPE from routine context
  const [targetRpe, setTargetRpe] = useState<number | null>(null);
  // F88 — Quick-add feedback
  const [addedFeedback, setAddedFeedback] = useState(false);
  // F104 — Last performed date for this exercise
  const [lastPerformed, setLastPerformed] = useState<string | null>(null);
  // F198 — Workout frequency in last 30 days for this exercise
  const [frequencyCount, setFrequencyCount] = useState<number>(0);
  // F204 — Number of workouts this month for this exercise
  const [workoutsThisMonth, setWorkoutsThisMonth] = useState<number>(0);
  // F207 — PR prediction: weight × reps needed to beat current maxWeight PR
  const [prPrediction, setPrPrediction] = useState<{ weight: number; reps: number } | null>(null);
  // F208 — Average rest time for this exercise (last 30 days)
  const [restTimeAvg, setRestTimeAvg] = useState<number>(0);
  // F223 — Weak point indicator: computed from gap between latest E1RM and 30-day rolling average
  const [weakPoint, setWeakPoint] = useState<{ dropPercent: number; latestE1RM: number; avgE1RM: number } | null>(null);
  // F225 — Previous workout weight per exercise: Map<workoutId, weight> for the "prev" chip in history
  const [previousWeightMap, setPreviousWeightMap] = useState<Record<string, number>>({});
  // F231 — Total volume (kg) of the most recent workout for this exercise
  const [lastWorkoutVolume, setLastWorkoutVolume] = useState<number>(0);
  // F248 — Copy set to clipboard
  const [copiedSetId, setCopiedSetId] = useState<string | null>(null);
  // F305 — Muscle group co-occurrence radar data
  const [muscleRadarData, setMuscleRadarData] = useState<{ muscle: string; count: number; percent: number }[]>([]);

  // F248 — Copy set weight×reps to clipboard
  const handleCopySet = (weight: number, reps: number, setId: string) => {
    navigator.clipboard.writeText(`${weight}kg × ${reps} reps`).then(() => {
      setCopiedSetId(setId);
      setTimeout(() => setCopiedSetId(null), 1500);
    });
  };

  // F88 — Quick-add: add last recorded set to active workout
  const handleQuickAddToWorkout = () => {
    if (!id || !exercise) return;
    if (!activeWorkout) {
      navigate('/workouts');
      return;
    }
    const existing = activeWorkout.exercises.find(e => e.exercise_id === id);
    if (existing) {
      addSet(id);
    } else {
      const db = getDb();
      if (!db) return;
      const lastSets = getExerciseSetsHistory(db, id, 1);
      const lastSet = lastSets.length > 0 ? lastSets[0] : null;
      addExerciseToWorkout(
        id,
        exercise.name,
        1,
        lastSet ? [{ weight: lastSet.weight, reps: lastSet.reps, set_type: (lastSet.set_type || 'normal') as SetType }] : undefined,
        ''
      );
    }
    setAddedFeedback(true);
    setTimeout(() => setAddedFeedback(false), 2000);
  };

  useEffect(() => {
    if (!id) return;
    const db = getDb();
    if (!db) return;
    const ex = getExerciseById(db, id);
    if (!ex) return;
    setExercise(ex);

    // F134 — Single enriched query: history + chart data from the same dataset
    const sets = getExerciseSetsHistoryWithWorkout(db, id, 100) as HistorySet[];
    setHistory(sets);

    const data = buildChartData(sets);
    setChartData(data);
    setFreqData(buildFrequencyData(sets));

    setPrs(findPRs(sets));
    setEstimated1RM(getEstimated1RM(db, id));

    // Load historical PR records from the personal_records table (F4)
    const prHistory = getPersonalRecords(db, id);
    setPersonalRecords(prHistory);

    // F77 — Load target RPE from most recent routine workout for this exercise
    const recentRoutineId = getMostRecentRoutineWorkoutForExercise(db, id);
    if (recentRoutineId) {
      const rpe = getExerciseTargetRPE(db, recentRoutineId, id);
      if (rpe != null) setTargetRpe(rpe);
    }

    // F104 — Load last performed date
    const lastDates = getLastPerformedDates(db);
    if (lastDates[id]) setLastPerformed(lastDates[id]);

    // F198 — Load workout frequency for this exercise in last 30 days
    const freqMap = getExerciseFrequencyBatch(db, 30);
    if (id && freqMap.has(id)) setFrequencyCount(freqMap.get(id)!);

    // F204 — Load number of workouts this month for this exercise
    if (id) setWorkoutsThisMonth(getExerciseWorkoutsThisMonth(db, id));

    // F208 — Load average rest time for this exercise (last 30 days)
    if (id) setRestTimeAvg(getExerciseRestTimeAvg(db, id));

    // F305 — Muscle group co-occurrence: which muscle groups are hit on days you train this exercise
    if (id) {
      const muscleData = getMuscleFrequencyForExercise(db, id, 12);
      const allMuscles = muscleData.flatMap(d => d.muscleGroups);
      const totalWorkouts = muscleData.length;
      if (totalWorkouts > 0) {
        const muscleCounts: Record<string, number> = {};
        allMuscles.forEach(m => { muscleCounts[m] = (muscleCounts[m] || 0) + 1; });
        const radarData = Object.entries(muscleCounts)
          .map(([muscle, count]) => ({ muscle, count, percent: Math.round((count / totalWorkouts) * 100) }))
          .sort((a, b) => b.count - a.count);
        setMuscleRadarData(radarData);
      }
    }

    // F207 — Compute PR prediction: find weight × reps combo that would beat current maxWeight PR
    const bestSet = sets.reduce<{ weight: number; reps: number } | null>((best, s) => {
      if (!s.weight || s.weight <= 0) return best;
      if (!best || s.weight * s.reps > best.weight * best.reps) return { weight: s.weight, reps: s.reps };
      return best;
    }, null);
    if (prHistory.length > 0 && bestSet) {
      const prRecord = prHistory.find(pr => pr.type === 'max_weight');
      if (prRecord) {
        // Invert Epley: weight = (E1RM * 30 - E1RM * reps) / (reps + 30)
        // Solve for weight that gives E1RM = prRecord.value at given reps
        const reps = bestSet.reps > 0 ? bestSet.reps : 5;
        const required = (prRecord.value * 30 - prRecord.value * reps) / (reps + 30);
        if (required > 0) setPrPrediction({ weight: Math.round(required * 10) / 10, reps });
      }
    }

    // F223 — Weak point indicator: if latest E1RM is significantly below the 30-day rolling average, flag it
    if (data.length >= 3) {
      const recent = data.slice(-7); // last 7 workout sessions (~30 days)
      const avgE1RM = recent.reduce((s, d) => s + d.estimated1rm, 0) / recent.length;
      const latestE1RM = data[data.length - 1].estimated1rm;
      if (avgE1RM > 0 && latestE1RM < avgE1RM * 0.9) {
        const dropPercent = Math.round((1 - latestE1RM / avgE1RM) * 100);
        setWeakPoint({ dropPercent, latestE1RM, avgE1RM });
      }
    }

    // F225 — Compute previous weight map: for each workout_id in history, find the weight
    // from the workout BEFORE it (chronologically). We need per-workout weight lookups.
    // Build a map of workoutId -> max weight used in that workout, then walk history
    // chronologically to find the "previous" workout's weight for each entry.
    if (sets.length > 0) {
      // Get max weight per workout across all sets (includes current exercise)
      const workoutMaxWeight: Record<string, number> = {};
      for (const s of sets) {
        if (s.workout_id && s.weight > 0) {
          if (!workoutMaxWeight[s.workout_id] || s.weight > workoutMaxWeight[s.workout_id]) {
            workoutMaxWeight[s.workout_id] = s.weight;
          }
        }
      }

      // Sort workouts chronologically
      const uniqueWorkouts = [...new Set(sets.map(s => s.workout_id).filter(Boolean))] as string[];
      uniqueWorkouts.sort((a, b) => a.localeCompare(b));

      // For each workout, find the previous workout's weight (for this exercise)
      const prevWeight: Record<string, number> = {};
      for (let i = 0; i < uniqueWorkouts.length; i++) {
        if (i > 0) {
          const prevWorkoutId = uniqueWorkouts[i - 1];
          if (prevWorkoutId in workoutMaxWeight) {
            prevWeight[uniqueWorkouts[i]] = workoutMaxWeight[prevWorkoutId];
          }
        }
      }
      setPreviousWeightMap(prevWeight);
    }

    // F231 — Compute total volume of the most recent workout for this exercise
    if (sets.length > 0) {
      // Group sets by workout_id, find the most recent by workout_date
      const volumeByWorkout: Record<string, number> = {};
      const workoutDates: Record<string, string> = {};
      for (const s of sets) {
        if (s.workout_id && s.weight > 0) {
          volumeByWorkout[s.workout_id] = (volumeByWorkout[s.workout_id] || 0) + s.weight * s.reps;
          if (s.workout_date && (!workoutDates[s.workout_id] || s.workout_date > workoutDates[s.workout_id])) {
            workoutDates[s.workout_id] = s.workout_date;
          }
        }
      }
      // Find most recent workout
      const sortedWorkouts = Object.keys(volumeByWorkout).sort((a, b) =>
        (workoutDates[b] || '').localeCompare(workoutDates[a] || '')
      );
      if (sortedWorkouts.length > 0) {
        setLastWorkoutVolume(Math.round(volumeByWorkout[sortedWorkouts[0]]));
      }
    }
  }, [id]);

  if (!exercise) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg" style={{ backgroundColor: 'var(--color-surface)' }}>
            <ArrowLeft size={20} />
          </button>
          <span>Cargando...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b flex items-center gap-3" style={{ borderColor: 'var(--color-border)' }}>
        <button onClick={() => navigate(-1)} className="p-2 rounded-lg" style={{ backgroundColor: 'var(--color-surface)' }}>
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold truncate">{exercise.name}</h1>
            {/* F104 — "Last performed" chip in header */}
            {lastPerformed && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0"
                style={{ backgroundColor: `${getLastPerformedColor(lastPerformed)}20`, color: getLastPerformedColor(lastPerformed) }}
                title={`Último entreno: ${lastPerformed ? format(new Date(lastPerformed), 'dd MMM yyyy', { locale: es }) : '—'}`}
              >
                {formatLastPerformed(lastPerformed)}
              </span>
            )}
            {/* F198 — "X veces en los últimos 30 días" frequency badge */}
            {frequencyCount > 0 && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0"
                style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text-2)' }}
                title={`Entrenado ${frequencyCount} veces en los últimos 30 días`}
              >
                {frequencyCount}×30d
              </span>
            )}
            {/* F231 — Last workout total volume chip */}
            {lastWorkoutVolume > 0 && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0"
                style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text-2)' }}
                title={`Volumen del último workout: ${lastWorkoutVolume.toLocaleString()} kg`}
              >
                Vol: {lastWorkoutVolume.toLocaleString()} kg
              </span>
            )}
          </div>
          <p className="text-xs capitalize" style={{ color: 'var(--color-text-2)' }}>
            {exercise.muscle_group?.replace('_', ' ')}
          </p>
        </div>
        <button
          onClick={() => { if (id) toggleFavorite(id); }}
          className="p-2 rounded-lg"
          style={{ backgroundColor: 'var(--color-surface)' }}
        >
          <Star
            size={20}
            className={favorites.includes(id || '') ? 'text-[var(--color-primary)] fill-[var(--color-primary)]' : 'text-[var(--color-text-2)]'}
          />
        </button>
        {/* F88 — Quick-add to active workout */}
        <button
          onClick={handleQuickAddToWorkout}
          className="p-2 rounded-lg flex items-center gap-1.5"
          style={{
            backgroundColor: addedFeedback ? 'var(--color-success)' : activeWorkout ? 'var(--color-primary)' : 'var(--color-surface-2)',
            color: addedFeedback ? '#fff' : activeWorkout ? '#000' : 'var(--color-text-2)',
          }}
          title={activeWorkout ? 'Añadir al workout activo' : 'No hay workout activo — ve a Workouts para empezar uno'}
        >
          <Plus size={18} />
          <span className="text-xs font-semibold">{addedFeedback ? '¡Añadido!' : 'Añadir'}</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* PR Cards */}
        {prs.maxWeight > 0 && (
          <div className="grid grid-cols-4 gap-2">
            <div className="p-3 rounded-xl text-center" style={{ backgroundColor: 'var(--color-surface)' }}>
              <Award size={14} className="mx-auto mb-1" style={{ color: 'var(--color-primary)' }} />
              <p className="text-lg font-bold">{prs.maxWeight} kg</p>
              <p className="text-[10px]" style={{ color: 'var(--color-text-2)' }}>Peso máx.</p>
            </div>
            <div className="p-3 rounded-xl text-center" style={{ backgroundColor: 'var(--color-surface)' }}>
              <Trophy size={14} className="mx-auto mb-1" style={{ color: 'var(--color-primary)' }} />
              <p className="text-lg font-bold">{estimated1RM > 0 ? `${estimated1RM} kg` : '—'}</p>
              <p className="text-[10px]" style={{ color: 'var(--color-text-2)' }}>1RM est.</p>
            </div>
            <div className="p-3 rounded-xl text-center" style={{ backgroundColor: 'var(--color-surface)' }}>
              <TrendingUp size={14} className="mx-auto mb-1" style={{ color: 'var(--color-primary)' }} />
              <p className="text-lg font-bold">{(prs.maxVolume / 1000).toFixed(1)}k</p>
              <p className="text-[10px]" style={{ color: 'var(--color-text-2)' }}>Volumen máx.</p>
            </div>
            <div className="p-3 rounded-xl text-center" style={{ backgroundColor: 'var(--color-surface)' }}>
              <Calendar size={14} className="mx-auto mb-1" style={{ color: 'var(--color-primary)' }} />
              <p className="text-lg font-bold">{prs.maxReps}</p>
              <p className="text-[10px]" style={{ color: 'var(--color-text-2)' }}>Reps máx.</p>
            </div>
          </div>
        )}

        {/* F204 — Performance insights: trend direction, monthly volume, 30-day avg */}
        {chartData.length >= 2 && (
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
            <TrendingUp size={16} style={{ color: 'var(--color-primary)' }} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {/* Trend direction */}
                {chartData.length >= 2 && chartData[chartData.length - 1].trend != null && chartData[chartData.length - 2].trend != null && (
                  (() => {
                    const last = chartData[chartData.length - 1].trend!;
                    const prev = chartData[chartData.length - 2].trend!;
                    const delta = last - prev;
                    const improving = delta > 0.2;
                    return (
                      <span className="text-xs font-medium px-1.5 py-0.5 rounded" style={{ backgroundColor: improving ? '#10b98120' : '#f59e0b20', color: improving ? '#10b981' : '#f59e0b' }}>
                        {improving ? '↑ Mejorando' : '→ Estable'}
                      </span>
                    );
                  })()
                )}
                {/* 30-day E1RM average */}
                {chartData.length >= 2 && (
                  <span className="text-xs" style={{ color: 'var(--color-text-2)' }}>
                    Media 30d: <span className="font-semibold" style={{ color: 'var(--color-text-1)' }}>
                      {Math.round(chartData.reduce((s, d) => s + d.estimated1rm, 0) / chartData.length)} kg
                    </span>
                  </span>
                )}
                {/* Workouts this month */}
                {workoutsThisMonth > 0 && (
                  <span className="text-xs" style={{ color: 'var(--color-text-2)' }}>
                    Este mes: <span className="font-semibold" style={{ color: 'var(--color-text-1)' }}>{workoutsThisMonth} entr.</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* F77 — Target RPE badge when set via routine */}
        {targetRpe != null && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
            <Target size={14} style={{ color: 'var(--color-primary)' }} />
            <span className="text-xs font-medium" style={{ color: 'var(--color-text-2)' }}>Objetivo RPE</span>
            <span className="ml-auto text-sm font-bold px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--color-primary)', color: '#000' }}>
              RPE {targetRpe}
            </span>
          </div>
        )}

        {/* F207 — PR prediction hint: weight × reps needed to beat current maxWeight PR */}
        {prPrediction && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
            <Trophy size={14} style={{ color: 'var(--color-primary)' }} />
            <div className="flex-1 min-w-0">
              <span className="text-xs" style={{ color: 'var(--color-text-2)' }}>Para nuevo PR:</span>
              <span className="ml-2 text-sm font-bold" style={{ color: 'var(--color-primary)' }}>
                {prPrediction.weight} kg × {prPrediction.reps} reps
              </span>
            </div>
          </div>
        )}

        {/* F208 — Average rest time for this exercise */}
        {restTimeAvg > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
            <Timer size={14} style={{ color: 'var(--color-text-2)' }} />
            <span className="text-xs" style={{ color: 'var(--color-text-2)' }}>Descanso medio (30d)</span>
            <span className="ml-auto text-sm font-semibold" style={{ color: 'var(--color-text-1)' }}>
              {restTimeAvg}s
            </span>
          </div>
        )}

        {/* F223 — Weak point indicator: when latest E1RM is >10% below 30-day average */}
        {weakPoint && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ backgroundColor: '#fef3c7', border: '1px solid #f59e0b30' }}>
            <AlertTriangle size={14} style={{ color: '#f59e0b' }} />
            <div className="flex-1 min-w-0">
              <span className="text-xs font-medium" style={{ color: '#92400e' }}>Señal de bajo rendimiento</span>
              <span className="ml-2 text-xs" style={{ color: '#92400e' }}>
                E1RM actual <span className="font-bold">{Math.round(weakPoint.latestE1RM)} kg</span> vs media 30d <span className="font-bold">{Math.round(weakPoint.avgE1RM)} kg</span> ({weakPoint.dropPercent}% por debajo)
              </span>
            </div>
          </div>
        )}

        {/* PR History — from personal_records table (F4) */}
        {personalRecords.length > 0 && (
          <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
            <div className="flex items-center gap-2 mb-3">
              <Target size={14} style={{ color: 'var(--color-primary)' }} />
              <h3 className="text-sm font-semibold">Récords Personales</h3>
            </div>
            {/* Group by type */}
            {(['max_weight', 'estimated_1rm'] as const).map(prType => {
              const recordsOfType = personalRecords.filter(pr => pr.type === prType);
              if (recordsOfType.length === 0) return null;
              const latest = recordsOfType[0];
              return (
                <div key={prType} className="mb-3 last:mb-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium" style={{ color: 'var(--color-text-2)' }}>
                      {prType === 'max_weight' ? 'Peso máximo' : '1RM estimado'}
                    </span>
                    <span className="text-lg font-bold" style={{ color: 'var(--color-primary)' }}>
                      {latest.value} kg
                    </span>
                  </div>
                  <div className="space-y-1">
                    {recordsOfType.slice(0, 5).map((pr, i) => (
                      <div key={pr.id} className="flex items-center justify-between py-0.5">
                        <span className="text-xs" style={{ color: 'var(--color-text-2)' }}>
                          {format(new Date(pr.achieved_at), "d 'de' MMM yyyy", { locale: es })}
                        </span>
                        <span className="text-xs font-medium" style={{ color: i === 0 ? 'var(--color-primary)' : 'var(--color-text-2)' }}>
                          {pr.value} kg{i === 0 && ' ← PR'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Chart */}
        {chartData.length >= 2 ? (
          <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Historial</h3>
              <div className="flex gap-1">
                <button
                  onClick={() => setMetric('weight')}
                  className="px-2 py-1 rounded text-xs font-medium"
                  style={{
                    backgroundColor: metric === 'weight' ? 'var(--color-primary)' : 'var(--color-surface-2)',
                    color: metric === 'weight' ? '#000' : 'var(--color-text-2)',
                  }}
                >
                  Peso
                </button>
                <button
                  onClick={() => setMetric('volume')}
                  className="px-2 py-1 rounded text-xs font-medium"
                  style={{
                    backgroundColor: metric === 'volume' ? 'var(--color-primary)' : 'var(--color-surface-2)',
                    color: metric === 'volume' ? '#000' : 'var(--color-text-2)',
                  }}
                >
                  Volumen
                </button>
                {chartData.some(d => d.avgRpe > 0) && (
                  <button
                    onClick={() => setMetric('rpe')}
                    className="px-2 py-1 rounded text-xs font-medium"
                    style={{
                      backgroundColor: metric === 'rpe' ? 'var(--color-primary)' : 'var(--color-surface-2)',
                      color: metric === 'rpe' ? '#000' : 'var(--color-text-2)',
                    }}
                  >
                    RPE
                  </button>
                )}
              </div>
            </div>

            {metric === 'rpe' ? (
              // RPE history chart
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-2)" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={d => format(new Date(d), 'd MMM', { locale: es })}
                    tick={{ fontSize: 10, fill: 'var(--color-text-2)' }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'var(--color-text-2)' }}
                    domain={[0, 10]}
                    tickFormatter={v => `${v}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '8px',
                      fontSize: 12,
                    }}
                    labelFormatter={d => format(new Date(d), 'd MMM yyyy', { locale: es })}
                    formatter={(v: unknown) => [`RPE ${v}`, 'Esfuerzo']}
                  />
                  <Line
                    type="monotone"
                    dataKey="avgRpe"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#f59e0b' }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-2)" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={d => format(new Date(d), 'd MMM', { locale: es })}
                    tick={{ fontSize: 10, fill: 'var(--color-text-2)' }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'var(--color-text-2)' }}
                    tickFormatter={v => metric === 'weight' ? `${v}kg` : `${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '8px',
                      fontSize: 12,
                    }}
                    labelFormatter={d => format(new Date(d), 'd MMM yyyy', { locale: es })}
                    formatter={(v: unknown, name?: string | number) => {
                      if (name === '1RM est.') return [`${v} kg`, '1RM est.'];
                      if (name === 'Tendencia') return [`${v} kg`, 'Tendencia'];
                      if (name === 'PR') return [`${v} kg`, 'PR'];
                      return metric === 'weight' ? [`${v} kg`, 'Peso'] : [`${(Number(v) / 1000).toFixed(1)}k kg`, 'Volumen'];
                    }}
                  />
                  <ReferenceLine y={prs.maxWeight} stroke="var(--color-primary)" strokeDasharray="3 3" strokeOpacity={0.5} label={{ value: 'PR', position: 'right', fontSize: 10, fill: 'var(--color-text-2)' }} />
                  {/* F176 — Estimated 1RM trend line overlay on weight chart */}
                  {metric === 'weight' && chartData.some(d => d.estimated1rm > 0) && (
                    <>
                      <Line
                        type="monotone"
                        dataKey="estimated1rm"
                        stroke="#f59e0b"
                        strokeWidth={1.5}
                        strokeDasharray="4 3"
                        dot={{ r: 2, fill: '#f59e0b' }}
                        activeDot={{ r: 4 }}
                        name="1RM est."
                      />
                      {chartData.some(d => d.trend != null) && (
                        <Line
                          type="monotone"
                          dataKey="trend"
                          stroke="#f59e0b"
                          strokeWidth={1}
                          strokeDasharray="2 4"
                          dot={false}
                          activeDot={false}
                          name="Tendencia"
                        />
                      )}
                    </>
                  )}
                  {/* F176 — PR milestone markers */}
                  {metric === 'weight' && chartData.some(d => d.isPr) && chartData.filter(d => d.isPr).map((d, i) => (
                    <ReferenceLine
                      key={i}
                      x={d.date}
                      stroke="#f59e0b"
                      strokeWidth={2}
                      strokeOpacity={0.6}
                    />
                  ))}
                  <Line
                    type="monotone"
                    dataKey={metric}
                    stroke="var(--color-primary)"
                    strokeWidth={2}
                    dot={{ r: 3, fill: 'var(--color-primary)' }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        ) : chartData.length === 1 ? (
          <div className="p-4 rounded-xl text-center" style={{ backgroundColor: 'var(--color-surface)' }}>
            <p className="text-sm" style={{ color: 'var(--color-text-2)' }}>
              Solo 1 dato registrado. Haz más workouts con este ejercicio para ver el gráfico.
            </p>
          </div>
        ) : (
          <EmptyState
            variant="progress"
            title="Sin datos de progreso"
            description="Completa workouts con este ejercicio para ver tu evolución"
          />
        )}

        {/* F192 — Volume trend AreaChart: total volume per workout session over time */}
        {chartData.filter(d => d.volume > 0).length > 1 && (
          <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={14} style={{ color: 'var(--color-primary)' }} />
              <h3 className="text-sm font-semibold">Volumen por sesión</h3>
              <span className="text-xs ml-auto" style={{ color: 'var(--color-text-2)' }}>
                {chartData.filter(d => d.volume > 0).length} sesiones
              </span>
            </div>
            <ResponsiveContainer width="100%" height={120}>
              <AreaChart data={chartData.filter(d => d.volume > 0)} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="volumeGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-2)" />
                <XAxis
                  dataKey="date"
                  tickFormatter={d => format(new Date(d), 'd MMM', { locale: es })}
                  tick={{ fontSize: 9, fill: 'var(--color-text-2)' }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 9, fill: 'var(--color-text-2)' }}
                  tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px',
                    fontSize: 11,
                  }}
                  labelFormatter={d => format(new Date(d), 'd MMM yyyy', { locale: es })}
                  formatter={(v: unknown) => [`${Number(v).toLocaleString()} kg`, 'Volumen']}
                />
                <Area
                  type="monotone"
                  dataKey="volume"
                  stroke="var(--color-primary)"
                  strokeWidth={2}
                  fill="url(#volumeGradient)"
                  dot={{ r: 2.5, fill: 'var(--color-primary)' }}
                  activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* F247 — Time Under Tension chart: total TUT per workout session */}
        {(() => {
          // Compute TUT per date: sum of (reps * TUT_TEMPO_SECS) for each set
          const tutByDate: Record<string, number> = {};
          const repsByDate: Record<string, number> = {};
          history.forEach(s => {
            if (!s.weight || s.weight <= 0) return;
            const d = s.workout_date ? s.workout_date.split('T')[0] : '';
            if (!d) return;
            tutByDate[d] = (tutByDate[d] || 0) + (s.reps || 0) * TUT_TEMPO_SECS;
            repsByDate[d] = (repsByDate[d] || 0) + (s.reps || 0);
          });
          const tutData = Object.entries(tutByDate)
            .map(([date, tut]) => ({ date, tut, reps: repsByDate[date] }))
            .filter(d => d.tut > 0)
            .sort((a, b) => a.date.localeCompare(b.date));

          if (tutData.length < 2) return null;

          // Compute average TUT for reference line
          const avgTut = tutData.reduce((s, d) => s + d.tut, 0) / tutData.length;

          return (
            <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
              <div className="flex items-center gap-2 mb-3">
                <Timer size={14} style={{ color: '#f97316' }} />
                <h3 className="text-sm font-semibold">Tiempo bajo tensión</h3>
                <span className="text-xs ml-auto" style={{ color: 'var(--color-text-2)' }}>
                  {tutData.length} sesiones · avg {Math.round(avgTut)}s
                </span>
              </div>
              <ResponsiveContainer width="100%" height={100}>
                <BarChart data={tutData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-2)" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={d => format(new Date(d), 'd MMM', { locale: es })}
                    tick={{ fontSize: 9, fill: 'var(--color-text-2)' }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 9, fill: 'var(--color-text-2)' }}
                    tickFormatter={v => v >= 60 ? `${Math.floor(v / 60)}m` : `${v}s`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '8px',
                      fontSize: 11,
                    }}
                    labelFormatter={d => format(new Date(d), 'd MMM yyyy', { locale: es })}
                    formatter={(v: unknown) => {
                      const secs = Number(v);
                      return [`${Math.floor(secs / 60)}m ${secs % 60}s (${tutData.find(d => d.tut === secs)?.reps || 0} reps)`, 'TUT'];
                    }}
                  />
                  <ReferenceLine y={avgTut} stroke="#f97316" strokeDasharray="4 3" strokeOpacity={0.5} />
                  <Bar
                    dataKey="tut"
                    fill="#f97316"
                    radius={[3, 3, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          );
        })()}

        {/* F176 — PR Milestone Timeline: shows trophies at each PR date */}
        {chartData.filter(d => d.isPr).length > 0 && (
          <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
            <div className="flex items-center gap-2 mb-3">
              <Trophy size={14} style={{ color: '#f59e0b' }} />
              <h3 className="text-sm font-semibold">Hitos de PR</h3>
              <span className="text-xs ml-auto" style={{ color: 'var(--color-text-2)' }}>
                {chartData.filter(d => d.isPr).length} {'PRs'}
              </span>
            </div>
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-4 top-0 bottom-0 w-0.5 rounded-full" style={{ backgroundColor: 'var(--color-border)' }} />
              <div className="space-y-3">
                {chartData.filter(d => d.isPr).map((pr, i) => (
                  <div key={i} className="relative flex items-center gap-3 pl-10">
                    {/* Trophy dot */}
                    <div
                      className="absolute left-2 w-5 h-5 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: '#f59e0b' }}
                    >
                      <Trophy size={10} className="text-black" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold" style={{ color: '#f59e0b' }}>
                          {pr.prType === 'e1rm' ? '1RM estimado' : 'Peso máximo'}
                        </span>
                        <span className="text-sm font-bold">
                          {pr.prType === 'e1rm' ? pr.estimated1rm : pr.weight} kg
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar size={10} style={{ color: 'var(--color-text-2)' }} />
                        <span className="text-xs" style={{ color: 'var(--color-text-2)' }}>
                          {format(new Date(pr.date), 'd MMM yyyy', { locale: es })}
                        </span>
                      </div>
                    </div>
                    {/* Badge */}
                    <span
                      className="px-2 py-0.5 rounded text-xs font-semibold"
                      style={{ backgroundColor: '#f59e0b', color: '#000' }}
                    >
                      #{i + 1}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* F57 — Exercise frequency bar chart (sets per week, last 12 weeks) */}
        {freqData.length > 0 && freqData.some(w => w.sets > 0) && (
          <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
            <div className="flex items-center gap-2 mb-3">
              <Calendar size={14} style={{ color: 'var(--color-primary)' }} />
              <h3 className="text-sm font-semibold">Frecuencia semanal</h3>
              <span className="text-xs ml-auto" style={{ color: 'var(--color-text-2)' }}>Últimas 12 semanas</span>
            </div>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={freqData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-2)" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 9, fill: 'var(--color-text-2)' }}
                  interval={1}
                  tickFormatter={l => l.split(' ')[0]}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: 'var(--color-text-2)' }}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px',
                    fontSize: 11,
                  }}
                  labelFormatter={l => {
                    const w = freqData.find(x => x.label === l);
                    return w ? `${w.label} (${w.sets} series)` : l;
                  }}
                  formatter={(v: unknown) => [`${v} series`, 'Frecuencia']}
                />
                <Bar
                  dataKey="sets"
                  fill="var(--color-primary)"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={22}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* F305 — Muscle group co-occurrence radar chart */}
        {muscleRadarData.length > 0 && (
          <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
            <div className="flex items-center gap-2 mb-3">
              <Target size={14} style={{ color: 'var(--color-primary)' }} />
              <h3 className="text-sm font-semibold">Músculos trabajados</h3>
              <span className="text-xs ml-auto" style={{ color: 'var(--color-text-2)' }}>Últimas 12 sem</span>
            </div>
            <p className="text-xs mb-3" style={{ color: 'var(--color-text-2)' }}>
              En los días que entrenaste este ejercicio, ¿qué otros grupos musculares también fueron trabajados?
            </p>
            <ResponsiveContainer width="100%" height={180}>
              <RadarChart data={muscleRadarData} margin={{ top: 4, right: 24, bottom: 4, left: 24 }}>
                <PolarGrid stroke="var(--color-border)" />
                <PolarAngleAxis
                  dataKey="muscle"
                  tick={{ fontSize: 10, fill: 'var(--color-text-2)' }}
                />
                <Radar
                  name="Frecuencia"
                  dataKey="percent"
                  stroke="var(--color-primary)"
                  fill="var(--color-primary)"
                  fillOpacity={0.25}
                  dot={{ r: 3, fill: 'var(--color-primary)', strokeWidth: 0 }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px',
                    fontSize: 11,
                  }}
                  formatter={(v: unknown) => [`${v}%`, 'Coincidencia']}
                  labelFormatter={l => String(l)}
                />
              </RadarChart>
            </ResponsiveContainer>
            {/* Muscle list below chart */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {muscleRadarData.map(({ muscle, count, percent }) => (
                <span
                  key={muscle}
                  className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                  style={{
                    backgroundColor: percent > 60 ? 'rgba(16,185,129,0.15)' : percent > 30 ? 'rgba(59,130,246,0.12)' : 'var(--color-surface-2)',
                    color: percent > 60 ? '#10b981' : percent > 30 ? '#3b82f6' : 'var(--color-text-2)',
                  }}
                  title={`${count} workouts`}
                >
                  {muscle} {percent}%
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Recent history table */}
        {history.length > 0 && (
          <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
            <h3 className="text-sm font-semibold mb-3">Historial reciente</h3>
            <div className="space-y-2">
              {(() => {
                const shownWorkouts = new Set<string>();
                return history.slice(0, 20).map((s, i) => {
                  const isFirstForWorkout = !shownWorkouts.has(s.workout_id);
                  if (isFirstForWorkout) shownWorkouts.add(s.workout_id);
                  return (
                <div key={i} className="flex items-start justify-between py-1.5 border-b last:border-0" style={{ borderColor: 'var(--color-border)' }}>
                  <div className="flex items-start gap-2 flex-wrap flex-1 min-w-0">
                    <span className="text-xs font-mono w-16 flex-shrink-0 mt-0.5" style={{ color: 'var(--color-text-2)' }}>
                      {s.workout_date ? format(new Date(s.workout_date), 'd MMM', { locale: es }) : '—'}
                    </span>
                    {/* F134 — Set type badge */}
                    {s.set_type && s.set_type !== 'normal' && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded font-bold flex-shrink-0 mt-0.5"
                        style={{ backgroundColor: `${SET_TYPE_COLORS_HISTORY[s.set_type]}20`, color: SET_TYPE_COLORS_HISTORY[s.set_type] }}
                      >
                        {s.set_type === 'warmup' ? 'W' : s.set_type === 'drop' ? 'D' : s.set_type === 'failure' ? 'F' : 'S'}
                      </span>
                    )}
                    {/* F225 — Previous workout weight chip (shown on first set of each workout) */}
                    {isFirstForWorkout && previousWeightMap[s.workout_id] != null && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5"
                        style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text-2)' }}
                        title={`Anterior: ${previousWeightMap[s.workout_id]} kg`}
                      >
                        ←{previousWeightMap[s.workout_id]}kg
                      </span>
                    )}
                    <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {s.weight} kg × {s.reps}
                        </span>
                        {s.rpe && (
                          <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text-2)' }}>
                            RPE {s.rpe}
                          </span>
                        )}
                      </div>
                      {/* F177 — Exercise notes shown only once per workout */}
                      {isFirstForWorkout && 'exercise_notes' in s && s.exercise_notes && (
                        <div className="flex items-start gap-1">
                          <MessageSquare size={10} className="flex-shrink-0 mt-0.5 opacity-60" style={{ color: 'var(--color-text-2)' }} />
                          <span className="text-xs italic" style={{ color: 'var(--color-text-2)' }}>
                            {s.exercise_notes.length > 60 ? `${s.exercise_notes.slice(0, 60)}…` : s.exercise_notes}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  {/* F248 — Copy set to clipboard */}
                  <button
                    onClick={() => handleCopySet(s.weight, s.reps, String(i))}
                    className="p-1.5 rounded flex-shrink-0 transition-colors"
                    style={{
                      backgroundColor: copiedSetId === String(i) ? 'var(--color-success)' : 'var(--color-surface-2)',
                      color: copiedSetId === String(i) ? '#fff' : 'var(--color-text-2)',
                    }}
                    title="Copiar peso×reps"
                  >
                    {copiedSetId === String(i) ? <Check size={12} /> : <Copy size={12} />}
                  </button>
                  {/* F134 — Workout name link */}
                  {'workout_name' in s && s.workout_name && (
                    <button
                      onClick={() => navigate(`/workout/${s.workout_id}`)}
                      className="text-xs truncate max-w-[120px] flex-shrink-0 mt-0.5 ml-1"
                      style={{ color: 'var(--color-primary)' }}
                      title={s.workout_name}
                    >
                      {s.workout_name}
                    </button>
                  )}
                </div>
              );
                });
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
