/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { Search, Star, Plus, PlusCircle, Shuffle, ListPlus, Trophy, ArrowUpDown } from 'lucide-react';
import EmptyState from '../components/ui/EmptyState';
import { format } from 'date-fns';
import { formatLastPerformed, getLastPerformedColor } from '../utils/dateUtils';
import { es } from 'date-fns/locale';
import { useExerciseStore } from '../store/exerciseStore';
import { useWorkoutStore } from '../store/workoutStore';
import { getAllExercises, getExercisesByMuscle, searchExercises, getLastExerciseSets, getSimilarExercisesAll, getLastExerciseNotes, getLastPerformedDates, getExerciseStatsAll, getLastWeightPerExerciseAll, getExerciseFrequencyAll, getAllExerciseDifficultiesMap, getMuscleLastWorked, getLastExerciseNotesAll } from '../database/queries';
import { getDb } from '../database/init';
import type { Exercise, MuscleGroup, Equipment } from '../types';

const EQUIPMENT_LABELS: Record<Equipment, string> = {
  barbell: 'Barra',
  dumbbell: 'Mancuernas',
  machine: 'Máquina',
  cable: 'Cable',
  bodyweight: 'Bodyweight',
  kettlebell: 'Kettlebell',
  bands: 'Bandas',
  other: 'Otro',
};

const muscleGroups: { key: MuscleGroup | 'all' | 'custom' | 'favorites'; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'chest', label: 'Pecho' },
  { key: 'back', label: 'Espalda' },
  { key: 'legs', label: 'Piernas' },
  { key: 'shoulders', label: 'Hombros' },
  { key: 'arms', label: 'Brazos' },
  { key: 'core', label: 'Core' },
  { key: 'cardio', label: 'Cardio' },
  { key: 'full_body', label: 'Full Body' },
  { key: 'custom', label: '⭐ Personalizados' },
  { key: 'favorites', label: '★ Favoritos' },
];

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

const muscleColors: Record<string, string> = {
  chest: '#ef4444',
  back: '#3b82f6',
  legs: '#10b981',
  shoulders: '#f59e0b',
  arms: '#8b5cf6',
  core: '#06b6d4',
  cardio: '#ec4899',
  full_body: '#6b7280',
};

