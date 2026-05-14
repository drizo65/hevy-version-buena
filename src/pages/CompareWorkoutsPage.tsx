import { useState, useEffect, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, Weight, Dumbbell, TrendingUp, GitCompare } from 'lucide-react';
import { getDb } from '../database/init';
import { getWorkoutById, getWorkoutSets, getExercisesByIdsAll } from '../database/queries';
import EmptyState from '../components/ui/EmptyState';
import type { Workout, WorkoutSet } from '../types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface ExerciseGroup {
  exerciseId: string;
  name: string;
  muscleGroup: string;
  setsA: WorkoutSet[];
  setsB: WorkoutSet[];
  volumeA: number;
  volumeB: number;
  maxWeightA: number;
  maxWeightB: number;
  totalRepsA: number;
  totalRepsB: number;
}

export default function CompareWorkoutsPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const idA = searchParams.get('a');
  const idB = searchParams.get('b');

  const [workoutA, setWorkoutA] = useState<Workout | null>(null);
  const [workoutB, setWorkoutB] = useState<Workout | null>(null);
  const [setsA, setSetsA] = useState<WorkoutSet[]>([]);
  const [setsB, setSetsB] = useState<WorkoutSet[]>([]);
  const [exerciseNames, setExerciseNames] = useState<Record<string, { name: string; muscle_group: string }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!idA || !idB) {
      flushSync(() => {
        setError('Faltan parámetros de comparación');
        setLoading(false);
      });
      return;
    }
    const db = getDb();
    if (!db) { flushSync(() => setLoading(false)); return; }

    const wA = getWorkoutById(db, idA);
    const wB = getWorkoutById(db, idB);
    if (!wA || !wB) {
      flushSync(() => {
        setError('Uno o ambos workouts no fueron encontrados');
        setLoading(false);
      });
      return;
    }

    const sA = getWorkoutSets(db, idA);
    const sB = getWorkoutSets(db, idB);
    flushSync(() => {
      setWorkoutA(wA);
      setWorkoutB(wB);
      setSetsA(sA);
      setSetsB(sB);
    });

    // Collect all exercise IDs from both workouts
    const allIds = [...new Set([...sA.map((s: WorkoutSet) => s.exercise_id), ...sB.map((s: WorkoutSet) => s.exercise_id)])];
    const names = getExercisesByIdsAll(db, allIds);
    flushSync(() => {
      setExerciseNames(names);
      setLoading(false);
    });
  }, [idA, idB]);

  // Group sets by exercise for both workouts
  const grouped = useMemo<ExerciseGroup[]>(() => {
    if (!setsA.length && !setsB.length) return [];

    // Collect all exercise IDs
    const allExerciseIds = new Set<string>();
    setsA.forEach(s => allExerciseIds.add(s.exercise_id));
    setsB.forEach(s => allExerciseIds.add(s.exercise_id));

    const groups: ExerciseGroup[] = [];

    allExerciseIds.forEach(exId => {
      const nameMap = exerciseNames[exId];
      const setsForA = setsA.filter(s => s.exercise_id === exId).sort((a, b) => a.completed_at.localeCompare(b.completed_at));
      const setsForB = setsB.filter(s => s.exercise_id === exId).sort((a, b) => a.completed_at.localeCompare(b.completed_at));

      const volumeA = setsForA.reduce((sum, s) => sum + s.weight * s.reps, 0);
      const volumeB = setsForB.reduce((sum, s) => sum + s.weight * s.reps, 0);
      const maxWeightA = setsForA.length > 0 ? Math.max(...setsForA.map(s => s.weight)) : 0;
      const maxWeightB = setsForB.length > 0 ? Math.max(...setsForB.map(s => s.weight)) : 0;
      const totalRepsA = setsForA.reduce((sum, s) => sum + s.reps, 0);
      const totalRepsB = setsForB.reduce((sum, s) => sum + s.reps, 0);

      groups.push({
        exerciseId: exId,
        name: nameMap?.name ?? 'Ejercicio desconocido',
        muscleGroup: nameMap?.muscle_group ?? '',
        setsA: setsForA,
        setsB: setsForB,
        volumeA,
        volumeB,
        maxWeightA,
        maxWeightB,
        totalRepsA,
        totalRepsB,
      });
    });

    // Sort by total volume (descending)
    return groups.sort((a, b) => (b.volumeA + b.volumeB) - (a.volumeA + a.volumeB));
  }, [setsA, setsB, exerciseNames]);

  // Summary stats
  const statsA = useMemo(() => {
    if (!workoutA) return { volume: 0, duration: 0, setCount: 0, exerciseCount: 0 };
    const volume = setsA.reduce((sum, s) => sum + s.weight * s.reps, 0);
    const duration = workoutA.duration_seconds || 0;
    const setCount = setsA.filter(s => s.set_type === 'normal').length;
    const exerciseCount = new Set(setsA.map(s => s.exercise_id)).size;
    return { volume, duration, setCount, exerciseCount };
  }, [workoutA, setsA]);

  const statsB = useMemo(() => {
    if (!workoutB) return { volume: 0, duration: 0, setCount: 0, exerciseCount: 0 };
    const volume = setsB.reduce((sum, s) => sum + s.weight * s.reps, 0);
    const duration = workoutB.duration_seconds || 0;
    const setCount = setsB.filter(s => s.set_type === 'normal').length;
    const exerciseCount = new Set(setsB.map(s => s.exercise_id)).size;
    return { volume, duration, setCount, exerciseCount };
  }, [workoutB, setsB]);

  const formatDuration = (seconds: number) => {
    if (seconds === 0) return '--';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const formatDate = (iso: string) => {
    try {
      return format(new Date(iso), "d 'de' MMM yyyy", { locale: es });
    } catch { return '--'; }
  };

  const getWinner = (a: number, b: number) => {
    if (a === b) return null;
    return a > b ? 'A' : 'B';
  };

  const getMuscleColor = (mg: string) => {
    const colors: Record<string, string> = {
      chest: '#ef4444', back: '#3b82f6', legs: '#10b981',
      shoulders: '#f59e0b', arms: '#8b5cf6', core: '#06b6d4',
      cardio: '#ec4899', full_body: '#6366f1',
    };
    return colors[mg] || 'var(--color-text-2)';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-bg)' }}>
        <p className="text-sm" style={{ color: 'var(--color-text-2)' }}>Cargando comparación...</p>
      </div>
    );
  }

  if (error || !workoutA || !workoutB) {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--color-bg)' }}>
        <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg" style={{ backgroundColor: 'var(--color-surface-2)' }}>
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-base font-bold">Comparar workouts</h1>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <EmptyState icon={<GitCompare size={32} />} title={error || 'Error cargando workouts'} description="" />
        </div>
      </div>
    );
  }

  const volWinner = getWinner(statsA.volume, statsB.volume);
  const durWinner = getWinner(statsA.duration, statsB.duration);
  const setsWinner = getWinner(statsA.setCount, statsB.setCount);

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-bg)' }}>
      {/* Header */}
      <div className="px-4 py-3 border-b flex items-center gap-3" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
        <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg" style={{ backgroundColor: 'var(--color-surface-2)' }}>
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold truncate">Comparar workouts</h1>
        </div>
      </div>

      {/* Workout labels */}
      <div className="px-4 py-3 grid grid-cols-2 gap-3">
        {[{ w: workoutA, s: statsA, label: 'A', color: 'var(--color-primary)' },
          { w: workoutB, s: statsB, label: 'B', color: '#f59e0b' }].map(({ w, s, label, color }) => (
          <div key={label} className="rounded-xl p-3" style={{ backgroundColor: 'var(--color-surface)', border: `2px solid ${color}40` }}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: color, color: '#000' }}>
                {label}
              </div>
              <span className="text-sm font-bold truncate">{w.name}</span>
            </div>
            <p className="text-xs mb-2" style={{ color: 'var(--color-text-2)' }}>{formatDate(w.started_at)}</p>
            {/* Summary row */}
            <div className="grid grid-cols-2 gap-1">
              <div className="flex items-center gap-1">
                <Weight size={11} style={{ color: 'var(--color-text-2)' }} />
                <span className="text-xs font-medium">{(s.volume / 1000).toFixed(1)}k kg</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock size={11} style={{ color: 'var(--color-text-2)' }} />
                <span className="text-xs font-medium">{formatDuration(s.duration)}</span>
              </div>
              <div className="flex items-center gap-1">
                <Dumbbell size={11} style={{ color: 'var(--color-text-2)' }} />
                <span className="text-xs font-medium">{s.setCount} series</span>
              </div>
              <div className="flex items-center gap-1">
                <TrendingUp size={11} style={{ color: 'var(--color-text-2)' }} />
                <span className="text-xs font-medium">{s.exerciseCount} ejs</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Overall comparison bar */}
      <div className="mx-4 mb-4 p-3 rounded-xl" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--color-text-2)' }}>
          Resumen general
        </h2>
        <div className="space-y-2">
          {/* Volume */}
          <div className="flex items-center gap-3">
            <div className="w-16 text-xs font-medium text-right" style={{ color: volWinner === 'A' ? 'var(--color-primary)' : volWinner === 'B' ? '#f59e0b' : 'var(--color-text-2)' }}>
              {volWinner && (volWinner === 'A' ? '↑ A' : '↑ B')}
            </div>
            <div className="flex-1 flex items-center gap-2">
              <span className="text-xs font-medium w-12">Volumen</span>
              <div className="flex-1 h-5 rounded-full overflow-hidden flex" style={{ backgroundColor: 'var(--color-surface-2)' }}>
                {statsA.volume + statsB.volume > 0 && (
                  <>
                    <div style={{ width: `${(statsA.volume / (statsA.volume + statsB.volume)) * 100}%`, backgroundColor: 'var(--color-primary)' }} className="h-full transition-all" />
                    <div style={{ width: `${(statsB.volume / (statsA.volume + statsB.volume)) * 100}%`, backgroundColor: '#f59e0b' }} className="h-full transition-all" />
                  </>
                )}
              </div>
              <span className="text-xs font-bold w-16" style={{ color: volWinner === 'A' ? 'var(--color-primary)' : volWinner === 'B' ? '#f59e0b' : 'var(--color-text-2)' }}>
                {(statsA.volume / 1000).toFixed(1)}k vs {(statsB.volume / 1000).toFixed(1)}k
              </span>
            </div>
          </div>
          {/* Duration */}
          <div className="flex items-center gap-3">
            <div className="w-16 text-xs font-medium text-right" style={{ color: durWinner === 'A' ? 'var(--color-primary)' : durWinner === 'B' ? '#f59e0b' : 'var(--color-text-2)' }}>
              {durWinner && (durWinner === 'A' ? '↑ A' : '↑ B')}
            </div>
            <div className="flex-1 flex items-center gap-2">
              <span className="text-xs font-medium w-12">Duración</span>
              <div className="flex-1 h-5 rounded-full overflow-hidden flex" style={{ backgroundColor: 'var(--color-surface-2)' }}>
                {statsA.duration + statsB.duration > 0 && (
                  <>
                    <div style={{ width: `${(statsA.duration / (statsA.duration + statsB.duration)) * 100}%`, backgroundColor: 'var(--color-primary)' }} className="h-full transition-all" />
                    <div style={{ width: `${(statsB.duration / (statsA.duration + statsB.duration)) * 100}%`, backgroundColor: '#f59e0b' }} className="h-full transition-all" />
                  </>
                )}
              </div>
              <span className="text-xs font-bold w-16" style={{ color: durWinner === 'A' ? 'var(--color-primary)' : durWinner === 'B' ? '#f59e0b' : 'var(--color-text-2)' }}>
                {formatDuration(statsA.duration)} vs {formatDuration(statsB.duration)}
              </span>
            </div>
          </div>
          {/* Sets */}
          <div className="flex items-center gap-3">
            <div className="w-16 text-xs font-medium text-right" style={{ color: setsWinner === 'A' ? 'var(--color-primary)' : setsWinner === 'B' ? '#f59e0b' : 'var(--color-text-2)' }}>
              {setsWinner && (setsWinner === 'A' ? '↑ A' : '↑ B')}
            </div>
            <div className="flex-1 flex items-center gap-2">
              <span className="text-xs font-medium w-12">Series</span>
              <div className="flex-1 h-5 rounded-full overflow-hidden flex" style={{ backgroundColor: 'var(--color-surface-2)' }}>
                {statsA.setCount + statsB.setCount > 0 && (
                  <>
                    <div style={{ width: `${(statsA.setCount / (statsA.setCount + statsB.setCount)) * 100}%`, backgroundColor: 'var(--color-primary)' }} className="h-full transition-all" />
                    <div style={{ width: `${(statsB.setCount / (statsA.setCount + statsB.setCount)) * 100}%`, backgroundColor: '#f59e0b' }} className="h-full transition-all" />
                  </>
                )}
              </div>
              <span className="text-xs font-bold w-16" style={{ color: setsWinner === 'A' ? 'var(--color-primary)' : setsWinner === 'B' ? '#f59e0b' : 'var(--color-text-2)' }}>
                {statsA.setCount} vs {statsB.setCount}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Exercise comparison */}
      <div className="px-4 pb-8">
        <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--color-text-2)' }}>
          Comparación por ejercicio
        </h2>
        <div className="space-y-3">
          {grouped.map(group => {
            const volWin = getWinner(group.volumeA, group.volumeB);
            const wtWin = getWinner(group.maxWeightA, group.maxWeightB);
            const repsWin = getWinner(group.totalRepsA, group.totalRepsB);
            const muscleColor = getMuscleColor(group.muscleGroup);

            return (
              <div key={group.exerciseId} className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                {/* Exercise header */}
                <div className="px-3 py-2.5 flex items-center gap-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: muscleColor }} />
                  <span className="text-sm font-semibold flex-1 min-w-0 truncate">{group.name}</span>
                  <span className="text-xs capitalize px-1.5 py-0.5 rounded" style={{ backgroundColor: `${muscleColor}20`, color: muscleColor }}>
                    {group.muscleGroup}
                  </span>
                </div>

                {/* Sets comparison */}
                <div className="p-3">
                  {/* Column headers */}
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div className="flex items-center gap-1.5">
                      <div className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold" style={{ backgroundColor: 'var(--color-primary)', color: '#000' }}>A</div>
                      <span className="text-xs font-semibold" style={{ color: 'var(--color-primary)' }}>Workout A</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold" style={{ backgroundColor: '#f59e0b', color: '#000' }}>B</div>
                      <span className="text-xs font-semibold" style={{ color: '#f59e0b' }}>Workout B</span>
                    </div>
                  </div>

                  {/* Stats per exercise */}
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div className="p-2 rounded-lg space-y-1" style={{ backgroundColor: 'var(--color-surface-2)' }}>
                      {/* Volume A */}
                      <div className="flex items-center justify-between">
                        <span className="text-[10px]" style={{ color: 'var(--color-text-2)' }}>Volumen</span>
                        <div className="flex items-center gap-1">
                          <Weight size={9} style={{ color: volWin === 'A' ? 'var(--color-primary)' : 'var(--color-text-2)' }} />
                          <span className="text-xs font-bold" style={{ color: volWin === 'A' ? 'var(--color-primary)' : 'var(--color-text-2)' }}>
                            {group.volumeA > 0 ? `${(group.volumeA / 1000).toFixed(1)}k` : '--'}
                          </span>
                        </div>
                      </div>
                      {/* Max weight A */}
                      <div className="flex items-center justify-between">
                        <span className="text-[10px]" style={{ color: 'var(--color-text-2)' }}>Peso máx</span>
                        <span className="text-xs font-bold" style={{ color: wtWin === 'A' ? 'var(--color-primary)' : 'var(--color-text-2)' }}>
                          {group.maxWeightA > 0 ? `${group.maxWeightA}kg` : '--'}
                        </span>
                      </div>
                      {/* Reps A */}
                      <div className="flex items-center justify-between">
                        <span className="text-[10px]" style={{ color: 'var(--color-text-2)' }}>Reps total</span>
                        <span className="text-xs font-bold" style={{ color: repsWin === 'A' ? 'var(--color-primary)' : 'var(--color-text-2)' }}>
                          {group.totalRepsA > 0 ? group.totalRepsA : '--'}
                        </span>
                      </div>
                    </div>

                    <div className="p-2 rounded-lg space-y-1" style={{ backgroundColor: 'var(--color-surface-2)' }}>
                      {/* Volume B */}
                      <div className="flex items-center justify-between">
                        <span className="text-[10px]" style={{ color: 'var(--color-text-2)' }}>Volumen</span>
                        <div className="flex items-center gap-1">
                          <Weight size={9} style={{ color: volWin === 'B' ? '#f59e0b' : 'var(--color-text-2)' }} />
                          <span className="text-xs font-bold" style={{ color: volWin === 'B' ? '#f59e0b' : 'var(--color-text-2)' }}>
                            {group.volumeB > 0 ? `${(group.volumeB / 1000).toFixed(1)}k` : '--'}
                          </span>
                        </div>
                      </div>
                      {/* Max weight B */}
                      <div className="flex items-center justify-between">
                        <span className="text-[10px]" style={{ color: 'var(--color-text-2)' }}>Peso máx</span>
                        <span className="text-xs font-bold" style={{ color: wtWin === 'B' ? '#f59e0b' : 'var(--color-text-2)' }}>
                          {group.maxWeightB > 0 ? `${group.maxWeightB}kg` : '--'}
                        </span>
                      </div>
                      {/* Reps B */}
                      <div className="flex items-center justify-between">
                        <span className="text-[10px]" style={{ color: 'var(--color-text-2)' }}>Reps total</span>
                        <span className="text-xs font-bold" style={{ color: repsWin === 'B' ? '#f59e0b' : 'var(--color-text-2)' }}>
                          {group.totalRepsB > 0 ? group.totalRepsB : '--'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Set-by-set detail */}
                  {group.setsA.length > 0 || group.setsB.length > 0 ? (
                    <div className="mt-2 pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
                      <div className="grid grid-cols-2 gap-2">
                        {/* Sets A */}
                        <div className="space-y-1">
                          {group.setsA.filter(s => s.set_type !== 'warmup').length === 0 && (
                            <p className="text-[10px] text-center py-1" style={{ color: 'var(--color-text-2)' }}>Sin series</p>
                          )}
                          {group.setsA.filter(s => s.set_type !== 'warmup').map((s, i) => (
                            <div key={s.id || i} className="flex items-center gap-1.5 text-[10px]">
                              <span className="w-4 text-right font-medium opacity-60">{i + 1}.</span>
                              <span className="font-semibold" style={{ color: wtWin === 'A' ? 'var(--color-primary)' : 'var(--color-text)' }}>
                                {s.weight} kg × {s.reps}
                              </span>
                              {s.rpe != null && <span className="opacity-60">@{s.rpe}</span>}
                              {s.set_type !== 'normal' && (
                                <span className="text-[9px] px-1 rounded" style={{ backgroundColor: 'var(--color-surface)' }}>{s.set_type}</span>
                              )}
                            </div>
                          ))}
                        </div>
                        {/* Sets B */}
                        <div className="space-y-1">
                          {group.setsB.filter(s => s.set_type !== 'warmup').length === 0 && (
                            <p className="text-[10px] text-center py-1" style={{ color: 'var(--color-text-2)' }}>Sin series</p>
                          )}
                          {group.setsB.filter(s => s.set_type !== 'warmup').map((s, i) => (
                            <div key={s.id || i} className="flex items-center gap-1.5 text-[10px]">
                              <span className="w-4 text-right font-medium opacity-60">{i + 1}.</span>
                              <span className="font-semibold" style={{ color: wtWin === 'B' ? '#f59e0b' : 'var(--color-text)' }}>
                                {s.weight} kg × {s.reps}
                              </span>
                              {s.rpe != null && <span className="opacity-60">@{s.rpe}</span>}
                              {s.set_type !== 'normal' && (
                                <span className="text-[9px] px-1 rounded" style={{ backgroundColor: 'var(--color-surface)' }}>{s.set_type}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
