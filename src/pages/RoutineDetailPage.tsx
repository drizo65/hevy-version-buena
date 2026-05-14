/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Play, Trash2, Search, X, Check, Globe, TrendingUp, List, GripVertical, CheckCircle2 } from 'lucide-react';
import { toastStore } from '../components/ui/toastStore';
import { getDb } from '../database/init';
import { getRoutineById, getRoutineExercises, getAllExercises, getExercisesByMuscle, getWarmupSets, getLastPerformedDates, getAllExerciseDifficultiesMap } from '../database/queries';
import { saveRoutineExercise, reorderRoutineExercises } from '../database/mutations';
import { generateId } from '../database/init';
import { useSettingsStore } from '../store/settingsStore';
import { formatLastPerformed, getLastPerformedColor } from '../utils/dateUtils';
import type { Routine, RoutineExercise, Exercise, MuscleGroup } from '../types';

type RoutineExerciseFull = RoutineExercise & { exercise_name: string; target_reps_override: number | null };

function safeJsonParse<T>(val: string | null | undefined, fallback: T): T {
  if (!val) return fallback;
  try { return JSON.parse(val); } catch { return fallback; }
}

const muscleGroups: { key: MuscleGroup | 'all'; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'chest', label: 'Pecho' },
  { key: 'back', label: 'Espalda' },
  { key: 'legs', label: 'Piernas' },
  { key: 'shoulders', label: 'Hombros' },
  { key: 'arms', label: 'Brazos' },
  { key: 'core', label: 'Core' },
  { key: 'cardio', label: 'Cardio' },
  { key: 'full_body', label: 'Full Body' },
];

