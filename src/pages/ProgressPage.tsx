/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDb, generateId } from '../database/init';
import type { Workout, Exercise } from '../types';
import { useWorkoutStore } from '../store/workoutStore';
import {
  getWorkoutCount,
  getRecentWorkouts,
  getMuscleVolumeMap,
  getMuscleLastWorked,
  getStreak,
  getWeeklySummary,
  getBodyWeightHistory,
  getLatestBodyWeight,
  estimateCaloriesBurned,
  getAllPersonalRecords,
  getTopExercisesByVolume,
  getWeeklyVolumeTrend,
  getRestTimeAnalytics,
  getRestTimeTrend,
  getRestTimeDistribution,
  getWorkoutTimeOfDayDistribution,
  getWorkoutFeelDistribution,
  getMaxWorkoutVolume,
  getExercisesByMuscle,
  getAllLatestMeasurements,
  getAllMeasurementHistory,
  getLastExerciseSets,
} from '../database/queries';
import { saveBodyWeight, deleteBodyWeight } from '../database/mutations';
import { format, subDays, eachDayOfInterval, getISOWeek, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { Flame, TrendingUp, TrendingDown, Scale, Plus, Trash2, Trophy, Clock, Copy, Lightbulb, X, Ruler, Calendar, Crown } from 'lucide-react';
import CalendarView from '../components/CalendarView';
import { useSettingsStore } from '../store/settingsStore';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, BarChart, Bar, Cell, AreaChart, Area, PieChart, Pie, ReferenceLine, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts';

export default function ProgressPage() {
  const navigate = useNavigate();
  const muscleAlertDays = useSettingsStore(s => s.muscleAlertDays);
  const { activeWorkout, startWorkout, addExerciseToWorkout } = useWorkoutStore();
  const [workoutCount, setWorkoutCount] = useState(0);
  const [recentWorkouts, setRecentWorkouts] = useState<Workout[]>([]);
  const [muscleVolume, setMuscleVolume] = useState<{ muscle: string; volume: number }[]>([]);
  const [muscleLastWorked, setMuscleLastWorked] = useState<Record<string, string>>({});
  const [heatmap, setHeatmap] = useState<Record<string, number>>({});
  const [streak, setStreak] = useState(0);
  const [weeklySummary, setWeeklySummary] = useState<{ thisWeek: number; lastWeek: number; volumeThisWeek: number; volumeLastWeek: number; streak: number; longestStreak: number } | null>(null);
  const [bodyWeightHistory, setBodyWeightHistory] = useState<{ id: string; weight: number; recorded_at: string; photo: string | null; notes: string }[]>([]);
  const [latestWeight, setLatestWeight] = useState<number | null>(null);
  const [showWeightForm, setShowWeightForm] = useState(false);
  const [weightInput, setWeightInput] = useState('');
  const [weightPhoto, setWeightPhoto] = useState<string | null>(null);
  const [weightNotes, setWeightNotes] = useState('');
  const [totalCalories, setTotalCalories] = useState(0);
  const [allPRs, setAllPRs] = useState<{ exercise_id: string; exercise_name: string; type: string; value: number; achieved_at: string; workout_id: string; muscle_group: string }[]>([]);
  // F160 — Muscle group filter for Global PRs
  const [prMuscleFilter, setPrMuscleFilter] = useState<string>('all');
  // F47 — Weekly frequency data for bar chart
  const [weeklyFrequency, setWeeklyFrequency] = useState<{ week: string; count: number }[]>([]);
  // F59 — Duration histogram
  const [durationHistogram, setDurationHistogram] = useState<{ bucket: string; label: string; count: number }[]>([]);
  // F117 — Time of day distribution
  const [timeOfDayDistribution, setTimeOfDayDistribution] = useState<{ timeOfDay: string; label: string; count: number }[]>([]);
  // F75 — Top exercises by volume
  const [topExercises, setTopExercises] = useState<{ exercise_name: string; total_volume: number }[]>([]);
  // F91 — Weekly volume trend
  const [weeklyVolume, setWeeklyVolume] = useState<{ week: string; label: string; volume: number }[]>([]);
  // F97 — Rest time analytics
  const [restAnalytics, setRestAnalytics] = useState<{ globalAvg: number; perMuscle: { muscle: string; avg: number; count: number }[] } | null>(null);
  // F9 — Rest time trend
  const [restTimeTrend, setRestTimeTrend] = useState<{ date: string; avg_rest: number; workout_id: string }[]>([]);
  // F238 — Rest time distribution
  const [restDistribution, setRestDistribution] = useState<{ bucket: number; label: string; count: number }[]>([]);
  const [feelDistribution, setFeelDistribution] = useState<Record<string, number>>({});
  // F148 — Max workout volume PR
  const [maxWorkoutVolume, setMaxWorkoutVolume] = useState<{ workout_id: string; workout_name: string; volume: number; date: string } | null>(null);
  // F70 — PR export copy feedback
  const [prCopied, setPrCopied] = useState(false);
  // F151 — Muscle balance nudge card dismiss state
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  // F151 — Suggested exercise for the most overdue muscle group
  const [suggestedExercise, setSuggestedExercise] = useState<{ name: string; muscle: string; exercise_id: string } | null>(null);
  // F7 — Body measurements summary
  const [allMeasurements, setAllMeasurements] = useState<Record<string, number | null>>({});
  // F175 — Measurement history for trend chart
  const [measurementHistory, setMeasurementHistory] = useState<Record<string, { date: string; value: number }[]>>({});
  const [selectedMeasurementPart, setSelectedMeasurementPart] = useState<string>('waist');
  // F240 — Calendar widget toggle
  const [showCalendar, setShowCalendar] = useState(false);

  useEffect(() => {
    try {
      const db = getDb();
      if (!db) return;

      setWorkoutCount(getWorkoutCount(db));
      setRecentWorkouts(getRecentWorkouts(db, 30));
      setMuscleVolume(getMuscleVolumeMap(db, 30));

      // F151 — Find the most overdue muscle and a suggested exercise for it
      // F286 — cache getMuscleLastWorked result (was called 4x = 4 separate DB queries)
      const muscleLastWorkedMap = getMuscleLastWorked(db);
      setMuscleLastWorked(muscleLastWorkedMap);
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const ALL_MUSCLES = ['chest','back','legs','shoulders','arms','core'];
      const overdue = ALL_MUSCLES.filter(m => {
        const lastWorked = muscleLastWorkedMap[m];
        if (!lastWorked) return true;
        return differenceInDays(new Date(todayStr), new Date(lastWorked)) >= muscleAlertDays;
      });
      if (overdue.length > 0) {
        // Sort by most days since worked
        const mostOverdue = [...overdue].sort((a, b) => {
          const daysA = muscleLastWorkedMap[a]
            ? differenceInDays(new Date(todayStr), new Date(muscleLastWorkedMap[a])) : 999;
          const daysB = muscleLastWorkedMap[b]
            ? differenceInDays(new Date(todayStr), new Date(muscleLastWorkedMap[b])) : 999;
          return daysB - daysA;
        })[0];
        if (mostOverdue) {
          const exercises = getExercisesByMuscle(db, mostOverdue);
          if (exercises.length > 0) {
            const suggested = exercises.find((e: Exercise) => !e.is_custom) || exercises[0];
            setSuggestedExercise({ name: suggested.name, muscle: mostOverdue, exercise_id: suggested.id });
          }
        }
      }
      setStreak(getStreak(db));
      setWeeklySummary(getWeeklySummary(db));
      setBodyWeightHistory(getBodyWeightHistory(db, 30));
      setLatestWeight(getLatestBodyWeight(db));
      setAllPRs(getAllPersonalRecords(db));
      // F148 — Load max workout volume PR
      setMaxWorkoutVolume(getMaxWorkoutVolume(db));
      // F7 — Load latest measurements for all body parts
      setAllMeasurements(getAllLatestMeasurements(db));
      // F175 — Load measurement history for trend chart
      setMeasurementHistory(getAllMeasurementHistory(db, 90));

      // Estimate total calories burned across all workouts
      const workouts = getRecentWorkouts(db, 365).filter((w: Workout) => w.finished_at);
      let totalCal = 0;
      for (const w of workouts) {
        totalCal += estimateCaloriesBurned(db, w.id);
      }
      setTotalCalories(totalCal);

      // Build heatmap for last 12 weeks
      const today = new Date();
      const start = subDays(today, 84);
      const days = eachDayOfInterval({ start, end: today });
      const map: Record<string, number> = {};
      days.forEach(d => { map[format(d, 'yyyy-MM-dd')] = 0; });

      const recent = getRecentWorkouts(db, 365);
      recent.forEach(w => {
        const day = format(new Date(w.started_at), 'yyyy-MM-dd');
        if (map[day] !== undefined) map[day]++;
      });
      setHeatmap(map);

      // F47 — Build weekly frequency data for last 12 weeks
      const weekMap: Record<string, number> = {};
      recent.forEach(w => {
        if (!w.finished_at) return; // only completed workouts
        const d = new Date(w.started_at);
        // Get ISO week key: "2026-W17"
        const year = d.getFullYear();
        const weekNum = getISOWeek(d);
        const key = `${year}-W${weekNum.toString().padStart(2, '0')}`;
        weekMap[key] = (weekMap[key] || 0) + 1;
      });
      // Fill in missing weeks with 0
      const wf: { week: string; count: number }[] = [];
      for (let i = 11; i >= 0; i--) {
        const d = subDays(today, i * 7);
        const year = d.getFullYear();
        const weekNum = getISOWeek(d);
        const key = `${year}-W${weekNum.toString().padStart(2, '0')}`;
        wf.push({ week: key, count: weekMap[key] || 0 });
      }
      setWeeklyFrequency(wf);

      // F59 — Build duration histogram data
      const durMap: Record<string, number> = {
        '<30min': 0, '30-60min': 0, '60-90min': 0, '>90min': 0,
      };
      recent.forEach(w => {
        if (!w.finished_at || !w.duration_seconds) return;
        const mins = Math.round(w.duration_seconds / 60);
        if (mins < 30) durMap['<30min']++;
        else if (mins < 60) durMap['30-60min']++;
        else if (mins < 90) durMap['60-90min']++;
        else durMap['>90min']++;
      });
      setDurationHistogram([
        { bucket: '<30min', label: '<30m', count: durMap['<30min'] },
        { bucket: '30-60min', label: '30-60m', count: durMap['30-60min'] },
        { bucket: '60-90min', label: '60-90m', count: durMap['60-90min'] },
        { bucket: '>90min', label: '>90m', count: durMap['>90min'] },
      ]);

      // F75 — Top exercises by volume
      setTopExercises(getTopExercisesByVolume(db, 10));

      // F91 — Weekly volume trend
      setWeeklyVolume(getWeeklyVolumeTrend(db));

      // F97 — Rest time analytics
      setRestAnalytics(getRestTimeAnalytics(db));

      // F9 — Rest time trend
      setRestTimeTrend(getRestTimeTrend(db));

      // F238 — Rest time distribution
      setRestDistribution(getRestTimeDistribution(db));

      // F117 — Time of day distribution
      setTimeOfDayDistribution(getWorkoutTimeOfDayDistribution(db));

      // F293 — Feel tag distribution
      setFeelDistribution(getWorkoutFeelDistribution(db, 30));
    } catch (err) {
      console.error('[ProgressPage] Error loading data:', err);
    }
  }, [muscleAlertDays]);

  const handleSaveWeight = () => {
    const weight = parseFloat(weightInput.replace(',', '.'));
    if (isNaN(weight) || weight <= 0) return;
    const db = getDb();
    if (!db) return;
    const id = generateId();
    saveBodyWeight(db, id, weight, weightPhoto, weightNotes);
    setLatestWeight(weight);
    setBodyWeightHistory([{ id, weight, recorded_at: new Date().toISOString(), photo: weightPhoto, notes: weightNotes }, ...bodyWeightHistory]);
    setWeightInput('');
    setWeightPhoto(null);
    setWeightNotes('');
    setShowWeightForm(false);
  };

  const handleDeleteWeight = (id: string) => {
    const db = getDb();
    if (!db) return;
    deleteBodyWeight(db, id);
    setBodyWeightHistory(bodyWeightHistory.filter(bw => bw.id !== id));
    setLatestWeight(getLatestBodyWeight(db));
  };

  // F178 — Quick-log body weight with +0.5/-0.5 adjustment
  const handleQuickLogWeight = (delta: number) => {
    if (latestWeight === null) return;
    const newWeight = Math.round((latestWeight + delta) * 10) / 10;
    if (newWeight <= 0) return;
    const db = getDb();
    if (!db) return;
    const id = generateId();
    saveBodyWeight(db, id, newWeight, null, '');
    setLatestWeight(newWeight);
    setBodyWeightHistory([{ id, weight: newWeight, recorded_at: new Date().toISOString(), photo: null, notes: '' }, ...bodyWeightHistory]);
  };

  // F70 — Export PRs to clipboard
  const handleExportPRs = () => {
    if (allPRs.length === 0) return;
    const lines: string[] = ['🏆 RÉCORDS PERSONALES — HEVY', ''];
    // Group by exercise
    const grouped: Record<string, typeof allPRs> = {};
    allPRs.forEach(pr => {
      if (!grouped[pr.exercise_id]) grouped[pr.exercise_id] = [];
      grouped[pr.exercise_id].push(pr);
    });
    const sorted = Object.values(grouped).sort((a, b) => {
      const aMax = Math.max(...a.map(r => r.type === 'estimated_1rm' ? r.value : 0));
      const bMax = Math.max(...b.map(r => r.type === 'estimated_1rm' ? r.value : 0));
      return bMax - aMax;
    });
    sorted.forEach(group => {
      const weightPR = group.find(r => r.type === 'max_weight');
      const oneRMPR = group.find(r => r.type === 'estimated_1rm');
      const displayPR = oneRMPR || weightPR;
      if (!displayPR) return;
      const name = displayPR.exercise_name;
      const date = format(new Date(displayPR.achieved_at), 'dd/MM/yyyy');
      const weight = weightPR && weightPR.value > 0 ? `Peso máx: ${weightPR.value} kg` : '';
      const oneRM = oneRMPR && oneRMPR.value > 0 ? `1RM est: ${oneRMPR.value} kg` : '';
      lines.push(`${name} (${date})`);
      if (weight) lines.push(`  ${weight}`);
      if (oneRM) lines.push(`  ${oneRM}`);
      lines.push('');
    });
    lines.push('Generado por HEVY');
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setPrCopied(true);
      setTimeout(() => setPrCopied(false), 2500);
    });
  };

  // Streak comparison for weekly summary
  const weekDelta = weeklySummary ? weeklySummary.thisWeek - weeklySummary.lastWeek : 0;
  const volumeDelta = weeklySummary && weeklySummary.lastWeek > 0
    ? Math.round(((weeklySummary.volumeThisWeek - weeklySummary.volumeLastWeek) / weeklySummary.volumeLastWeek) * 100)
    : null;

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
        <h1 className="text-2xl font-bold">Progreso</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* F242 — Enhanced Streak + Weekly Summary */}
        {weeklySummary && (
          <div className="p-4 rounded-2xl border" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-sm)' }}>
            {/* Streak hero — F242 */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🔥</span>
                <div>
                  <p className="text-3xl font-bold" style={{ color: streak > 0 ? 'var(--color-primary)' : 'var(--color-text-2)' }}>
                    {streak}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--color-text-2)' }}>
                    {streak === 1 ? 'día de racha' : streak <= 6 ? 'días de racha' : '¡Semana completa!'}
                  </p>
                </div>
              </div>
              {/* Milestone badges */}
              <div className="flex flex-col items-end gap-1">
                {streak >= 7 && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ backgroundColor: 'rgba(16,185,129,0.15)', color: '#10b981' }}>
                    🎯 ¡Semana completa!
                  </span>
                )}
                {weeklySummary.longestStreak > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text-2)' }}>
                    Récord: {weeklySummary.longestStreak}d
                  </span>
                )}
                {/* F240 — Calendar toggle */}
                <button
                  onClick={() => setShowCalendar(v => !v)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: showCalendar ? 'var(--color-primary)' : 'var(--color-surface-2)',
                    color: showCalendar ? '#000' : 'var(--color-text-2)',
                  }}
                  title="Ver calendario mensual"
                >
                  <Calendar size={10} />
                  Calendario
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {/* Streak — moved up, shows as fire */}
              <div className="text-center">
                <p className="text-2xl font-bold" style={{ color: 'var(--color-primary)' }}>
                  {streak > 0 ? '🔥' : '—'}
                </p>
                <p className="text-xs" style={{ color: 'var(--color-text-2)' }}>Racha activa</p>
              </div>
              {/* This week */}
              <div className="text-center">
                <div className="flex items-center justify-center gap-1">
                  <p className="text-2xl font-bold">{weeklySummary.thisWeek}</p>
                  {weekDelta !== 0 && (
                    weekDelta > 0
                      ? <TrendingUp size={14} style={{ color: 'var(--color-primary)' }} />
                      : <TrendingDown size={14} color="#e53e3e" />
                  )}
                </div>
                <p className="text-xs" style={{ color: 'var(--color-text-2)' }}>Esta semana</p>
              </div>
              {/* Volume */}
              <div className="text-center">
                <div className="flex items-center justify-center gap-1">
                  <p className="text-2xl font-bold">
                    {weeklySummary.volumeThisWeek > 0 ? `${(weeklySummary.volumeThisWeek / 1000).toFixed(0)}k` : 0}
                  </p>
                  {volumeDelta !== null && volumeDelta !== 0 && (
                    volumeDelta > 0
                      ? <TrendingUp size={14} style={{ color: 'var(--color-primary)' }} />
                      : <TrendingDown size={14} color="#e53e3e" />
                  )}
                </div>
                <p className="text-xs" style={{ color: 'var(--color-text-2)' }}>Volumen kg</p>
              </div>
            </div>
            {weekDelta !== 0 && (
              <p className="text-xs text-center mt-2" style={{ color: weekDelta > 0 ? 'var(--color-primary)' : '#e53e3e' }}>
                {weekDelta > 0 ? `+${weekDelta} workout${weekDelta !== 1 ? 's' : ''} vs semana pasada`
                  : `${weekDelta} workouts vs semana pasada`}
                {volumeDelta !== null && ` · Volumen ${volumeDelta > 0 ? '+' : ''}${volumeDelta}%`}
              </p>
            )}
            {/* F69 — Streak calendar strip (GitHub-style contribution graph) */}
            {Object.keys(heatmap).length > 0 && (
              <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
                <div className="flex items-center gap-2">
                  {/* Day labels */}
                  <div className="flex flex-col gap-0.5 mr-1" style={{ fontSize: 8, color: 'var(--color-text-2)' }}>
                    <span className="h-2 leading-2">L</span>
                    <span className="h-2 leading-2">M</span>
                    <span className="h-2 leading-2">X</span>
                    <span className="h-2 leading-2">J</span>
                    <span className="h-2 leading-2">V</span>
                    <span className="h-2 leading-2">S</span>
                    <span className="h-2 leading-2">D</span>
                  </div>
                  {/* Calendar grid — last 12 weeks, from oldest to most recent */}
                  <div className="flex gap-0.5 overflow-hidden">
                    {(() => {
                      // Build an array of dates for the last 12 weeks (84 days)
                      const today = new Date();
                      const cells: { date: string; count: number }[] = [];
                      for (let i = 83; i >= 0; i--) {
                        const d = subDays(today, i);
                        const key = format(d, 'yyyy-MM-dd');
                        cells.push({ date: key, count: heatmap[key] || 0 });
                      }
                      // Group into weeks (7 cells each), most recent week on the right
                      const weeks: { date: string; count: number }[][] = [];
                      for (let i = 0; i < cells.length; i += 7) {
                        weeks.push(cells.slice(i, i + 7));
                      }
                      const dayColors = [
                        '#1a1a2e',           // 0 — nada
                        '#3d2500',           // 1 — muy bajo
                        '#5c3800',           // 2 — bajo
                        '#7c4a00',           // 3 — medio
                        '#9c5c00',           // 4 — bueno
                        '#FFB300',           // 5 — intenso (primary yellow)
                      ];
                      return weeks.map((week, wi) => (
                        <div key={wi} className="flex flex-col gap-0.5">
                          {week.map((cell, di) => {
                            const color = cell.count === 0
                              ? 'var(--color-surface-2)'
                              : dayColors[Math.min(cell.count - 1, dayColors.length - 1)];
                            return (
                              <div
                                key={di}
                                className="w-2.5 h-2 rounded-sm"
                                style={{ backgroundColor: color }}
                                title={`${cell.date}: ${cell.count} workout${cell.count !== 1 ? 's' : ''}`}
                              />
                            );
                          })}
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* F240 — Calendar widget card */}
        {showCalendar && (
          <div className="p-4 rounded-2xl border" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-sm)' }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Calendario de workouts</h3>
              <button
                onClick={() => setShowCalendar(false)}
                className="p-1 rounded text-xs"
                style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text-2)' }}
              >
                ✕
              </button>
            </div>
            <CalendarView
              workoutHistory={recentWorkouts}
              onSelectWorkout={(id) => navigate(`/workout/${id}`)}
            />
          </div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 rounded-2xl border" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-sm)' }}>
            <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--color-text-2)' }}>Total Workouts</p>
            <p className="text-3xl font-black" style={{ color: 'var(--color-primary)' }}>{workoutCount}</p>
          </div>
          <div className="p-4 rounded-2xl border" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-sm)' }}>
            <div className="flex items-center gap-1 mb-2">
              <Flame size={12} style={{ color: 'var(--color-warning)' }} />
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-2)' }}>Calorías est.</p>
            </div>
            <p className="text-3xl font-black" style={{ color: 'var(--color-warning)' }}>
              {totalCalories > 0 ? `${(totalCalories / 1000).toFixed(1)}k` : 0}
            </p>
          </div>
        </div>

        {/* F61 — Average duration stat */}
        {recentWorkouts.length > 0 && (
          <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
            <div className="flex items-center gap-2 mb-3">
              <Clock size={14} style={{ color: 'var(--color-primary)' }} />
              <h3 className="text-sm font-semibold">Duración media</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center">
                <p className="text-2xl font-bold" style={{ color: 'var(--color-primary)' }}>
                  {(() => {
                    const withDur = recentWorkouts.filter((w: Workout) => w.duration_seconds != null);
                    if (withDur.length === 0) return '—';
                    const avgSecs = withDur.reduce((acc, w) => acc + (w.duration_seconds || 0), 0) / withDur.length;
                    const mins = Math.round(avgSecs / 60);
                    return `${mins}m`;
                  })()}
                </p>
                <p className="text-xs" style={{ color: 'var(--color-text-2)' }}>Promedio</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold" style={{ color: 'var(--color-primary)' }}>
                  {(() => {
                    const withDur = recentWorkouts.filter((w: Workout) => w.duration_seconds != null);
                    if (withDur.length === 0) return '—';
                    const totalSecs = withDur.reduce((acc, w) => acc + (w.duration_seconds || 0), 0);
                    const h = Math.floor(totalSecs / 3600);
                    const m = Math.round((totalSecs % 3600) / 60);
                    return h > 0 ? `${h}h ${m}m` : `${m}m`;
                  })()}
                </p>
                <p className="text-xs" style={{ color: 'var(--color-text-2)' }}>Total (30 días)</p>
              </div>
            </div>
          </div>
        )}
        {/* Body weight */}
        <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Scale size={14} style={{ color: 'var(--color-primary)' }} />
              <h3 className="text-sm font-semibold">Peso corporal</h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate('/measurements')}
                className="text-xs px-2 py-1 rounded-lg"
                style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text-2)' }}
              >
                Ver medidas
              </button>
              <button
                onClick={() => setShowWeightForm(!showWeightForm)}
                className="p-1.5 rounded-lg"
                style={{ backgroundColor: 'var(--color-primary)', color: '#000' }}
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          {showWeightForm && (
            <div className="space-y-3 mb-3">
              <div className="flex gap-2">
                <input
                  type="number"
                  value={weightInput}
                  onChange={e => setWeightInput(e.target.value)}
                  placeholder="kg"
                  step="0.1"
                  className="flex-1 rounded-lg px-3 py-2 text-sm"
                  style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                />
                <button
                  onClick={handleSaveWeight}
                  className="px-3 py-2 rounded-lg text-sm font-medium"
                  style={{ backgroundColor: 'var(--color-primary)', color: '#000' }}
                >
                  Guardar
                </button>
              </div>
              {/* Foto */}
              <div className="flex items-center gap-2">
                {weightPhoto ? (
                  <div className="relative">
                    <img
                      src={weightPhoto}
                      alt="Foto progreso"
                      className="w-16 h-16 rounded-lg object-cover"
                      style={{ border: '1px solid var(--color-border)' }}
                    />
                    <button
                      onClick={() => setWeightPhoto(null)}
                      className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs"
                      style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <label
                    className="w-16 h-16 rounded-lg flex flex-col items-center justify-center cursor-pointer"
                    style={{ backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--color-text-2)' }}>
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                    <span className="text-xs mt-1" style={{ color: 'var(--color-text-2)' }}>Foto</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = ev => setWeightPhoto(ev.target?.result as string);
                        reader.readAsDataURL(file);
                      }}
                    />
                  </label>
                )}
                <span className="text-xs" style={{ color: 'var(--color-text-2)' }}>Añade una foto de progreso</span>
              </div>
              {/* Notas */}
              <textarea
                value={weightNotes}
                onChange={e => setWeightNotes(e.target.value)}
                placeholder="Notas (ej: fin de semana, sentía la tripa hinchada...)"
                rows={2}
                className="w-full rounded-lg px-3 py-2 text-sm resize-none"
                style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
              />
            </div>
          )}

          {latestWeight !== null && !showWeightForm && (
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <p className="text-2xl font-bold" style={{ color: 'var(--color-primary)' }}>
                  {latestWeight} <span className="text-sm font-normal" style={{ color: 'var(--color-text-2)' }}>kg</span>
                </p>
                {bodyWeightHistory[0]?.photo && (
                  <img
                    src={bodyWeightHistory[0].photo}
                    alt="Última foto"
                    className="w-8 h-8 rounded-full object-cover"
                    style={{ border: '2px solid var(--color-primary)' }}
                    title="Tiene foto de progreso"
                  />
                )}
              </div>
              {/* F178 — Quick-log +0.5/-0.5 adjustment buttons */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleQuickLogWeight(-0.5)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold transition-colors"
                  style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)' }}
                  title="-0.5 kg"
                >
                  −
                </button>
                <button
                  onClick={() => handleQuickLogWeight(0.5)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold transition-colors"
                  style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)' }}
                  title="+0.5 kg"
                >
                  +
                </button>
              </div>
            </div>
          )}

          {bodyWeightHistory.length > 0 ? (
            <>
              {/* Body weight chart */}
              <ResponsiveContainer width="100%" height={100}>
                <LineChart
                  data={[...bodyWeightHistory].reverse().slice(-30)}
                  margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
                >
                  <XAxis
                    dataKey="recorded_at"
                    tickFormatter={d => format(new Date(d), 'd/M')}
                    tick={{ fontSize: 9, fill: 'var(--color-text-2)' }}
                    interval="preserveStartEnd"
                    tickCount={4}
                  />
                  <YAxis
                    tick={{ fontSize: 9, fill: 'var(--color-text-2)' }}
                    domain={['dataMin - 1', 'dataMax + 1']}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--color-surface-2)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '8px',
                      fontSize: 11,
                    }}
                    labelFormatter={d => format(new Date(d), 'd MMM')}
                    formatter={(v: unknown) => [`${v} kg`, 'Peso']}
                  />
                  <Line
                    type="monotone"
                    dataKey="weight"
                    stroke="var(--color-primary)"
                    strokeWidth={2}
                    dot={{ r: 2, fill: 'var(--color-primary)' }}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>

              {/* List of recent entries */}
              <div className="space-y-1.5 mt-2">
                {bodyWeightHistory.slice(0, 7).map(bw => (
                  <div key={bw.id} className="flex items-start gap-2 py-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
                    {bw.photo && (
                      <img
                        src={bw.photo}
                        alt="Foto"
                        className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                        style={{ border: '1px solid var(--color-border)' }}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs" style={{ color: 'var(--color-text-2)' }}>
                          {format(new Date(bw.recorded_at), 'd MMM', { locale: es })}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{bw.weight} kg</span>
                          <button
                            onClick={() => handleDeleteWeight(bw.id)}
                            className="p-1 rounded"
                            style={{ color: 'var(--color-text-2)' }}
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                      </div>
                      {bw.notes && (
                        <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--color-text-2)' }}>
                          {bw.notes}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-xs text-center py-2" style={{ color: 'var(--color-text-2)' }}>
              Sin registro. Pulsa + para añadir.
            </p>
          )}
        </div>

        {/* F7 — Body measurements summary */}
        {Object.values(allMeasurements).some(v => v !== null) && (
          <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Ruler size={14} style={{ color: 'var(--color-primary)' }} />
                <h3 className="text-sm font-semibold">Medidas corporales</h3>
              </div>
              <button
                onClick={() => navigate('/measurements')}
                className="text-xs px-2 py-1 rounded-lg"
                style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text-2)' }}
              >
                Ver todas
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[
                { key: 'waist', label: 'Cintura' },
                { key: 'chest', label: 'Pecho' },
                { key: 'biceps', label: 'Bíceps' },
                { key: 'thigh', label: 'Muslo' },
                { key: 'calf', label: 'Pantorrilla' },
                { key: 'hips', label: 'Cadera' },
                { key: 'shoulders', label: 'Hombros' },
                { key: 'neck', label: 'Cuello' },
              ].map(({ key, label }) => (
                <div
                  key={key}
                  className="flex flex-col items-center p-2 rounded-lg"
                  style={{ backgroundColor: 'var(--color-surface-2)' }}
                >
                  <span className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>
                    {allMeasurements[key] != null ? allMeasurements[key] : '—'}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--color-text-2)' }}>
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* F175 — Body measurement trend chart */}
        {(() => {
          const MEASUREMENT_PARTS: { key: string; label: string }[] = [
            { key: 'waist', label: 'Cintura' },
            { key: 'chest', label: 'Pecho' },
            { key: 'biceps', label: 'Bíceps' },
            { key: 'thigh', label: 'Muslo' },
            { key: 'calf', label: 'Pantorrilla' },
            { key: 'hips', label: 'Cadera' },
            { key: 'shoulders', label: 'Hombros' },
            { key: 'neck', label: 'Cuello' },
          ];
          const partHistory = measurementHistory[selectedMeasurementPart] || [];
          if (partHistory.length < 2) return null;
          const chartData = partHistory.map(h => ({
            date: h.date,
            label: format(new Date(h.date), 'd/M'),
            value: h.value,
          }));

          return (
            <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Ruler size={14} style={{ color: 'var(--color-primary)' }} />
                  <h3 className="text-sm font-semibold">Evolución de medidas</h3>
                </div>
                <button
                  onClick={() => navigate('/measurements')}
                  className="text-xs px-2 py-1 rounded-lg"
                  style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text-2)' }}
                >
                  Ver todas
                </button>
              </div>
              {/* Part selector tabs */}
              <div className="flex gap-1 flex-wrap mb-3">
                {MEASUREMENT_PARTS.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setSelectedMeasurementPart(key)}
                    className="px-2 py-1 rounded-lg text-xs font-medium transition-all"
                    style={{
                      backgroundColor: selectedMeasurementPart === key ? 'var(--color-primary)' : 'var(--color-surface-2)',
                      color: selectedMeasurementPart === key ? '#000' : 'var(--color-text-2)',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={120}>
                <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 9, fill: 'var(--color-text-2)' }}
                    interval="preserveStartEnd"
                    tickCount={4}
                  />
                  <YAxis
                    tick={{ fontSize: 9, fill: 'var(--color-text-2)' }}
                    domain={['dataMin - 1', 'dataMax + 1']}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--color-surface-2)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '8px',
                      fontSize: 11,
                    }}
                    labelFormatter={d => d}
                    formatter={(v: unknown) => [`${v} cm`, 'Medida']}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="var(--color-primary)"
                    strokeWidth={2}
                    dot={{ r: 2, fill: 'var(--color-primary)' }}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
              {partHistory.length >= 2 && (() => {
                const first = partHistory[0].value;
                const last = partHistory[partHistory.length - 1].value;
                const diff = Math.round((last - first) * 10) / 10;
                return (
                  <p className="text-[10px] text-right mt-1" style={{ color: 'var(--color-text-2)' }}>
                    {diff > 0 ? `↑ +${diff} cm total` : diff < 0 ? `↓ ${diff} cm total` : '→ Estable'}
                  </p>
                );
              })()}
            </div>
          );
        })()}

        {/* Heatmap */}
        <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
          <h3 className="text-sm font-semibold mb-3">Actividad (12 semanas)</h3>
          <div className="grid grid-cols-12 gap-1">
            {Object.entries(heatmap)
              .sort(([a], [b]) => a.localeCompare(b))
              .slice(-84)
              .map(([day, count]) => {
                const level = count === 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : 3;
                const colors = [
                  'var(--color-surface-2)',
                  '#3d2a0066',
                  '#3d2a00aa',
                  'var(--color-primary)',
                ];
                return (
                  <div
                    key={day}
                    className="w-full aspect-square rounded-sm"
                    style={{ backgroundColor: colors[level] }}
                    title={`${day}: ${count} workout${count !== 1 ? 's' : ''}`}
                  />
                );
              })}
          </div>
          <div className="flex items-center justify-end gap-1 mt-2">
            <span className="text-xs" style={{ color: 'var(--color-text-2)' }}>Menos</span>
            {[0,1,2,3].map(l => (
              <div key={l} className="w-3 h-3 rounded-sm" style={{
                backgroundColor: ['var(--color-surface-2)', '#3d2a0066', '#3d2a00aa', 'var(--color-primary)'][l]
              }} />
            ))}
            <span className="text-xs" style={{ color: 'var(--color-text-2)' }}>Más</span>
          </div>
        </div>

        {/* F47 — Weekly frequency bar chart */}
        {weeklyFrequency.length > 0 && (
          <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
            <h3 className="text-sm font-semibold mb-1">Frecuencia semanal</h3>
            <p className="text-xs mb-3" style={{ color: 'var(--color-text-2)' }}>Workouts por semana (últimas 12 semanas)</p>
            <ResponsiveContainer width="100%" height={100}>
              <BarChart data={weeklyFrequency} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <XAxis
                  dataKey="week"
                  tick={{ fontSize: 9, fill: 'var(--color-text-2)' }}
                  interval={1}
                  tickFormatter={(w) => w.split('-W')[1]}
                />
                <YAxis hide />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px',
                    fontSize: 12,
                  }}
                  labelStyle={{ color: 'var(--color-text-2)' }}
                  formatter={(value: unknown) => [`${value} workout${value !== 1 ? 's' : ''}`, 'Esta semana']}
                  labelFormatter={(label) => `Semana ${label.split('-W')[1]}`}
                />
                <Bar dataKey="count" fill="var(--color-primary)" radius={[3, 3, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* F91 — Weekly volume trend LineChart */}
        {weeklyVolume.length > 0 && (
          <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
            <h3 className="text-sm font-semibold mb-1">Volumen semanal</h3>
            <p className="text-xs mb-3" style={{ color: 'var(--color-text-2)' }}>kg por semana (últimas 12 semanas)</p>
            <ResponsiveContainer width="100%" height={100}>
              <AreaChart data={weeklyVolume} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 9, fill: 'var(--color-text-2)' }}
                  interval={1}
                />
                <YAxis hide />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px',
                    fontSize: 12,
                  }}
                  labelStyle={{ color: 'var(--color-text-2)' }}
                  formatter={(value: unknown) => [`${Number(value).toLocaleString()} kg`, 'Volumen']}
                  labelFormatter={(label) => `Semana ${label.replace('S', '')}`}
                />
                <Area type="monotone" dataKey="volume" stroke="var(--color-primary)" strokeWidth={2} fill="url(#volGrad)" dot={false} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* F59 — Duration histogram */}
        {durationHistogram.length > 0 && (
          <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
            <h3 className="text-sm font-semibold mb-1">Distribución de duración</h3>
            <p className="text-xs mb-3" style={{ color: 'var(--color-text-2)' }}> workouts por rango de duración (últimos 365 días)</p>
            <ResponsiveContainer width="100%" height={100}>
              <BarChart data={durationHistogram} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: 'var(--color-text-2)' }}
                />
                <YAxis hide />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px',
                    fontSize: 12,
                  }}
                  labelStyle={{ color: 'var(--color-text-2)' }}
                  formatter={(value: unknown) => [`${value} workout${value !== 1 ? 's' : ''}`, 'Cantidad']}
                />
                <Bar dataKey="count" fill="var(--color-primary)" radius={[3, 3, 0, 0]} maxBarSize={50} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* F97 — Rest Time Analytics */}
        {restAnalytics && restAnalytics.perMuscle.length > 0 && (
          <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-semibold">Análisis de descanso</h3>
              <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text-2)' }}>
                ~{restAnalytics.globalAvg}s media global
              </span>
            </div>
            <p className="text-xs mb-3" style={{ color: 'var(--color-text-2)' }}>Tiempo de descanso por grupo muscular (últimos 30 días)</p>
            <ResponsiveContainer width="100%" height={Math.max(80, restAnalytics.perMuscle.length * 36)}>
              <BarChart data={restAnalytics.perMuscle} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--color-text-2)' }} tickFormatter={(v) => `${v}s`} />
                <YAxis type="category" dataKey="muscle" width={70} tick={{ fontSize: 10, fill: 'var(--color-text-2)' }} tickFormatter={(m) => {
                  const labels: Record<string, string> = { chest: 'Pecho', back: 'Espalda', legs: 'Piernas', shoulders: 'Hombros', arms: 'Brazos', core: 'Core', cardio: 'Cardio', full_body: 'Full Body' };
                  return labels[m] || m;
                }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--color-surface-2)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px',
                    fontSize: 11,
                  }}
                  formatter={(v: unknown, _: unknown, props: unknown) => {
                    const p = props as { payload?: { count?: number } };
                    return [`${v}s (${p.payload?.count ?? 0} series)`, 'Descanso'];
                  }}
                  labelFormatter={(m) => {
                    const labels: Record<string, string> = { chest: 'Pecho', back: 'Espalda', legs: 'Piernas', shoulders: 'Hombros', arms: 'Brazos', core: 'Core', cardio: 'Cardio', full_body: 'Full Body' };
                    return labels[m] || m;
                  }}
                />
                <Bar dataKey="avg" radius={[0, 3, 3, 0]}>
                  {restAnalytics.perMuscle.map((entry) => {
                    const intensity = Math.min(entry.avg / 180, 1); // cap at 180s
                    const bg = intensity > 0.7 ? '#8b5cf6' : intensity > 0.4 ? '#6d28d9' : '#4c1d95';
                    return <Cell key={entry.muscle} fill={bg} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* F9 — Rest time trend chart with global average reference line (F159) */}
        {restTimeTrend.length >= 2 && (
          <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-semibold">Tendencia de descanso</h3>
              {restAnalytics && (
                <span className="text-[10px] px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text-2)' }}>
                  media global ~{restAnalytics.globalAvg}s
                </span>
              )}
            </div>
            <p className="text-xs mb-3" style={{ color: 'var(--color-text-2)' }}>Tiempo de descanso medio por workout (últimos 30 días)</p>
            <ResponsiveContainer width="100%" height={100}>
              <LineChart data={restTimeTrend} margin={{ top: 2, right: 4, left: -20, bottom: 0 }}>
                <XAxis
                  dataKey="date"
                  tickFormatter={d => format(new Date(d), 'd/M')}
                  tick={{ fontSize: 9, fill: 'var(--color-text-2)' }}
                  interval="preserveStartEnd"
                  tickCount={4}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: 'var(--color-text-2)' }}
                  tickFormatter={(v) => `${v}s`}
                  domain={[0, 'dataMax + 15']}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--color-surface-2)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px',
                    fontSize: 11,
                  }}
                  labelFormatter={d => format(new Date(d), 'd MMM')}
                  formatter={(v: unknown) => [`${v}s`, 'Promedio']}
                />
                {restAnalytics && restAnalytics.globalAvg > 0 && (
                  <ReferenceLine
                    y={restAnalytics.globalAvg}
                    stroke="var(--color-text-2)"
                    strokeDasharray="4 3"
                    strokeWidth={1}
                    label={{
                      value: `Media ${restAnalytics.globalAvg}s`,
                      position: 'insideTopRight',
                      fontSize: 9,
                      fill: 'var(--color-text-2)',
                    }}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="avg_rest"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  dot={{ r: 2, fill: '#8b5cf6' }}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* F238 — Rest time distribution histogram */}
        {restDistribution.length > 0 && (
          <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-semibold">Distribución de descanso</h3>
              {restAnalytics && restAnalytics.globalAvg > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text-2)' }}>
                  media ~{restAnalytics.globalAvg}s
                </span>
              )}
            </div>
            <p className="text-xs mb-3" style={{ color: 'var(--color-text-2)' }}>Frecuencia de tiempos de descanso (últimos 30 días)</p>
            <ResponsiveContainer width="100%" height={100}>
              <BarChart data={restDistribution} margin={{ top: 2, right: 4, left: -20, bottom: 0 }}>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 8, fill: 'var(--color-text-2)' }}
                  interval={0}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: 'var(--color-text-2)' }}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--color-surface-2)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px',
                    fontSize: 11,
                  }}
                  formatter={(v: unknown) => [`${v} series`, 'Frecuencia']}
                />
                <Bar dataKey="count" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-2)' }}>
              {restDistribution.reduce((s, d) => s + d.count, 0)} series registradas en {restDistribution.length} rangos
            </p>
          </div>
        )}

        {/* F9 — Rest time coaching insights (shown when restAnalytics has data) */}
        {restAnalytics && restAnalytics.globalAvg > 0 && (
          <>
            {/* Global rest time summary card */}
            <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
              <div className="flex items-center gap-2 mb-1">
                <Clock size={14} style={{ color: '#8b5cf6' }} />
                <h3 className="text-sm font-semibold">Análisis de descanso</h3>
              </div>
              <p className="text-xs mb-3" style={{ color: 'var(--color-text-2)' }}>Basado en tus últimos 30 días</p>

              {/* Global average rest — prominent display */}
              <div className="flex items-center gap-3 mb-4 p-3 rounded-xl" style={{ backgroundColor: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)' }}>
                <div>
                  <p className="text-2xl font-bold" style={{ color: '#8b5cf6' }}>{restAnalytics.globalAvg}s</p>
                  <p className="text-xs" style={{ color: 'var(--color-text-2)' }}>promedio global</p>
                </div>
                <div className="ml-auto text-right">
                  {restAnalytics.globalAvg < 60 && (
                    <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
                      ⚡ Muy breve
                    </span>
                  )}
                  {restAnalytics.globalAvg >= 60 && restAnalytics.globalAvg < 90 && (
                    <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
                      💪 Rango hipertrofia
                    </span>
                  )}
                  {restAnalytics.globalAvg >= 90 && restAnalytics.globalAvg < 120 && (
                    <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
                      💪 Rango óptimo
                    </span>
                  )}
                  {restAnalytics.globalAvg >= 120 && restAnalytics.globalAvg < 180 && (
                    <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ backgroundColor: 'rgba(59,130,246,0.15)', color: '#3b82f6' }}>
                      🏋️ Rango fuerza
                    </span>
                  )}
                  {restAnalytics.globalAvg >= 180 && (
                    <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
                      🐌 Descanso largo
                    </span>
                  )}
                  <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-2)' }}>
                    {restAnalytics.globalAvg < 60
                      ? 'Los músculos necesitan ~60-90s para recuperación completa en hipertrofia'
                      : restAnalytics.globalAvg < 90
                      ? 'Buen descanso para maximizar hipertrofia (tensión mecánica prolongada)'
                      : restAnalytics.globalAvg < 120
                      ? 'Ideal para hipertrofia y transición a fuerza'
                      : restAnalytics.globalAvg < 180
                      ? 'Buen descanso para maximizar fuerza y síntesis proteica'
                      : 'Considera reducir a 90-120s para mayor densidad de entrenamiento'}
                  </p>
                </div>
              </div>

              {/* Per-muscle rest time breakdown */}
              {restAnalytics.perMuscle.length > 0 && (
                <div>
                  <p className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-2)' }}>
                    Descanso medio por grupo muscular
                  </p>
                  <div className="space-y-2">
                    {[...restAnalytics.perMuscle].sort((a, b) => b.avg - a.avg).slice(0, 6).map(({ muscle, avg }) => {
                      const muscleLabels: Record<string, string> = {
                        chest: 'Pecho', back: 'Espalda', legs: 'Piernas',
                        shoulders: 'Hombros', arms: 'Brazos', core: 'Core',
                        cardio: 'Cardio', full_body: 'Full Body',
                      };
                      // Coaching tip based on rest time for this muscle
                      let tip = '';
                      let tipColor = 'var(--color-text-2)';
                      if (avg >= 180) {
                        tip = '💡 Gran descanso para fuerza máxima — considera añadir más series';
                        tipColor = '#3b82f6';
                      } else if (avg >= 120) {
                        tip = '💪 Buen equilibrio fuerza/hipertrofia';
                        tipColor = '#22c55e';
                      } else if (avg >= 60) {
                        tip = '⚡ En rango de hipertrofia — músculo bien estimulado';
                        tipColor = '#22c55e';
                      } else if (avg > 0) {
                        tip = '⚡ Muy breve — asegúrate de completar todas las series planned';
                        tipColor = '#f59e0b';
                      }
                      const pct = restAnalytics.globalAvg > 0 ? Math.min(100, Math.round((avg / restAnalytics.globalAvg) * 100)) : 100;
                      const barColor = avg >= 120 ? '#3b82f6' : avg >= 60 ? '#22c55e' : '#f59e0b';
                      return (
                        <div key={muscle} className="flex items-center gap-2">
                          <span className="text-xs w-16 capitalize" style={{ color: 'var(--color-text-2)' }}>
                            {muscleLabels[muscle] || muscle}
                          </span>
                          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-surface-2)' }}>
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${pct}%`, backgroundColor: barColor }}
                            />
                          </div>
                          <span className="text-xs font-medium w-10 text-right" style={{ color: barColor }}>
                            {avg}s
                          </span>
                          <span className="text-[10px] w-10 text-right" style={{ color: tipColor }} title={tip}>
                            {tip.split('—')[0].trim()}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Most overloaded muscle group — warning card */}
            {restAnalytics.perMuscle.length > 0 && (() => {
              const longest = [...restAnalytics.perMuscle].sort((a, b) => b.avg - a.avg)[0];
              const muscleLabels: Record<string, string> = {
                chest: 'Pecho', back: 'Espalda', legs: 'Piernas',
                shoulders: 'Hombros', arms: 'Brazos', core: 'Core',
              };
              if (longest.avg < 120 || longest.count < 3) return null;
              return (
                <div
                  className="p-4 rounded-xl flex items-start gap-3"
                  style={{ backgroundColor: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)' }}
                >
                  <Lightbulb size={16} style={{ color: '#3b82f6', flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <p className="text-sm font-semibold" style={{ color: '#3b82f6' }}>
                      Gran descanso en {muscleLabels[longest.muscle] || longest.muscle}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-2)' }}>
                      {longest.avg >= 180
                        ? `Promedio ${longest.avg}s sobre ${longest.count} series. Este músculo se recupera lentamente — prioriza ejercicios compuestos primero en tu rutina.`
                        : `Promedio ${longest.avg}s sobre ${longest.count} series. Buen estímulo de fuerza para este grupo muscular.`}
                    </p>
                  </div>
                </div>
              );
            })()}
          </>
        )}

        {/* F117 — Workout time-of-day distribution */}
        {timeOfDayDistribution.length > 0 && (
          <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
            <h3 className="text-sm font-semibold mb-1">Hora del día</h3>
            <p className="text-xs mb-3" style={{ color: 'var(--color-text-2)' }}>Cuándo sueles entrenar</p>
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={100}>
                <PieChart>
                  <Pie
                    data={timeOfDayDistribution}
                    dataKey="count"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={22}
                    outerRadius={40}
                    strokeWidth={2}
                  >
                    {timeOfDayDistribution.map((entry) => {
                      const colors: Record<string, string> = {
                        morning: '#f59e0b',
                        afternoon: '#ef4444',
                        evening: '#8b5cf6',
                        night: '#3b82f6',
                      };
                      return <Cell key={entry.timeOfDay} fill={colors[entry.timeOfDay] || 'var(--color-primary)'} />;
                    })}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--color-surface-2)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '8px',
                      fontSize: 11,
                    }}
                    labelStyle={{ color: 'var(--color-text-2)' }}
                    formatter={(v: unknown) => [`${v} workout${v !== 1 ? 's' : ''}`, '']}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1">
                {timeOfDayDistribution.map(entry => {
                  const colors: Record<string, string> = {
                    morning: '#f59e0b',
                    afternoon: '#ef4444',
                    evening: '#8b5cf6',
                    night: '#3b82f6',
                  };
                  const total = timeOfDayDistribution.reduce((s, e) => s + e.count, 0);
                  const pct = Math.round((entry.count / total) * 100);
                  return (
                    <div key={entry.timeOfDay} className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: colors[entry.timeOfDay] || 'var(--color-primary)' }} />
                      <span className="text-xs" style={{ color: 'var(--color-text-2)' }}>{entry.label.split(' ')[0]}</span>
                      <span className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>{pct}%</span>
                      <span className="text-xs" style={{ color: 'var(--color-text-2)' }}>({entry.count})</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* F293 — Workout feel distribution */}
        {Object.values(feelDistribution).some(v => v > 0) && (
          <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
            <h3 className="text-sm font-semibold mb-1">Cómo te sentiste</h3>
            <p className="text-xs mb-3" style={{ color: 'var(--color-text-2)' }}>Distribución de etiquetas (últimos 30 días)</p>
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={100}>
                <PieChart>
                  <Pie
                    data={Object.entries(feelDistribution).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }))}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={22}
                    outerRadius={40}
                    strokeWidth={2}
                  >
                    {Object.entries(feelDistribution).filter(([, v]) => v > 0).map(([name]) => {
                      const colors: Record<string, string> = {
                        '💪 Strong': '#22c55e',
                        '😵 Hard': '#ef4444',
                        '😴 Easy': '#3b82f6',
                        '🔥 PR': '#f59e0b',
                      };
                      return <Cell key={name} fill={colors[name] || 'var(--color-primary)'} />;
                    })}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--color-surface-2)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '8px',
                      fontSize: 11,
                    }}
                    labelStyle={{ color: 'var(--color-text-2)' }}
                    formatter={(v: unknown) => [`${v} workout${v !== 1 ? 's' : ''}`, '']}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1">
                {Object.entries(feelDistribution).filter(([, v]) => v > 0).map(([name, count]) => {
                  const colors: Record<string, string> = {
                    '💪 Strong': '#22c55e',
                    '😵 Hard': '#ef4444',
                    '😴 Easy': '#3b82f6',
                    '🔥 PR': '#f59e0b',
                  };
                  const total = Object.values(feelDistribution).reduce((s, e) => s + e, 0);
                  const pct = Math.round((count / total) * 100);
                  return (
                    <div key={name} className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: colors[name] || 'var(--color-primary)' }} />
                      <span className="text-xs" style={{ color: 'var(--color-text-2)' }}>{name.split(' ')[0]}</span>
                      <span className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>{pct}%</span>
                      <span className="text-xs" style={{ color: 'var(--color-text-2)' }}>({count})</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* F75 — Top exercises by volume */}
        {topExercises.length > 0 && (
          <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
            <h3 className="text-sm font-semibold mb-1">Top ejercicios por volumen</h3>
            <p className="text-xs mb-3" style={{ color: 'var(--color-text-2)' }}> volumen total (últimos 365 días)</p>
            <ResponsiveContainer width="100%" height={Math.max(100, topExercises.length * 28)}>
              <BarChart data={topExercises} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--color-text-2)' }} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} />
                <YAxis type="category" dataKey="exercise_name" width={100} tick={{ fontSize: 10, fill: 'var(--color-text-2)' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px',
                    fontSize: 12,
                  }}
                  labelStyle={{ color: 'var(--color-text-2)' }}
                  formatter={(value: unknown) => [`${Number(value).toLocaleString()} kg`, 'Volumen']}
                />
                <Bar dataKey="total_volume" fill="var(--color-primary)" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Global PRs */}
        {allPRs.length > 0 && (
          <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Trophy size={14} style={{ color: 'var(--color-primary)' }} />
                <h3 className="text-sm font-semibold">Récords Personales</h3>
                {/* F4 — Total PR count badge */}
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded font-bold"
                  style={{ backgroundColor: 'rgba(250,204,21,0.15)', color: '#f59e0b' }}
                  title={`${allPRs.length} récord${allPRs.length !== 1 ? 's' : ''} en total`}
                >
                  {allPRs.length}
                </span>
              </div>
              <button
                onClick={handleExportPRs}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors"
                style={{
                  backgroundColor: prCopied ? 'var(--color-primary)' : 'var(--color-surface-2)',
                  color: prCopied ? '#000' : 'var(--color-text-2)',
                }}
                title="Copiar PRs al portapapeles"
              >
                <Copy size={12} />
                {prCopied ? '¡Copiado!' : 'Exportar'}
              </button>
            </div>
            {/* F160 — Muscle group filter tabs */}
            <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 scrollbar-hide">
              {[
                { key: 'all', label: 'Todos' },
                { key: 'chest', label: 'Pecho' },
                { key: 'back', label: 'Espalda' },
                { key: 'legs', label: 'Piernas' },
                { key: 'shoulders', label: 'Hombros' },
                { key: 'arms', label: 'Brazos' },
                { key: 'core', label: 'Core' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setPrMuscleFilter(key)}
                  className="px-2.5 py-1 rounded-full text-[10px] font-medium whitespace-nowrap transition-colors"
                  style={{
                    backgroundColor: prMuscleFilter === key ? 'var(--color-primary)' : 'var(--color-surface-2)',
                    color: prMuscleFilter === key ? '#000' : 'var(--color-text-2)',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {(() => {
              // Filter by muscle group (F160)
              const filteredPRs = prMuscleFilter === 'all'
                ? allPRs
                : allPRs.filter(pr => pr.muscle_group === prMuscleFilter);
              // Group by exercise
              const grouped: Record<string, typeof filteredPRs> = {};
              filteredPRs.forEach(pr => {
                if (!grouped[pr.exercise_id]) grouped[pr.exercise_id] = [];
                grouped[pr.exercise_id].push(pr);
              });
              const sorted = Object.values(grouped)
                .sort((a, b) => {
                  const aMax = Math.max(...a.map(r => r.type === 'estimated_1rm' ? r.value : 0));
                  const bMax = Math.max(...b.map(r => r.type === 'estimated_1rm' ? r.value : 0));
                  return bMax - aMax;
                })
                .slice(0, 10);
              if (sorted.length === 0) {
                return (
                  <p className="text-xs text-center py-3" style={{ color: 'var(--color-text-2)' }}>
                    Sin récords en {prMuscleFilter === 'all' ? 'este grupo' : prMuscleFilter}
                  </p>
                );
              }
              return sorted.map(group => {
                const weightPR = group.find(r => r.type === 'max_weight');
                const oneRMPR = group.find(r => r.type === 'estimated_1rm');
                const displayPR = oneRMPR || weightPR;
                if (!displayPR) return null;
                return (
                  <div key={group[0].exercise_id} className="flex items-center justify-between py-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{displayPR.exercise_name}</span>
                      <span className="text-xs" style={{ color: 'var(--color-text-2)' }}>
                        {format(new Date(displayPR.achieved_at), 'd MMM yyyy', { locale: es })}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      {weightPR && weightPR.value > 0 && (
                        <div className="flex flex-col items-end">
                          <span className="text-xs" style={{ color: 'var(--color-text-2)' }}>Peso</span>
                          <span className="text-sm font-semibold">{weightPR.value} kg</span>
                        </div>
                      )}
                      {oneRMPR && oneRMPR.value > 0 && (
                        <div className="flex flex-col items-end">
                          <span className="text-xs" style={{ color: 'var(--color-text-2)' }}>1RM</span>
                          <span className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>{oneRMPR.value} kg</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        )}

        {/* F148 — Max workout volume PR card */}
        {maxWorkoutVolume && (
          <button
            onClick={() => navigate(`/workout/${maxWorkoutVolume.workout_id}`)}
            className="w-full p-4 rounded-xl text-left hover:opacity-80 transition-opacity"
            style={{ backgroundColor: 'var(--color-surface)' }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Trophy size={14} style={{ color: 'var(--color-primary)' }} />
              <h3 className="text-sm font-semibold">Volumen máximo en un workout</h3>
            </div>
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-2xl font-bold" style={{ color: 'var(--color-primary)' }}>
                  {(maxWorkoutVolume.volume / 1000).toFixed(1)}k
                </span>
                <span className="text-sm ml-1" style={{ color: 'var(--color-text-2)' }}>kg</span>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium">{maxWorkoutVolume.workout_name}</p>
                <p className="text-xs" style={{ color: 'var(--color-text-2)' }}>
                  {format(new Date(maxWorkoutVolume.date), 'd MMM yyyy', { locale: es })}
                </p>
              </div>
            </div>
          </button>
        )}

        {/* Muscle balance — horizontal bar chart (F23) */}
        {(() => {
          const ALL_MUSCLES = ['chest', 'back', 'legs', 'shoulders', 'arms', 'core', 'cardio', 'full_body'];
          const muscleLabels: Record<string, string> = {
            chest: 'Pecho', back: 'Espalda', legs: 'Piernas', shoulders: 'Hombros',
            arms: 'Brazos', core: 'Core', cardio: 'Cardio', full_body: 'Full Body',
          };
          // Sort by volume descending
          const sorted = [...muscleVolume].sort((a, b) => b.volume - a.volume);
          const max = Math.max(...muscleVolume.map(m => m.volume), 1);

          // Unworked muscles: no volume in last `muscleAlertDays` days (F68)
          const todayStr = format(new Date(), 'yyyy-MM-dd');
          const overdue = ALL_MUSCLES.filter(m => {
            const lastWorked = muscleLastWorked[m];
            if (!lastWorked) return true; // never trained
            return differenceInDays(new Date(todayStr), new Date(lastWorked)) >= muscleAlertDays;
          });

          return (
            <>
              {/* Muscle Heatmap — F5 */}
              {sorted.length > 0 && (
                <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
                  <h3 className="text-sm font-semibold mb-3">
                    Mapa muscular (30 días)
                    {sorted.length > 0 && sorted[0].volume > 0 && (
                      <span className="ml-2 text-amber-400" title={`${muscleLabels[sorted[0].muscle] || sorted[0].muscle}: ${(sorted[0].volume/1000).toFixed(1)}k kg — más entrenado`}>
                        <Crown size={14} className="inline" />
                      </span>
                    )}
                  </h3>
                  <div className="grid grid-cols-4 gap-2">
                    {sorted.map(({ muscle, volume }) => {
                      const intensity = max > 0 ? volume / max : 0;
                      const bg = intensity > 0.7
                        ? 'var(--color-primary)'
                        : intensity > 0.4
                        ? '#3d2a00cc'
                        : intensity > 0
                        ? '#3d2a0066'
                        : 'var(--color-surface-2)';
                      const isTopMuscle = muscle === sorted[0].muscle && sorted[0].volume > 0;
                      return (
                        <div
                          key={muscle}
                          className="p-2 rounded-lg text-center"
                          style={{ backgroundColor: bg }}
                        >
                          <p
                            className="text-xs font-medium capitalize"
                            style={{ color: intensity > 0.4 ? '#000' : 'var(--color-text-2)', lineHeight: 1.2 }}
                          >
                            {isTopMuscle && <Crown size={9} className="inline mr-0.5 text-amber-400" />}
                            {(muscleLabels[muscle] || muscle)}
                          </p>
                          <p
                            className="text-[10px] mt-0.5"
                            style={{ color: intensity > 0.4 ? '#00000099' : 'var(--color-text-2)' }}
                          >
                            {(volume / 1000).toFixed(1)}k
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

                            {/* F239 — Muscle group radar chart (spider chart) */}
              {sorted.filter(m => ['chest','back','legs','shoulders','arms','core'].includes(m.muscle)).length >= 3 && (() => {
                const MAIN_MUSCLES = ['chest','back','legs','shoulders','arms','core'];
                // Build radar data: normalize each volume to 0-100 (max=100)
                const radarData = MAIN_MUSCLES.map(m => {
                  const entry = sorted.find(s => s.muscle === m);
                  return { muscle: m, volume: entry ? entry.volume : 0 };
                });
                const maxVol = Math.max(...radarData.map(d => d.volume), 1);
                const normalizedData = radarData.map(d => ({
                  ...d,
                  value: Math.round((d.volume / maxVol) * 100),
                  volumeKg: d.volume,
                }));
                return (
                  <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
                    <h3 className="text-sm font-semibold mb-1">Distribución muscular (30 días)</h3>
                    <p className="text-xs mb-3" style={{ color: 'var(--color-text-2)' }}>
                      Volumen total: <span className="font-semibold" style={{ color: 'var(--color-primary)' }}>
                        {(muscleVolume.reduce((acc, m) => acc + m.volume, 0) / 1000).toFixed(1)}k kg
                      </span>
                    </p>
                    <ResponsiveContainer width="100%" height={220}>
                      <RadarChart data={normalizedData} margin={{ top: 4, right: 24, bottom: 4, left: 24 }}>
                        <PolarGrid stroke="var(--color-border)" />
                        <PolarAngleAxis
                          dataKey="muscle"
                          tick={{ fontSize: 10, fill: 'var(--color-text)' }}
                          tickFormatter={m => ({ chest:'Pecho',back:'Espalda',legs:'Piernas',shoulders:'Hombros',arms:'Brazos',core:'Core' }[m as keyof typeof muscleLabels] || m as string)}
                        />
                        <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                        <Radar
                          name="Volumen"
                          dataKey="value"
                          stroke="var(--color-primary)"
                          fill="var(--color-primary)"
                          fillOpacity={0.25}
                          strokeWidth={2}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'var(--color-surface-2)',
                            border: '1px solid var(--color-border)',
                            borderRadius: '8px',
                            fontSize: 11,
                          }}
                          formatter={(v: unknown) => {
                            const entry = normalizedData.find(d => d.value === v);
                            return [`${entry ? entry.volumeKg.toLocaleString() : 0} kg`, 'Volumen'];
                          }}
                          labelFormatter={m => ({ chest:'Pecho',back:'Espalda',legs:'Piernas',shoulders:'Hombros',arms:'Brazos',core:'Core' }[String(m)] || String(m))}
                        />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                );
              })()}

{/* Bar chart — sorted by volume */}
              {sorted.length > 0 && (
                <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
                  <h3 className="text-sm font-semibold mb-1">Balance muscular (30 días)</h3>
                  <p className="text-xs mb-3" style={{ color: 'var(--color-text-2)' }}>
                    Volumen total: <span className="font-semibold" style={{ color: 'var(--color-primary)' }}>
                      {(muscleVolume.reduce((acc, m) => acc + m.volume, 0) / 1000).toFixed(1)}k kg
                    </span>
                  </p>
                  <ResponsiveContainer width="100%" height={Math.max(sorted.length * 36, 160)}>
                    <BarChart
                      data={sorted}
                      layout="vertical"
                      margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
                    >
                      <XAxis
                        type="number"
                        tick={{ fontSize: 9, fill: 'var(--color-text-2)' }}
                        tickFormatter={v => `${(v / 1000).toFixed(0)}k`}
                      />
                      <YAxis
                        type="category"
                        dataKey="muscle"
                        tick={{ fontSize: 11, fill: 'var(--color-text)' }}
                        tickFormatter={m => muscleLabels[m] || m}
                        width={70}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'var(--color-surface-2)',
                          border: '1px solid var(--color-border)',
                          borderRadius: '8px',
                          fontSize: 11,
                        }}
                        formatter={(v: unknown) => [`${Number(v).toLocaleString()} kg`, 'Volumen']}
                        labelFormatter={m => muscleLabels[m as string] || m}
                      />
                      <Bar dataKey="volume" radius={[0, 4, 4, 0]}>
                        {sorted.map((entry) => {
                          const intensity = entry.volume / max;
                          const bg = intensity > 0.7 ? 'var(--color-primary)'
                            : intensity > 0.4 ? '#3d2a00cc'
                            : intensity > 0 ? '#3d2a0066'
                            : 'var(--color-surface-2)';
                          return <Cell key={entry.muscle} fill={bg} />;
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Muscle group frequency alert (F68 — configurable threshold) */}
              {overdue.length > 0 && (
                <div
                  className="p-4 rounded-xl flex items-start gap-3"
                  style={{ backgroundColor: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.3)' }}
                >
                  <TrendingUp size={16} style={{ color: '#eab308', flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <p className="text-sm font-semibold" style={{ color: '#eab308' }}>
                      Músculos sin trabajar ({muscleAlertDays} días)
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-2)' }}>
                      {overdue.map(m => {
                        const last = muscleLastWorked[m];
                        const days = last ? differenceInDays(new Date(todayStr), new Date(last)) : null;
                        return `${muscleLabels[m]}${days !== null ? ` (${days}d)` : ' (nunca)'}`;
                      }).join(', ')}
                    </p>
                  </div>
                </div>
              )}

              {/* F151 — Muscle balance nudge card: suggest an exercise for the most overdue muscle */}
              {(() => {
                if (!suggestedExercise || nudgeDismissed) return null;
                const { name: exName, muscle } = suggestedExercise;
                const daysSince = muscleLastWorked[muscle]
                  ? differenceInDays(new Date(todayStr), new Date(muscleLastWorked[muscle]))
                  : null;
                return (
                  <div
                    className="p-4 rounded-xl flex items-start gap-3"
                    style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)' }}
                  >
                    <Lightbulb size={16} style={{ color: '#3b82f6', flexShrink: 0, marginTop: 2 }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold" style={{ color: '#3b82f6' }}>
                        Entrenar {muscleLabels[muscle] || muscle}
                        {daysSince !== null ? ` (sin trabajar ${daysSince}d)` : ' (nunca)'}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-2)' }}>
                        Prueba: <span className="font-medium" style={{ color: 'var(--color-text)' }}>{exName}</span>
                      </p>
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => navigate(`/exercises?muscle=${muscle}`)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                          style={{ backgroundColor: '#3b82f6', color: '#fff' }}
                        >
                          Ver ejercicios
                        </button>
                        <button
                          onClick={() => {
                            const db = getDb();
                            if (!db || !suggestedExercise) return;
                            const lastSets = getLastExerciseSets(db, suggestedExercise.exercise_id);
                            if (activeWorkout) {
                              addExerciseToWorkout(suggestedExercise.exercise_id, suggestedExercise.name, undefined, lastSets, '');
                              navigate('/workouts');
                            } else {
                              startWorkout('Workout');
                              setTimeout(() => {
                                const _db = getDb();
                                if (!_db) return;
                                const ls = getLastExerciseSets(_db, suggestedExercise.exercise_id);
                                addExerciseToWorkout(suggestedExercise.exercise_id, suggestedExercise.name, undefined, ls, '');
                                navigate('/workouts');
                              }, 50);
                            }
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                          style={{ backgroundColor: 'var(--color-primary)', color: '#000' }}
                        >
                          Iniciar workout
                        </button>
                      </div>
                    </div>
                    <button
                      onClick={() => setNudgeDismissed(true)}
                      className="p-1 flex-shrink-0"
                      style={{ color: 'var(--color-text-2)' }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                );
              })()}

              {/* F164 — Muscle Recovery Status */}
              {(() => {
                const ALL_MUSCLES = ['chest', 'back', 'legs', 'shoulders', 'biceps', 'triceps', 'core'];
                const muscleLabels: Record<string, string> = {
                  chest: 'Pecho', back: 'Espalda', legs: 'Piernas', shoulders: 'Hombros',
                  biceps: 'Bíceps', triceps: 'Tríceps', core: 'Core',
                };
                const todayStr = format(new Date(), 'yyyy-MM-dd');

                type RecoveryStatus = 'recovering' | 'optimal' | 'ready' | 'dormant';
                interface MuscleRecovery {
                  muscle: string;
                  label: string;
                  daysSince: number | null;
                  status: RecoveryStatus;
                  statusLabel: string;
                }

                const recoveries: MuscleRecovery[] = ALL_MUSCLES.map(m => {
                  const lastWorked = muscleLastWorked[m];
                  const daysSince = lastWorked
                    ? differenceInDays(new Date(todayStr), new Date(lastWorked))
                    : null;
                  let status: RecoveryStatus;
                  let statusLabel: string;
                  if (daysSince === null) {
                    status = 'dormant';
                    statusLabel = 'Sin datos';
                  } else if (daysSince <= 2) {
                    status = 'recovering';
                    statusLabel = 'Recuperando';
                  } else if (daysSince <= 4) {
                    status = 'optimal';
                    statusLabel = 'Óptimo';
                  } else if (daysSince <= 7) {
                    status = 'ready';
                    statusLabel = 'Listo';
                  } else {
                    status = 'dormant';
                    statusLabel = daysSince + 'd sin entrenar';
                  }
                  return { muscle: m, label: muscleLabels[m] || m, daysSince, status, statusLabel };
                });

                const readyMuscles = recoveries.filter(r => r.status === 'optimal' || r.status === 'ready');
                const recoveringMuscles = recoveries.filter(r => r.status === 'recovering');

                const statusColors: Record<RecoveryStatus, { bg: string; text: string; dot: string }> = {
                  recovering: { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444', dot: '#ef4444' },
                  optimal: { bg: 'rgba(59, 130, 246, 0.15)', text: '#3b82f6', dot: '#3b82f6' },
                  ready: { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981', dot: '#10b981' },
                  dormant: { bg: 'rgba(107, 114, 128, 0.15)', text: '#6b7280', dot: '#6b7280' },
                };

                return (
                  <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
                    <div className="flex items-center gap-2 mb-3">
                      <TrendingUp size={14} style={{ color: 'var(--color-primary)' }} />
                      <h3 className="text-sm font-semibold">Estado de recuperación muscular</h3>
                    </div>

                    {readyMuscles.length > 0 && (
                      <div
                        className="mb-3 px-3 py-2 rounded-lg text-xs"
                        style={{ backgroundColor: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)' }}
                      >
                        <span style={{ color: '#10b981', fontWeight: 600 }}>Músculos listos para entrenar: </span>
                        <span style={{ color: 'var(--color-text)' }}>
                          {readyMuscles.map(r => r.label).join(', ')}
                        </span>
                      </div>
                    )}
                    {recoveringMuscles.length > 0 && recoveringMuscles.length === ALL_MUSCLES.length && (
                      <div
                        className="mb-3 px-3 py-2 rounded-lg text-xs"
                        style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)' }}
                      >
                        <span style={{ color: '#ef4444', fontWeight: 600 }}>Todos los músculos en recuperación. </span>
                        <span style={{ color: 'var(--color-text-2)' }}>Descansa o enfócate en músculos listos.</span>
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-2">
                      {recoveries.map(({ muscle, label, daysSince, status, statusLabel }) => {
                        const colors = statusColors[status];
                        return (
                          <div
                            key={muscle}
                            className="p-2.5 rounded-xl"
                            style={{ backgroundColor: colors.bg }}
                          >
                            <div className="flex items-center gap-1.5 mb-1">
                              <span
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ backgroundColor: colors.dot }}
                              />
                              <span className="text-xs font-semibold capitalize" style={{ color: 'var(--color-text)' }}>
                                {label}
                              </span>
                            </div>
                            <p className="text-[10px]" style={{ color: colors.text, fontWeight: 600 }}>
                              {statusLabel}
                            </p>
                            {daysSince !== null && (
                              <p className="text-[9px] mt-0.5" style={{ color: 'var(--color-text-2)' }}>
                                hace {daysSince}d
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex flex-wrap gap-2 mt-3 justify-center">
                      {(['recovering', 'optimal', 'ready', 'dormant'] as RecoveryStatus[]).map(s => {
                        const c = statusColors[s];
                        return (
                          <div key={s} className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.dot }} />
                            <span className="text-[9px]" style={{ color: 'var(--color-text-2)' }}>
                              {s === 'recovering' ? 'Recuperando (0-2d)' :
                               s === 'optimal' ? 'Óptimo (3-4d)' :
                               s === 'ready' ? 'Listo (5-7d)' : 'Sin entrenar (8d+)'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </>
          );
        })()}
        {/* Recent workouts */}
        <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
          <h3 className="text-sm font-semibold mb-3">Últimos workouts</h3>
          {recentWorkouts.length === 0 ? (
            <p className="text-sm text-center py-4" style={{ color: 'var(--color-text-2)' }}>
              Sin workouts en los últimos 30 días
            </p>
          ) : (
            <div className="space-y-2">
              {recentWorkouts.slice(0, 10).map(w => (
                <div key={w.id} className="flex items-center justify-between">
                  <span className="text-sm">{w.name}</span>
                  <span className="text-xs" style={{ color: 'var(--color-text-2)' }}>
                    {format(new Date(w.started_at), "d MMM", { locale: es })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