export default function ExercisesPage() {
  const { exercises, setExercises, favorites, toggleFavorite } = useExerciseStore();
  const { activeWorkout, addExerciseToWorkout } = useWorkoutStore();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // F131 — Initialize selectedMuscle from URL param (e.g. ?muscle=legs from ProgressPage nudge)
  const initialMuscle = searchParams.get('muscle');
  const [selectedMuscle, setSelectedMuscle] = useState<MuscleGroup | 'all' | 'custom' | 'favorites'>(() => {
    if (initialMuscle && ['chest','back','legs','shoulders','arms','core','cardio','full_body','all'].includes(initialMuscle)) {
      return initialMuscle as MuscleGroup | 'all';
    }
    return 'all';
  });
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | 'all'>(() => {
    const eq = searchParams.get('equipment');
    if (eq && ['barbell','dumbbell','machine','cable','bodyweight','kettlebell','bands','other','all'].includes(eq)) {
      return eq as Equipment | 'all';
    }
    return 'all';
  });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [similarExercises, setSimilarExercises] = useState<Record<string, Exercise[]>>({});
  const [lastPerformedDates, setLastPerformedDates] = useState<Record<string, string>>({});
  // F60 — Ref para auto-focus del buscador
  const searchInputRef = useRef<HTMLInputElement>(null);
  const location = useLocation();
  // F106 — Show keyboard shortcut hint for 3s on page load
  const [showHint, setShowHint] = useState(true);
  // F139 — Batch exercise stats for quick-stats in expanded view
  const [exerciseStats, setExerciseStats] = useState<Record<string, { maxWeight: number; workoutCount: number; bestSet: { weight: number; reps: number } | null }>>({});
  // F172 — Batch last weight per exercise (weight chip on cards when workout is active)
  const [lastWeights, setLastWeights] = useState<Record<string, { weight: number; reps: number }>>({});
  // F174 — Batch workout frequency per exercise in last 30 days (frequency bar on cards)
  const [exerciseFrequency, setExerciseFrequency] = useState<Record<string, number>>({});
  // F180 — Batch exercise difficulty ratings (dots on cards)
  const [exerciseDifficulties, setExerciseDifficulties] = useState<Record<string, number>>({});
  // F251 — Batch muscle last-worked dates (traffic light on muscle group dot)
  const [muscleLastWorked, setMuscleLastWorked] = useState<Record<string, string>>({});
  // F338 — Pre-compute days-since for each muscle group (avoid impure Date.now() in render)
  const muscleDaysMap = useMemo(() => {
    const now = Date.now(); // eslint-disable-line react-hooks/purity
    const map: Record<string, number> = {};
    for (const [mg, last] of Object.entries(muscleLastWorked)) {
      map[mg] = Math.floor((now - new Date(last).getTime()) / 86400000);
    }
    return map;
  }, [muscleLastWorked]);
  // F325 — Batch last exercise notes (📝 indicator on cards)
  const [exerciseNotes, setExerciseNotes] = useState<Record<string, string>>({});
  // F281 — Exercise list sort order
  const [sortOrder, setSortOrder] = useState<'alpha' | 'muscle' | 'equipment' | 'frequency' | 'difficulty'>('alpha');
  // F290 — Difficulty filter for exercise list
  const [selectedDifficulty, setSelectedDifficulty] = useState<number | null>(null);

  // F60 — Auto-focus el buscador al llegar a la página
  useEffect(() => {
    if (location.pathname === '/exercises') {
      searchInputRef.current?.focus();
    }
  }, [location.pathname]);

  // F106 — Hide keyboard shortcut hint after 3s on mount
  useEffect(() => {
    const timer = setTimeout(() => setShowHint(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  // F26 — Add all favorites to active workout
  const handleAddAllFavorites = () => {
    if (!activeWorkout) return;
    const db = getDb();
    if (!db) return;
    const favExercises = exercises.filter((ex: Exercise) => favorites.includes(ex.id));
    favExercises.forEach((ex: Exercise) => {
      const lastSets = getLastExerciseSets(db, ex.id);
      const lastNotes = getLastExerciseNotes(db, ex.id);
      addExerciseToWorkout(ex.id, ex.name, undefined, lastSets, lastNotes);
    });
  };

  useEffect(() => {
    const db = getDb();
    if (db) {
      const all = getAllExercises(db);
      setExercises(all);
      // F33 — load last performed dates
      const dates = getLastPerformedDates(db);
      setLastPerformedDates(dates);
      // F139 — load exercise stats for quick-stats in expanded view (F288: use Record-returning getExerciseStatsAll)
      const stats = getExerciseStatsAll(db);
      setExerciseStats(stats);
      // F172 — load last weight per exercise for weight chip when workout is active (F288: use Record-returning getLastWeightPerExerciseAll)
      const lw = getLastWeightPerExerciseAll(db);
      setLastWeights(lw);
      // F174 — load workout frequency per exercise for frequency bar (last 30 days) (F288: use Record-returning getExerciseFrequencyAll)
      const freq = getExerciseFrequencyAll(db);
      setExerciseFrequency(freq);
      // F180 — load difficulty ratings for all exercises (F288: use Record-returning getAllExerciseDifficultiesMap)
      const diffs = getAllExerciseDifficultiesMap(db);
      setExerciseDifficulties(diffs);
      // F251 — load muscle last-worked dates for traffic light (F287: use Record-returning getMuscleLastWorked instead of Map-returning getMuscleLastWorkedBatch)
      setMuscleLastWorked(getMuscleLastWorked(db));
      // F325 — batch load last notes for all exercises (📝 indicator on cards)
      const notesAll = getLastExerciseNotesAll(db, all.map((e: Exercise) => e.id));
      setExerciseNotes(notesAll);
      // Batch load similar exercises for all exercises at mount — eliminates N+1 on expand (F289: use Record-returning getSimilarExercisesAll)
      const similarRecord = getSimilarExercisesAll(db, all.map((e: Exercise) => e.id));
      setSimilarExercises(similarRecord);
      setLoading(false);
    }
  }, [setExercises]);

  // F131 — sync muscle filter to URL
  useEffect(() => {
    if (selectedMuscle === 'all' || selectedMuscle === 'custom' || selectedMuscle === 'favorites') {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.delete('muscle');
        return next;
      });
    } else {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.set('muscle', selectedMuscle);
        return next;
      });
    }
  }, [selectedMuscle, setSearchParams]);

  // F53 — sync equipment filter to URL
  useEffect(() => {
    if (selectedEquipment === 'all') {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.delete('equipment');
        return next;
      });
    } else {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.set('equipment', selectedEquipment);
        return next;
      });
    }
  }, [selectedEquipment, setSearchParams]);

  const filtered = useMemo(() => {
    let list: Exercise[] = exercises;

    if (search.trim()) {
      list = searchExercises(getDb(), search);
    } else if (selectedMuscle === 'custom') {
      list = exercises.filter((ex: Exercise) => ex.is_custom);
    } else if (selectedMuscle === 'favorites') {
      list = exercises.filter((ex: Exercise) => favorites.includes(ex.id));
    } else if (selectedMuscle !== 'all') {
      list = getExercisesByMuscle(getDb(), selectedMuscle);
    }

    // Equipment filter applies to all views
    if (selectedEquipment !== 'all') {
      list = list.filter((ex: Exercise) => ex.equipment === selectedEquipment);
    }

    // F290 — Difficulty filter
    if (selectedDifficulty !== null) {
      list = list.filter((ex: Exercise) => {
        const diff = exerciseDifficulties[ex.id] ?? 0;
        return diff === selectedDifficulty;
      });
    }

    // F281 — Apply sort order
    const muscleOrder: Record<string, number> = { chest: 0, back: 1, legs: 2, shoulders: 3, arms: 4, core: 5, cardio: 6, full_body: 7 };
    const equipmentOrder: Record<string, number> = { barbell: 0, dumbbell: 1, machine: 2, cable: 3, kettlebell: 4, bands: 5, bodyweight: 6, other: 7 };
    list = [...list].sort((a, b) => {
      if (sortOrder === 'muscle') {
        const ma = muscleOrder[a.muscle_group] ?? 9;
        const mb = muscleOrder[b.muscle_group] ?? 9;
        if (ma !== mb) return ma - mb;
        return a.name.localeCompare(b.name);
      }
      if (sortOrder === 'equipment') {
        const ea = equipmentOrder[a.equipment] ?? 9;
        const eb = equipmentOrder[b.equipment] ?? 9;
        if (ea !== eb) return ea - eb;
        return a.name.localeCompare(b.name);
      }
      if (sortOrder === 'frequency') {
        const fa = exerciseFrequency[a.id] ?? 0;
        const fb = exerciseFrequency[b.id] ?? 0;
        if (fb !== fa) return fb - fa;
        return a.name.localeCompare(b.name);
      }
      if (sortOrder === 'difficulty') {
        const da = exerciseDifficulties[a.id] ?? 0;
        const db = exerciseDifficulties[b.id] ?? 0;
        if (db !== da) return db - da;
        return a.name.localeCompare(b.name);
      }
      // Default: alphabetical
      return a.name.localeCompare(b.name);
    });

    return list;
  }, [exercises, selectedMuscle, search, selectedEquipment, selectedDifficulty, favorites, sortOrder, exerciseFrequency, exerciseDifficulties]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Ejercicios</h1>
          <button
            onClick={() => navigate('/exercise/custom')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
            style={{ backgroundColor: 'var(--color-primary)', color: '#000' }}
          >
            <PlusCircle size={14} />
            Personalizado
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-2)]" size={18} />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Buscar ejercicios..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-lg px-10 py-2.5 text-sm"
            style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
          />
          {/* F106 — Subtle "press / to search" hint: visible for 3s on mount, then fades out */}
          {search === '' && (
            <span
              className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ opacity: showHint ? 1 : 0, transition: 'opacity 0.8s ease-out' }}
            >
              <span className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--color-text-2)' }}>
                <kbd className="px-1.5 py-0.5 rounded text-[9px] font-mono" style={{ backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>/</kbd>
                <span className="hidden sm:inline">to search</span>
              </span>
            </span>
          )}
        </div>

        {/* Muscle filter */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {muscleGroups.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { setSelectedMuscle(key); setSearch(''); }}
              className="px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors"
              style={{
                backgroundColor: selectedMuscle === key ? 'var(--color-primary)' : 'var(--color-surface-2)',
                color: selectedMuscle === key ? '#000' : 'var(--color-text-2)',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* F281 — Sort options row */}
        <div className="flex items-center gap-2 mt-2 overflow-x-auto pb-1 scrollbar-hide">
          <ArrowUpDown size={12} className="flex-shrink-0" style={{ color: 'var(--color-text-2)' }} />
          {([
            { key: 'alpha', label: 'A-Z' },
            { key: 'muscle', label: 'Músculo' },
            { key: 'equipment', label: 'Equipo' },
            { key: 'frequency', label: 'Frecuencia' },
            { key: 'difficulty', label: 'Dificultad' },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSortOrder(key)}
              className="px-2 py-1 rounded text-[10px] font-medium whitespace-nowrap transition-colors"
              style={{
                backgroundColor: sortOrder === key ? 'var(--color-primary)' : 'transparent',
                color: sortOrder === key ? '#000' : 'var(--color-text-2)',
                border: `1px solid ${sortOrder === key ? 'var(--color-primary)' : 'var(--color-border)'}`,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Equipment filter */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 mt-2 scrollbar-hide">
          {(['all', 'barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'kettlebell', 'bands'] as const).map(eq => (
            <button
              key={eq}
              onClick={() => setSelectedEquipment(eq)}
              className="px-2 py-1 rounded text-[10px] font-medium whitespace-nowrap transition-colors"
              style={{
                backgroundColor: selectedEquipment === eq ? 'var(--color-surface-2)' : 'transparent',
                color: selectedEquipment === eq ? 'var(--color-text)' : 'var(--color-text-2)',
                border: `1px solid ${selectedEquipment === eq ? 'var(--color-border)' : 'transparent'}`,
              }}
            >
              {eq === 'all' ? 'Todo' : EQUIPMENT_LABELS[eq]}
            </button>
          ))}
        </div>

        {/* F290 — Difficulty filter chips */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 mt-1.5 scrollbar-hide">
          <span className="text-[10px] flex-shrink-0 self-center" style={{ color: 'var(--color-text-2)' }}>Dificultad:</span>
          {([
            { key: null, label: 'Todas' },
            { key: 1, label: 'Fácil' },
            { key: 2, label: 'Moderado' },
            { key: 3, label: 'Difícil' },
          ] as const).map(({ key, label }) => {
            const isActive = selectedDifficulty === key;
            const color = key === 1 ? '#22c55e' : key === 2 ? '#f59e0b' : key === 3 ? '#ef4444' : undefined;
            return (
              <button
                key={label}
                onClick={() => setSelectedDifficulty(key)}
                className="px-2 py-1 rounded text-[10px] font-medium whitespace-nowrap transition-colors"
                style={{
                  backgroundColor: isActive && color ? `${color}20` : isActive ? 'var(--color-surface-2)' : 'transparent',
                  color: isActive && color ? color : isActive ? 'var(--color-text)' : 'var(--color-text-2)',
                  border: `1px solid ${isActive && color ? color : isActive ? 'var(--color-border)' : 'transparent'}`,
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Exercise list */}
      <div className="flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-[var(--color-text-2)]">Cargando...</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            variant="exercise"
            title="Ningún ejercicio encontrado"
            description={search ? `No hay resultados para "${search}"` : 'Empieza añadiendo ejercicios personalizados'}
            action={!search ? {
              label: 'Crear ejercicio',
              onClick: () => navigate('/exercise/custom'),
            } : undefined}
          />
        ) : (
          <div className="space-y-1">
            {filtered.map(ex => (
              <div
                key={ex.id}
                className="flex items-center gap-3 p-3 rounded-xl border transition-all duration-150 cursor-pointer"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  borderColor: 'var(--color-border)',
                }}
                onClick={() => {
                  if (activeWorkout) {
                    const db = getDb();
                    if (db) {
                      const lastSets = getLastExerciseSets(db, ex.id);
                      const lastNotes = getLastExerciseNotes(db, ex.id);
                      addExerciseToWorkout(ex.id, ex.name, undefined, lastSets, lastNotes);
                    } else {
                      addExerciseToWorkout(ex.id, ex.name);
                    }
                  } else {
                    navigate(`/exercise/${ex.id}`);
                  }
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-border-light)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; }}
              >
                {/* Equipment dot */}
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: equipmentColors[ex.equipment] || equipmentColors.other }}
                />
                {/* F215/F251 — Muscle group dot with traffic light ring: border color = recovery status */}
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0 relative"
                  style={{
                    backgroundColor: muscleColors[ex.muscle_group] || '#6b7280',
                    boxShadow: `0 0 0 2px ${muscleLastWorked[ex.muscle_group] ? getLastPerformedColor(muscleLastWorked[ex.muscle_group]) : 'var(--color-surface-2)'}`,
                  }}
                  title={(() => {
                    const last = muscleLastWorked[ex.muscle_group];
                    if (!last) return `${ex.muscle_group.replace('_', ' ')} — Sin datos`;
                    const days = muscleDaysMap[ex.muscle_group] ?? 0;
                    const label = days <= 3 ? 'Recuperando' : days <= 7 ? 'Óptimo' : 'Listo';
                    return `${ex.muscle_group.replace('_', ' ')} — ${label} (${days}d)`;
                  })()}
                />
                {/* F257 — Days since this muscle was last worked: readable chip next to the dot */}
                {muscleLastWorked[ex.muscle_group] && (() => {
                  const days = muscleDaysMap[ex.muscle_group] ?? 0;
                  const last = muscleLastWorked[ex.muscle_group];
                  return (
                    <span
                      className="text-[10px] px-1 py-0.5 rounded flex-shrink-0 font-semibold"
                      style={{
                        backgroundColor: `${getLastPerformedColor(last)}20`,
                        color: getLastPerformedColor(last),
                      }}
                      title={`${ex.muscle_group.replace('_', ' ')} — Último trabajado hace ${days} días`}
                    >
                      {days}d
                    </span>
                  );
                })()}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{ex.name}</p>
                    {ex.is_custom && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0" style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-primary)' }}>
                        Custom
                      </span>
                    )}
                    {/* F180 — Difficulty dots (colored 1-5 scale) */}
                    {exerciseDifficulties[ex.id] > 0 && (
                      <div className="flex items-center gap-0.5 flex-shrink-0" title={`Dificultad: ${exerciseDifficulties[ex.id]}/5`}>
                        {[1, 2, 3, 4, 5].map(dot => (
                          <div
                            key={dot}
                            className="w-1.5 h-1.5 rounded-full"
                            style={{
                              backgroundColor: exerciseDifficulties[ex.id] >= dot
                                ? (
                                  exerciseDifficulties[ex.id] <= 1 ? '#22c55e' :
                                  exerciseDifficulties[ex.id] <= 2 ? '#84cc16' :
                                  exerciseDifficulties[ex.id] <= 3 ? '#f59e0b' :
                                  exerciseDifficulties[ex.id] <= 4 ? '#f97316' :
                                  '#ef4444'
                                )
                                : 'var(--color-surface-2)',
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="text-xs" style={{ color: 'var(--color-text-2)' }}>
                    {ex.muscle_group.replace('_', ' ')} • {EQUIPMENT_LABELS[ex.equipment] || ex.equipment}
                  </p>
                  {/* F220 — Last performed chip: rounded badge with semi-transparent background, matching ExerciseProgressPage style */}
                  <span
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold flex-shrink-0"
                    style={{
                      backgroundColor: lastPerformedDates[ex.id]
                        ? `${getLastPerformedColor(lastPerformedDates[ex.id])}20`
                        : 'var(--color-surface-2)',
                      color: lastPerformedDates[ex.id]
                        ? getLastPerformedColor(lastPerformedDates[ex.id])
                        : 'var(--color-text-2)',
                    }}
                    title={lastPerformedDates[ex.id] ? `Último: ${format(new Date(lastPerformedDates[ex.id]), 'dd MMM yyyy', { locale: es })}` : 'Nunca realizado'}
                  >
                    {lastPerformedDates[ex.id] ? formatLastPerformed(lastPerformedDates[ex.id]) : '—'}
                  </span>
                  {/* F174 — Frequency bar: workout count in last 30 days */}
                  {exerciseFrequency[ex.id] !== undefined && exerciseFrequency[ex.id] > 0 && (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-surface-2)', maxWidth: 60 }}>
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(100, (exerciseFrequency[ex.id] / 12) * 100)}%`,
                            backgroundColor: exerciseFrequency[ex.id] >= 8 ? 'var(--color-primary)' : exerciseFrequency[ex.id] >= 4 ? '#10b981' : '#f59e0b',
                          }}
                        />
                      </div>
                      <span className="text-[9px] font-semibold" style={{ color: 'var(--color-text-2)' }}>
                        {exerciseFrequency[ex.id]}×
                      </span>
                    </div>
                  )}
                  {/* F325 — Notes indicator: 📝 icon when last session had notes */}
                  {exerciseNotes[ex.id] && (
                    <span
                      className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded mt-0.5"
                      style={{ backgroundColor: 'rgba(99,102,241,0.12)', color: 'var(--color-primary)' }}
                      title={`Última nota: ${exerciseNotes[ex.id]}`}
                    >
                      📝
                    </span>
                  )}
                </div>

                <button
                  onClick={e => { e.stopPropagation(); toggleFavorite(ex.id); }}
                  className="p-1.5 flex-shrink-0"
                >
                  <Star
                    size={16}
                    className={favorites.includes(ex.id) ? 'text-[var(--color-primary)] fill-[var(--color-primary)]' : 'text-[var(--color-text-2)]'}
                  />
                </button>

                {/* F172 — Last weight chip: shown when active workout and weight data exists */}
                {activeWorkout && lastWeights[ex.id] && (
                  <div
                    className="flex items-center gap-1 px-2 py-1 rounded-lg flex-shrink-0"
                    style={{ backgroundColor: 'var(--color-surface-2)' }}
                    title={`Último: ${lastWeights[ex.id].weight}kg × ${lastWeights[ex.id].reps} reps`}
                  >
                    <span className="text-xs font-bold" style={{ color: 'var(--color-primary)' }}>
                      {lastWeights[ex.id].weight}kg
                    </span>
                    <span className="text-[10px]" style={{ color: 'var(--color-text-2)' }}>
                      ×{lastWeights[ex.id].reps}
                    </span>
                  </div>
                )}

                {activeWorkout && (
                  <Plus size={18} className="text-[var(--color-primary)]" />
                )}

                <button
                  onClick={e => {
                    e.stopPropagation();
                    setExpandedId(prev => prev === ex.id ? null : ex.id);
                  }}
                  className="p-1.5 flex-shrink-0"
                  title="Ver variaciones"
                >
                  <Shuffle
                    size={14}
                    className={expandedId === ex.id ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-2)]'}
                  />
                </button>
                {expandedId === ex.id && (
                  <div className="pl-5 pr-3 pb-2 flex flex-col gap-2">
                    {/* F139 — Quick stats row: PR/max weight, workout count, best set */}
                    {exerciseStats[ex.id] && (exerciseStats[ex.id].maxWeight > 0 || exerciseStats[ex.id].workoutCount > 0) && (
                      <div className="flex items-center gap-3 flex-wrap">
                        {/* PR badge */}
                        {exerciseStats[ex.id].maxWeight > 0 && (
                          <div className="flex items-center gap-1 px-2 py-1 rounded-lg" style={{ backgroundColor: 'var(--color-surface-2)' }}>
                            <Trophy size={10} className="text-amber-400" />
                            <span className="text-[10px] font-bold" style={{ color: 'var(--color-text)' }}>
                              PR {exerciseStats[ex.id].maxWeight}kg
                            </span>
                          </div>
                        )}
                        {/* Workout count */}
                        {exerciseStats[ex.id].workoutCount > 0 && (
                          <div className="flex items-center gap-1 px-2 py-1 rounded-lg" style={{ backgroundColor: 'var(--color-surface-2)' }}>
                            <span className="text-[10px] font-medium" style={{ color: 'var(--color-text-2)' }}>
                              {exerciseStats[ex.id].workoutCount} workout{exerciseStats[ex.id].workoutCount !== 1 ? 's' : ''}
                            </span>
                          </div>
                        )}
                        {/* Best set */}
                        {exerciseStats[ex.id].bestSet && (
                          <div className="flex items-center gap-1 px-2 py-1 rounded-lg" style={{ backgroundColor: 'var(--color-surface-2)' }}>
                            <span className="text-[10px] font-medium" style={{ color: 'var(--color-text-2)' }}>
                              Mejor: {exerciseStats[ex.id].bestSet!.weight}kg × {exerciseStats[ex.id].bestSet!.reps}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                    {/* F12 — Variations */}
                    {similarExercises[ex.id] && similarExercises[ex.id].length > 0 && (
                      <div className="flex gap-2 flex-wrap">
                        <span className="text-[10px] py-0.5" style={{ color: 'var(--color-text-2)' }}>Variaciones:</span>
                        {similarExercises[ex.id].map(se => (
                          <button
                            key={se.id}
                            onClick={() => {
                              const db = getDb();
                              if (db) {
                                const lastSets = getLastExerciseSets(db, se.id);
                                const lastNotes = getLastExerciseNotes(db, se.id);
                                addExerciseToWorkout(se.id, se.name, undefined, lastSets, lastNotes);
                              } else {
                                addExerciseToWorkout(se.id, se.name);
                              }
                              setExpandedId(null);
                            }}
                            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium"
                            style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)' }}
                          >
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: equipmentColors[se.equipment] || equipmentColors.other }} />
                            {se.name}
                          </button>
                        ))}
                      </div>
                    )}
                    {(!similarExercises[ex.id] || similarExercises[ex.id].length === 0) && (
                      <span className="text-[10px]" style={{ color: 'var(--color-text-2)' }}>Sin variaciones registradas</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Floating add to workout hint */}
      {!activeWorkout && filtered.length > 0 && (
        <div className="p-4 border-t" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
          <p className="text-xs text-center" style={{ color: 'var(--color-text-2)' }}>
            Inicia un workout para añadir ejercicios
          </p>
        </div>
      )}

      {/* F26 — Add all favorites to workout shortcut */}
      {activeWorkout && selectedMuscle === 'favorites' && favorites.length > 0 && (
        <div className="p-4 border-t" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
          <button
            onClick={handleAddAllFavorites}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold"
            style={{ backgroundColor: 'var(--color-primary)', color: '#000' }}
          >
            <ListPlus size={16} />
            Añadir todos los favoritos ({favorites.length})
          </button>
        </div>
      )}
    </div>
  );
}