export default function RoutineDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { unit, defaultSets, defaultReps } = useSettingsStore();

  const [routine, setRoutine] = useState<Routine | null>(null);
  const [routineExercises, setRoutineExercises] = useState<RoutineExerciseFull[]>([]);
  const [showAddExercise, setShowAddExercise] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedMuscle, setSelectedMuscle] = useState<MuscleGroup | 'all'>('all');
  const [availableExercises, setAvailableExercises] = useState<Exercise[]>([]);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editSets, setEditSets] = useState(3);
  const [editReps, setEditReps] = useState('10');
  const [editWeight, setEditWeight] = useState('');
  const [editRpe, setEditRpe] = useState<number | null>(null);
  const [editRest, setEditRest] = useState(90);
  const [editRepsOverride, setEditRepsOverride] = useState<number | null>(null);
  const [showStartPreview, setShowStartPreview] = useState(false);
  // F145 — Skipped exercise IDs before starting workout from routine preview
  const [skippedExerciseIds, setSkippedExerciseIds] = useState<Set<string>>(new Set());
  // F121 — Drag handle state for reordering
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  // F132 — Last performed dates for each exercise in the routine
  const [lastPerformedDates, setLastPerformedDates] = useState<Record<string, string>>({});
  // F318 — Exercise difficulty ratings for add-exercise modal
  const [exerciseDifficulties, setExerciseDifficulties] = useState<Record<string, number>>({});
  // F318 — Difficulty filter for add-exercise modal
  const [selectedDifficulty, setSelectedDifficulty] = useState<number | null>(null);

  const loadRoutine = useCallback(() => {
    if (!id) return;
    const db = getDb();
    if (!db) return;
    const r = getRoutineById(db, id);
    if (!r) { navigate('/routines'); return; }
    setRoutine(r);
    const exs = getRoutineExercises(db, id);
    setRoutineExercises(exs as RoutineExerciseFull[]);
    // F132 — Load last performed dates for all exercises in this routine
    const lastDates = getLastPerformedDates(db);
    setLastPerformedDates(lastDates);
  }, [id, navigate]);

  useEffect(() => { loadRoutine(); }, [loadRoutine]);

  const loadAvailableExercises = useCallback(() => {
    const db = getDb();
    if (!db) return;
    let list: Exercise[] = [];
    if (search.trim()) {
      const q = `%${search}%`;
      const stmt = db.prepare('SELECT * FROM exercises WHERE name LIKE ? ORDER BY name LIMIT 30');
      stmt.bind([q]);
      const rows: any[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();
      list = rows.map(r => ({ ...r, secondary_muscles: safeJsonParse(r.secondary_muscles, []), is_custom: Boolean(r.is_custom), is_favorite: Boolean(r.is_favorite) })) as Exercise[];
    } else if (selectedMuscle !== 'all') {
      list = getExercisesByMuscle(db, selectedMuscle);
    } else {
      list = getAllExercises(db).slice(0, 50);
    }
    setAvailableExercises(list);
    // F318 — Load difficulty ratings for available exercises
    const diffs = getAllExerciseDifficultiesMap(db);
    setExerciseDifficulties(diffs);
  }, [search, selectedMuscle]);

  useEffect(() => { loadAvailableExercises(); }, [loadAvailableExercises]);

  const addExercise = (exercise: Exercise) => {
    const db = getDb();
    if (!db || !routine) return;
    const re = {
      id: generateId(),
      routine_id: routine.id,
      exercise_id: exercise.id,
      order_index: routineExercises.length,
      target_sets: defaultSets,
      target_reps: String(defaultReps),
      target_weight: null as number | null,
      rest_seconds: 90,
    };
    saveRoutineExercise(db, re);
    setShowAddExercise(false);
    loadRoutine();
  };

  const removeExercise = (routineExerciseId: string) => {
    const db = getDb();
    if (!db) return;
    db.run('DELETE FROM routine_exercises WHERE id = ?', [routineExerciseId]);
    loadRoutine();
  };

  const updateRoutineExercise = (re: RoutineExerciseFull) => {
    const db = getDb();
    if (!db) return;
    saveRoutineExercise(db, { ...re, target_sets: editSets, target_reps: editReps, target_weight: editWeight ? parseFloat(editWeight) : null, target_rpe: editRpe, rest_seconds: editRest, target_reps_override: editRepsOverride });
    setEditingItem(null);
    loadRoutine();
  };

  const startEditing = (re: RoutineExerciseFull) => {
    setEditingItem(re.id);
    setEditSets(re.target_sets);
    setEditReps(re.target_reps);
    setEditWeight(re.target_weight?.toString() || '');
    setEditRpe(re.target_rpe ?? null);
    setEditRest(re.rest_seconds ?? 90);
  };

  const handleStartWorkout = () => {
    if (!routine) return;
    setSkippedExerciseIds(new Set());
    setShowStartPreview(true);
  };

  if (!routine) {
    return (
      <div className="flex items-center justify-center h-full">
        <p style={{ color: 'var(--color-text-2)' }}>Cargando...</p>
      </div>
    );
  }

  const estimatedMinutes = routineExercises.reduce((acc, re) => acc + (re.rest_seconds * re.target_sets) / 60 + re.target_sets * 0.5, 0);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
        <button onClick={() => navigate('/routines')} className="p-2 rounded-lg" style={{ backgroundColor: 'var(--color-surface)' }}>
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">{routine.name}</h1>
          <p className="text-xs" style={{ color: 'var(--color-text-2)' }}>
            {routineExercises.length} ejercicios • ~{Math.round(estimatedMinutes)} min
          </p>
        </div>
        <button
          onClick={handleStartWorkout}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold"
          style={{ backgroundColor: 'var(--color-primary)', color: '#000' }}
        >
          <Play size={14} fill="currentColor" />
          Iniciar
        </button>
        <button
          onClick={() => {
            const url = `${window.location.origin}/routine/${routine.id}`;
            navigator.clipboard.writeText(url).then(() => {
              toastStore.success('Enlace copiado al portapapeles');
            });
          }}
          className="p-2 rounded-lg"
          style={{ backgroundColor: 'var(--color-surface)' }}
          title="Compartir enlace"
        >
          <Globe size={16} />
        </button>
      </div>

      {/* Description */}
      {routine.description && (
        <div className="px-4 py-2 border-b" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
          <p className="text-xs" style={{ color: 'var(--color-text-2)' }}>{routine.description}</p>
        </div>
      )}

      {/* F221 — Routine estimated volume preview */}
      {routineExercises.length > 0 && (() => {
        let totalVolume = 0;
        for (const re of routineExercises) {
          const repsStr = re.target_reps_override != null ? String(re.target_reps_override) : re.target_reps;
          const repParts = repsStr.split('-').map(Number);
          const reps = repParts.length > 1 ? (repParts[0] + repParts[1]) / 2 : (repParts[0] || 0);
          if (re.target_weight && re.target_weight > 0 && reps > 0) {
            totalVolume += re.target_sets * reps * re.target_weight;
          }
        }
        const repsOnlyTotal = routineExercises.reduce((acc, re) => {
          const repsStr = re.target_reps_override != null ? String(re.target_reps_override) : re.target_reps;
          const repParts = repsStr.split('-').map(Number);
          const reps = repParts.length > 1 ? (repParts[0] + repParts[1]) / 2 : (repParts[0] || 0);
          return acc + re.target_sets * reps;
        }, 0);
        const displayVolume = totalVolume > 0 ? totalVolume : repsOnlyTotal;
        const hasPartialWeights = totalVolume === 0 && repsOnlyTotal > 0;
        return (
          <div className="px-4 py-2 border-b flex items-center gap-3" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
            <span className="text-xs" style={{ color: 'var(--color-text-2)' }}>Vol. estimada:</span>
            <span className="text-sm font-semibold">
              {Math.round(displayVolume).toLocaleString('es-ES')} {unit}
              {hasPartialWeights && <span className="text-xs font-normal" style={{ color: 'var(--color-text-2)' }}> (sin peso)</span>}
            </span>
          </div>
        );
      })()}

      {/* Exercises */}
      <div className="flex-1 overflow-y-auto p-4">
        {routineExercises.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-52 gap-3">
            <p className="text-sm" style={{ color: 'var(--color-text-2)' }}>Esta rutina está vacía</p>
            <button
              onClick={() => setShowAddExercise(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
              style={{ backgroundColor: 'var(--color-primary)', color: '#000' }}
            >
              <Plus size={16} />
              Añadir ejercicio
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {routineExercises.map((re, idx) => (
              <div
                key={re.id}
                draggable
                onDragStart={() => { setDraggingIdx(idx); }}
                onDragOver={(e) => { e.preventDefault(); setDragOverIdx(idx); }}
                onDragEnd={() => {
                  if (draggingIdx !== null && draggingIdx !== idx && draggingIdx >= 0 && draggingIdx < routineExercises.length) {
                    const newOrder = [...routineExercises];
                    const [item] = newOrder.splice(draggingIdx, 1);
                    newOrder.splice(idx, 0, item);
                    const orderedIds = newOrder.map(r => r.id);
                    const db = getDb();
                    if (db && routine) { reorderRoutineExercises(db, routine.id, orderedIds); }
                    loadRoutine();
                  }
                  setDraggingIdx(null);
                  setDragOverIdx(null);
                }}
                onDragEnter={() => { if (draggingIdx !== null && draggingIdx !== idx) setDragOverIdx(idx); }}
                className={`rounded-xl overflow-hidden transition-all ${draggingIdx === idx ? 'opacity-40' : ''} ${dragOverIdx === idx && draggingIdx !== null && draggingIdx !== idx ? 'ring-2 ring-[var(--color-primary)]' : ''}`}
                style={{ backgroundColor: 'var(--color-surface)' }}
              >
                {/* Exercise header */}
                <div className="flex items-center gap-3 p-3">
                  {/* F121 — Drag handle replaces number circle */}
                  <div
                    className="flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0 cursor-grab active:cursor-grabbing"
                    style={{ backgroundColor: 'var(--color-surface-2)' }}
                    title="Arrastra para reordenar"
                  >
                    <GripVertical size={16} style={{ color: 'var(--color-text-2)' }} />
                  </div>
                  <div className="flex-1 min-w-0" onClick={() => navigate(`/exercise/${re.exercise_id}`)} style={{ cursor: 'pointer' }}>
                    <p className="text-sm font-medium truncate">{re.exercise_name}</p>
                    <p className="text-xs" style={{ color: 'var(--color-text-2)' }}>
                      {re.target_sets} × {re.target_reps_override != null ? `${re.target_reps_override}*` : re.target_reps}
                      {re.target_weight ? ` @ ${re.target_weight} ${unit}` : ''}
                      {re.target_rpe ? ` · RPE ${re.target_rpe}` : ''}
                      {(re.rest_seconds && re.rest_seconds !== 90) ? ` · ↔ ${re.rest_seconds}s` : ''}
                    </p>
                    {/* F276 — Last performed pill chip */}
                    {lastPerformedDates[re.exercise_id] && (() => {
                      const color = getLastPerformedColor(lastPerformedDates[re.exercise_id]);
                      return (
                        <span
                          className="text-[10px] font-semibold"
                          style={{
                            color,
                            backgroundColor: `${color}20`,
                            padding: '2px 8px',
                            borderRadius: '9999px',
                          }}
                          title={`Último: ${new Date(lastPerformedDates[re.exercise_id]).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                        >
                          {formatLastPerformed(lastPerformedDates[re.exercise_id])}
                        </span>
                      );
                    })()}
                  </div>

                  <button
                    onClick={() => startEditing(re)}
                    className="text-xs px-2 py-1 rounded-lg"
                    style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text-2)' }}
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => removeExercise(re.id)}
                    className="p-1.5 rounded-lg"
                    style={{ backgroundColor: 'var(--color-surface-2)' }}
                  >
                    <Trash2 size={14} style={{ color: 'var(--color-danger)' }} />
                  </button>
                </div>

                {/* Edit panel */}
                {editingItem === re.id && (
                  <div className="px-3 pb-3 pt-1 border-t space-y-3" style={{ borderColor: 'var(--color-border)' }}>
                    <div className="grid grid-cols-3 gap-2 mt-3">
                      <div>
                        <label className="text-xs mb-1 block" style={{ color: 'var(--color-text-2)' }}>Series</label>
                        <input
                          type="number"
                          value={editSets}
                          onChange={e => setEditSets(parseInt(e.target.value) || 1)}
                          min={1} max={20}
                          className="w-full rounded-lg px-2 py-1.5 text-sm text-center"
                          style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                        />
                      </div>
                      <div>
                        <label className="text-xs mb-1 block" style={{ color: 'var(--color-text-2)' }}>Reps</label>
                        <input
                          type="text"
                          value={editReps}
                          onChange={e => setEditReps(e.target.value)}
                          placeholder="10-12"
                          className="w-full rounded-lg px-2 py-1.5 text-sm text-center"
                          style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                        />
                      </div>
                      <div>
                        <label className="text-xs mb-1 block" style={{ color: 'var(--color-text-2)' }}>Peso ({unit})</label>
                        <input
                          type="number"
                          value={editWeight}
                          onChange={e => setEditWeight(e.target.value)}
                          placeholder="—"
                          step="0.5"
                          className="w-full rounded-lg px-2 py-1.5 text-sm text-center"
                          style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                        />
                      </div>
                    </div>
                    {/* RPE row */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs" style={{ color: 'var(--color-text-2)' }}>RPE objetivo:</span>
                      <div className="flex gap-1">
                        {[null, 6, 7, 8, 9, 10].map(r => (
                          <button
                            key={r ?? 'none'}
                            onClick={() => setEditRpe(r)}
                            className="px-2 py-1 rounded text-xs font-bold"
                            style={{
                              backgroundColor: editRpe === r ? (r == null ? 'var(--color-surface-2)' : '#f59e0b') : 'var(--color-surface-2)',
                              color: editRpe === r ? (r == null ? 'var(--color-text-2)' : '#000') : 'var(--color-text-2)',
                              border: editRpe === r && r != null ? '1px solid #f59e0b' : '1px solid var(--color-border)',
                            }}
                          >
                            {r == null ? '—' : r}
                          </button>
                        ))}
                      </div>
                      {editRpe != null && (
                        <span className="text-[10px]" style={{ color: 'var(--color-text-2)' }}>
                          ({['Muy fácil', 'Fácil', 'Duro', 'Muy duro', 'Máximo'][editRpe - 6]})
                        </span>
                      )}
                    </div>
                    {/* F102 — target_reps_override */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs" style={{ color: 'var(--color-text-2)' }}>Reps override:</span>
                      <div className="flex gap-1">
                        {[null, 5, 6, 8, 10, 12, 15, 20].map(r => (
                          <button
                            key={r ?? 'none'}
                            onClick={() => setEditRepsOverride(r)}
                            className="px-2 py-1 rounded text-xs font-bold"
                            style={{
                              backgroundColor: editRepsOverride === r ? (r == null ? 'var(--color-surface-2)' : '#3b82f6') : 'var(--color-surface-2)',
                              color: editRepsOverride === r ? (r == null ? 'var(--color-text-2)' : '#fff') : 'var(--color-text-2)',
                              border: editRepsOverride === r && r != null ? '1px solid #3b82f6' : '1px solid var(--color-border)',
                            }}
                          >
                            {r == null ? '—' : r}
                          </button>
                        ))}
                      </div>
                      {editRepsOverride != null && (
                        <span className="text-[10px]" style={{ color: 'var(--color-text-2)' }}>
                          (usará {editRepsOverride} en vez de "{editReps}")
                        </span>
                      )}
                    </div>
                    {/* Rest time row (F83) */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs" style={{ color: 'var(--color-text-2)' }}>Descanso:</span>
                      <div className="flex gap-1">
                        {[60, 90, 120, 180].map(secs => (
                          <button
                            key={secs}
                            onClick={() => setEditRest(secs)}
                            className="px-2 py-1 rounded text-xs font-bold"
                            style={{
                              backgroundColor: editRest === secs ? 'var(--color-primary)' : 'var(--color-surface-2)',
                              color: editRest === secs ? '#000' : 'var(--color-text-2)',
                            }}
                          >
                            {secs < 60 ? `${secs}s` : `${secs / 60}m`}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* F96 — Warmup sets generator */}
                    {editWeight && parseFloat(editWeight) >= 20 && (
                      <button
                        onClick={() => {
                          const warmup = getWarmupSets(parseFloat(editWeight));
                          if (warmup.length > 0) {
                            toastStore.info(
                              'Warmup sets generadas',
                              warmup.map(w => `${w.weight} ${unit} × ${w.reps}`).join('\n')
                            );
                          } else {
                            toastStore.warning('Peso demasiado bajo para generar warmup sets (mínimo 20kg).');
                          }
                        }}
                        className="flex items-center gap-1.5 w-full py-1.5 px-3 rounded-lg text-xs font-medium transition-colors"
                        style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-primary)', border: '1px solid var(--color-primary)' }}
                      >
                        <TrendingUp size={12} />
                        Generar warmup sets
                      </button>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditingItem(null)}
                        className="flex-1 py-2 rounded-lg text-xs font-medium"
                        style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)' }}
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => updateRoutineExercise(re)}
                        className="flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1"
                        style={{ backgroundColor: 'var(--color-primary)', color: '#000' }}
                      >
                        <Check size={14} /> Guardar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Add exercise button */}
            <button
              onClick={() => setShowAddExercise(true)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed text-sm font-medium"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-2)' }}
            >
              <Plus size={16} />
              Añadir ejercicio
            </button>
          </div>
        )}
      </div>

      {/* F318 — Add Exercise Modal */}
      {showAddExercise && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}>
          {/* Modal header */}
          <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
            <h2 className="text-lg font-bold">Añadir ejercicio</h2>
            <button onClick={() => { setShowAddExercise(false); setSearch(''); }} className="p-2 rounded-lg" style={{ backgroundColor: 'var(--color-surface)' }}>
              <X size={20} />
            </button>
          </div>

          {/* Search */}
          <div className="p-4 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2" size={18} style={{ color: 'var(--color-text-2)' }} />
              <input
                type="text"
                placeholder="Buscar ejercicios..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full rounded-lg pl-10 pr-4 py-2.5 text-sm"
                style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                autoFocus
              />
            </div>

            {/* Muscle filter */}
            <div className="flex gap-2 overflow-x-auto pb-1">
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

            {/* F318 — Difficulty filter chips */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
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
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <div className="space-y-1">
              {availableExercises
                .filter(ex => {
                  if (selectedDifficulty === null) return true;
                  const diff = exerciseDifficulties[ex.id] ?? 0;
                  return diff === selectedDifficulty;
                })
                .map(ex => {
                const alreadyIn = routineExercises.some(re => re.exercise_id === ex.id);
                const diff = exerciseDifficulties[ex.id] ?? 0;
                return (
                  <button
                    key={ex.id}
                    onClick={() => !alreadyIn && addExercise(ex)}
                    disabled={alreadyIn}
                    className="w-full flex items-center gap-3 p-3 rounded-lg text-left transition-opacity"
                    style={{
                      backgroundColor: 'var(--color-surface)',
                      opacity: alreadyIn ? 0.4 : 1,
                      cursor: alreadyIn ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {/* F318 — Difficulty dots (same style as ExercisesPage) */}
                    {diff > 0 ? (
                      <div className="flex items-center gap-0.5 flex-shrink-0" title={`Dificultad: ${diff}/5`}>
                        {[1, 2, 3, 4, 5].map(dot => (
                          <div
                            key={dot}
                            className="w-1.5 h-1.5 rounded-full"
                            style={{
                              backgroundColor: diff >= dot
                                ? (
                                  diff <= 1 ? '#22c55e' :
                                  diff <= 2 ? '#84cc16' :
                                  diff <= 3 ? '#f59e0b' :
                                  diff <= 4 ? '#f97316' :
                                  '#ef4444'
                                )
                                : 'var(--color-surface-2)',
                            }}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: 'var(--color-surface-2)' }} />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{ex.name}</p>
                      <p className="text-xs capitalize" style={{ color: 'var(--color-text-2)' }}>
                        {ex.muscle_group.replace('_', ' ')} • {ex.equipment}
                      </p>
                    </div>
                    {alreadyIn && <span className="text-xs" style={{ color: 'var(--color-text-2)' }}>Ya añadido</span>}
                  </button>
                );
              })}
              {availableExercises.filter(ex => {
                  if (selectedDifficulty === null) return true;
                  const diff = exerciseDifficulties[ex.id] ?? 0;
                  return diff === selectedDifficulty;
                }).length === 0 && (
                <p className="text-center py-8 text-sm" style={{ color: 'var(--color-text-2)' }}>No se encontraron ejercicios</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* F119+F145 — Pre-start routine exercise preview with skip functionality */}
      {showStartPreview && routine && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}>
          <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
            <div className="flex items-center gap-2">
              <List size={18} style={{ color: 'var(--color-primary)' }} />
              <h2 className="text-lg font-bold">Vista previa</h2>
            </div>
            <button
              onClick={() => setShowStartPreview(false)}
              className="p-2 rounded-lg"
              style={{ backgroundColor: 'var(--color-surface-2)' }}
            >
              <X size={18} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {skippedExerciseIds.size > 0 && (
              <button
                onClick={() => setSkippedExerciseIds(new Set())}
                className="w-full py-2 rounded-lg text-xs font-medium mb-1"
                style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text-2)' }}
              >
                ↩ Mostrar todos ({routineExercises.length - skippedExerciseIds.size} ejercicios)
              </button>
            )}
            {routineExercises.length === 0 && (
              <p className="text-center py-8 text-sm" style={{ color: 'var(--color-text-2)' }}>
                Esta rutina no tiene ejercicios
              </p>
            )}
            {routineExercises.map((re, idx) => {
              const skipped = skippedExerciseIds.has(re.id);
              return (
                <div
                  key={re.id}
                  className="flex items-center gap-3 p-3 rounded-xl transition-all"
                  style={{
                    backgroundColor: skipped ? 'var(--color-surface)' : 'var(--color-surface-2)',
                    opacity: skipped ? 0.5 : 1,
                  }}
                >
                  <button
                    onClick={() => {
                      const next = new Set(skippedExerciseIds);
                      if (skipped) {
                        next.delete(re.id);
                      } else {
                        next.add(re.id);
                      }
                      setSkippedExerciseIds(next);
                    }}
                    className="flex items-center justify-center w-7 h-7 rounded-lg flex-shrink-0 transition-colors"
                    style={{ backgroundColor: skipped ? 'var(--color-surface)' : 'var(--color-primary)' }}
                  >
                    {skipped ? (
                      <CheckCircle2 size={16} style={{ color: 'var(--color-text-2)' }} />
                    ) : (
                      <span className="text-xs font-bold" style={{ color: '#000' }}>{idx + 1}</span>
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${skipped ? 'line-through' : ''}`} style={{ color: skipped ? 'var(--color-text-2)' : 'var(--color-text)' }}>{re.exercise_name}</p>
                    {!skipped && (
                      <p className="text-xs" style={{ color: 'var(--color-text-2)' }}>
                        {re.target_sets} × {re.target_reps_override != null ? `${re.target_reps_override}*` : re.target_reps}
                        {re.target_weight ? ` @ ${re.target_weight} ${unit}` : ''}
                        {re.target_rpe ? ` · RPE ${re.target_rpe}` : ''}
                        {(re.rest_seconds && re.rest_seconds !== 90) ? ` · ↔ ${re.rest_seconds}s` : ''}
                      </p>
                    )}
                    {skipped && (
                      <p className="text-xs" style={{ color: 'var(--color-text-2)' }}>Saltado</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="p-4 border-t space-y-2" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
            <p className="text-xs text-center" style={{ color: 'var(--color-text-2)' }}>
              {routineExercises.length - skippedExerciseIds.size} ejercicios • ~{Math.round(estimatedMinutes * (routineExercises.length - skippedExerciseIds.size) / Math.max(routineExercises.length, 1))} min
              {skippedExerciseIds.size > 0 && ` (${skippedExerciseIds.size} saltado${skippedExerciseIds.size > 1 ? 's' : ''})`}
            </p>
            <button
              onClick={() => {
                // F145 — store skipped exercise IDs in sessionStorage so WorkoutsPage can read them
                if (skippedExerciseIds.size > 0) {
                  sessionStorage.setItem('routine_skipped_exercises', JSON.stringify([...skippedExerciseIds]));
                } else {
                  sessionStorage.removeItem('routine_skipped_exercises');
                }
                setShowStartPreview(false);
                navigate(`/workouts?start=${routine.id}`);
              }}
              disabled={routineExercises.length - skippedExerciseIds.size === 0}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold disabled:opacity-40"
              style={{
                backgroundColor: routineExercises.length - skippedExerciseIds.size > 0 ? 'var(--color-primary)' : 'var(--color-surface-2)',
                color: routineExercises.length - skippedExerciseIds.size > 0 ? '#000' : 'var(--color-text-2)',
              }}
            >
              <Play size={16} fill="currentColor" />
              Empezar entrenamiento
              {skippedExerciseIds.size > 0 && ` (${routineExercises.length - skippedExerciseIds.size})`}
            </button>
            <button
              onClick={() => setShowStartPreview(false)}
              className="w-full py-2 rounded-xl text-sm font-medium"
              style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)' }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
