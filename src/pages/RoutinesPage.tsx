import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Play, Clock, Dumbbell, MoreVertical, Copy, Trash2, Pencil, Globe, BarChart3 } from 'lucide-react';
import { getDb } from '../database/init';
import EmptyState from '../components/ui/EmptyState';
import { getAllRoutines, getAllRoutineExercisesAll, getRoutineExercises, getAllRoutineLastUsedAll, getRoutineWorkoutCountsAll } from '../database/queries';
import { saveRoutine, saveRoutineExercise, deleteRoutine } from '../database/mutations';
import { generateId } from '../database/init';
import { formatLastPerformed, getLastPerformedColor } from '../utils/dateUtils';
import type { Routine, RoutineExercise } from '../types';

type RoutineWithMeta = Routine & { exercise_count: number; estimated_duration: number; muscle_groups: string[]; last_used: string | null; workout_count: number; estimated_volume: number };

// Extended type for routine exercises joined with exercise data (includes muscle_group from JOIN)
type RoutineExerciseWithMuscle = RoutineExercise & { exercise_name: string; muscle_group: string };

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// Template routines to offer on first use
const TEMPLATE_ROUTINES = [
  { name: 'Día de Pecho', description: 'Pecho, hombros y tríceps', muscleGroups: ['chest', 'shoulders', 'arms'], estimated_duration_minutes: 60 },
  { name: 'Día de Espalda', description: 'Espalda y bíceps', muscleGroups: ['back', 'arms'], estimated_duration_minutes: 60 },
  { name: 'Día de Piernas', description: 'Cuádriceps, isquiotibiales, gluteos', muscleGroups: ['legs'], estimated_duration_minutes: 60 },
  { name: 'Full Body', description: 'Todo el cuerpo en una sesión', muscleGroups: ['chest', 'back', 'legs', 'shoulders', 'arms'], estimated_duration_minutes: 75 },
];

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

export default function RoutinesPage() {
  const navigate = useNavigate();
  const [routines, setRoutines] = useState<RoutineWithMeta[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formPublic, setFormPublic] = useState(false);
  const [menuRoutine, setMenuRoutine] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);

  const loadRoutines = useCallback(() => {
    const db = getDb();
    if (!db) return;
    const all = getAllRoutines(db);
    // Batch load all routine exercises in a SINGLE query — fixes N+1 pattern (F289: use Record-returning variant)
    const allExercises = getAllRoutineExercisesAll(db);
    // F149 — Batch load last routine usage (F289: use Record-returning variant)
    const allLastUsed = getAllRoutineLastUsedAll(db);
    // F165 — Batch load workout counts per routine (F289: use Record-returning variant)
    const allWorkoutCounts = getRoutineWorkoutCountsAll(db);
    const withMeta: RoutineWithMeta[] = all.map(r => {
      const exercises = allExercises[r.id] ?? [];
      const muscleSet = new Set<string>();
      let estimatedVolume = 0;
      (exercises as RoutineExerciseWithMuscle[]).forEach(ex => {
        if (ex.muscle_group) muscleSet.add(ex.muscle_group);
        const reps = ex.target_reps_override ?? 10;
        estimatedVolume += ex.target_sets * reps * (ex.target_weight ?? 0);
      });
      return {
        ...r,
        exercise_count: exercises.length,
        estimated_duration: r.estimated_duration_minutes ?? 45,
        muscle_groups: Array.from(muscleSet),
        last_used: allLastUsed[r.id] ?? null,
        workout_count: allWorkoutCounts[r.id] ?? 0,
        estimated_volume: Math.round(estimatedVolume),
      };
    });
    setRoutines(withMeta);
  }, []);

  // F149 — Load routines on mount; loadRoutines is stable (no stale closure issues)
  loadRoutines();

  const openCreate = () => {
    setEditingRoutine(null);
    setFormName('');
    setFormDesc('');
    setShowForm(true);
  };

  const openEdit = (routine: Routine) => {
    setEditingRoutine(routine);
    setFormName(routine.name);
    setFormDesc(routine.description || '');
    setFormPublic(Boolean(routine.is_public));
    setShowForm(true);
    setMenuRoutine(null);
  };

  const openTemplates = () => {
    setShowTemplates(true);
    setFormName('');
    setFormDesc('');
  };

  const handleSave = () => {
    if (!formName.trim()) return;
    const db = getDb();
    if (!db) return;

    const routine = {
      id: editingRoutine?.id || generateId(),
      name: formName.trim(),
      description: formDesc.trim(),
      is_public: formPublic,
      estimated_duration_minutes: editingRoutine?.estimated_duration_minutes ?? 45,
      created_at: editingRoutine?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    saveRoutine(db, routine);
    setShowForm(false);
    loadRoutines();
  };

  const handleDelete = (routineId: string) => {
    const db = getDb();
    if (!db) return;
    deleteRoutine(db, routineId);
    setMenuRoutine(null);
    loadRoutines();
  };

  const handleDuplicate = (routine: Routine) => {
    const db = getDb();
    if (!db) return;
    const newRoutine = {
      ...routine,
      id: generateId(),
      name: `${routine.name} (copia)`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    saveRoutine(db, newRoutine);
    // Also copy exercises
    const exercises = getRoutineExercises(db, routine.id);
    exercises.forEach((_ex) => {
      saveRoutineExercise(db, { ..._ex, id: generateId(), routine_id: newRoutine.id });
    });
    setMenuRoutine(null);
    loadRoutines();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 flex items-center justify-between border-b" style={{ borderColor: 'var(--color-border)' }}>
        <h1 className="text-2xl font-bold">Rutinas</h1>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium"
          style={{ backgroundColor: 'var(--color-primary)', color: '#000' }}
        >
          <Plus size={16} />
          Nueva
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {routines.length === 0 ? (
          <EmptyState
            variant="routine"
            title="Sin rutinas todavía"
            description="Crea tu primera rutina o usa una plantilla"
            action={{
              label: 'Crear rutina',
              onClick: openCreate,
            }}
          />
        ) : (
          <div className="space-y-3">
            {routines.map(routine => (
              <div
                key={routine.id}
                className="rounded-2xl overflow-hidden border transition-all duration-200 hover:border-[var(--color-border-light)]"
                style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-sm)' }}
              >
                {/* Card header */}
                <div className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0" onClick={() => navigate(`/routine/${routine.id}`)} style={{ cursor: 'pointer' }}>
                      <h3 className="font-semibold text-base truncate">{routine.name}</h3>
                      {routine.description && (
                        <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--color-text-2)' }}>
                          {routine.description}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-2">
                        <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-text-2)' }}>
                          <Dumbbell size={12} />
                          {routine.exercise_count} ejercicios
                        </span>
                        <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-text-2)' }}>
                          <Clock size={12} />
                          ~{formatDuration(routine.estimated_duration)}
                        </span>
                        {routine.estimated_volume > 0 && (
                          <span
                            className="flex items-center gap-1 text-xs px-2 py-1 rounded-md font-medium"
                            style={{
                              backgroundColor: 'var(--color-surface-2)',
                              color: 'var(--color-text-2)',
                              border: '1px solid var(--color-border)',
                            }}
                            title="Volumen estimado (sets × reps × peso)"
                          >
                            <BarChart3 size={11} />
                            {routine.estimated_volume >= 1000
                              ? `${Math.round(routine.estimated_volume / 100) / 10}k kg`
                              : `${routine.estimated_volume} kg`}
                          </span>
                        )}
                      </div>
                      {/* F84 — Muscle group dots */}
                      {routine.muscle_groups.length > 0 && (
                        <div className="flex items-center gap-1.5 mt-2">
                          {routine.muscle_groups.slice(0, 6).map(mg => (
                            <div
                              key={mg}
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ backgroundColor: muscleColors[mg] || '#6b7280' }}
                              title={mg}
                            />
                          ))}
                        </div>
                      )}
                      {/* F149+F158 — Last performed + workout count badges */}
                      {(routine.last_used || routine.workout_count > 0) && (
                        <div className="flex items-center gap-1 mt-2 flex-wrap">
                          {routine.last_used && (() => {
                            const days = Math.floor((Date.now() - new Date(routine.last_used).getTime()) / 86400000);
                            return (
                              <>
                                <span
                                  className="text-xs px-2 py-1 rounded-md font-medium flex items-center gap-1"
                                  style={{
                                    backgroundColor: `${getLastPerformedColor(routine.last_used)}18`,
                                    color: getLastPerformedColor(routine.last_used),
                                    border: `1px solid ${getLastPerformedColor(routine.last_used)}40`,
                                  }}
                                  title={`Último uso: ${routine.last_used ? new Date(routine.last_used).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}`}
                                >
                                  <Clock size={11} />
                                  {formatLastPerformed(routine.last_used)}
                                </span>
                                {/* F257 — Days since last used: numeric badge */}
                                <span
                                  className="text-[10px] px-1.5 py-1 rounded-md font-semibold"
                                  style={{
                                    backgroundColor: `${getLastPerformedColor(routine.last_used)}20`,
                                    color: getLastPerformedColor(routine.last_used),
                                  }}
                                  title={`Último uso hace ${days} días`}
                                >
                                  {days}d
                                </span>
                              </>
                            );
                          })()}
                          {/* F165 — Workout count badge */}
                          {routine.workout_count > 0 && (
                            <span
                              className="text-xs px-2 py-1 rounded-md font-medium flex items-center gap-1"
                              style={{
                                backgroundColor: 'var(--color-surface-2)',
                                color: 'var(--color-text-2)',
                                border: '1px solid var(--color-border)',
                              }}
                              title={`${routine.workout_count} workout${routine.workout_count !== 1 ? 's' : ''} con esta rutina`}
                            >
                              <Dumbbell size={11} />
                              {routine.workout_count}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Quick-start + Menu */}
                    <div className="flex items-center gap-2">
                      {/* F274 — Quick-start workout from routine card */}
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/workouts?start=${routine.id}`); }}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold"
                        style={{ backgroundColor: 'var(--color-primary)', color: '#000' }}
                        title={`Empezar "${routine.name}"`}
                      >
                        <Play size={12} fill="currentColor" />
                        Iniciar
                      </button>

                      {/* Menu button */}
                      <div className="relative">
                        <button
                          onClick={(e) => { e.stopPropagation(); setMenuRoutine(menuRoutine === routine.id ? null : routine.id); }}
                          className="p-2 rounded-lg"
                          style={{ backgroundColor: 'var(--color-surface-2)' }}
                        >
                          <MoreVertical size={16} />
                        </button>
                        {menuRoutine === routine.id && (
                          <div
                            className="absolute right-0 top-full mt-1 rounded-lg shadow-lg z-50 py-1 min-w-36"
                            style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                          >
                            <button
                              onClick={() => openEdit(routine)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--color-surface-2)]"
                            >
                              <Pencil size={14} /> Editar
                            </button>
                            <button
                              onClick={() => handleDuplicate(routine)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--color-surface-2)]"
                            >
                              <Copy size={14} /> Duplicar
                            </button>
                            <button
                              onClick={() => handleDelete(routine.id)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--color-surface-2)]"
                              style={{ color: 'var(--color-danger)' }}
                            >
                              <Trash2 size={14} /> Eliminar
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Start button */}
                <div
                  className="flex items-center justify-center gap-2 py-3 border-t text-sm font-bold"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-primary)' }}
                  onClick={() => navigate(`/routine/${routine.id}`)}
                >
                  <Play size={16} fill="currentColor" />
                  Empezar workout
                </div>
              </div>
            ))}

            {/* Add routine card */}
            <button
              onClick={openCreate}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-xl border-2 border-dashed text-sm font-medium"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-2)' }}
            >
              <Plus size={16} />
              Añadir rutina
            </button>
          </div>
        )}
      </div>

      {/* Modal overlay */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <div
            className="w-full max-w-md rounded-2xl p-5 space-y-4"
            style={{ backgroundColor: 'var(--color-surface)' }}
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold">
              {editingRoutine ? 'Editar rutina' : 'Nueva rutina'}
            </h2>

            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--color-text-2)' }}>
                Nombre
              </label>
              <input
                type="text"
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="Ej: Día de pecho"
                className="w-full rounded-lg px-3 py-2.5 text-sm"
                style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                autoFocus
              />
            </div>

            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--color-text-2)' }}>
                Descripción (opcional)
              </label>
              <input
                type="text"
                value={formDesc}
                onChange={e => setFormDesc(e.target.value)}
                placeholder="Ej: Pecho, hombros y tríceps"
                className="w-full rounded-lg px-3 py-2.5 text-sm"
                style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
              />
            </div>

            {/* Public toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: 'var(--color-surface-2)' }}>
              <div className="flex items-center gap-2">
                <Globe size={14} style={{ color: 'var(--color-primary)' }} />
                <div>
                  <p className="text-sm font-medium">Compartir públicamente</p>
                  <p className="text-xs" style={{ color: 'var(--color-text-2)' }}>Genera un enlace para compartir</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFormPublic(!formPublic)}
                className="relative w-12 h-6 rounded-full transition-colors"
                style={{ backgroundColor: formPublic ? 'var(--color-primary)' : 'var(--color-border)' }}
              >
                <span
                  className="absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all shadow"
                  style={{ left: formPublic ? '26px' : '2px' }}
                />
              </button>
            </div>

            {!editingRoutine && (
              <button
                onClick={openTemplates}
                className="w-full py-2 text-xs rounded-lg"
                style={{ color: 'var(--color-primary)' }}
              >
                Ver plantillas pre-hechas →
              </button>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium"
                style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={!formName.trim()}
                className="flex-1 py-2.5 rounded-lg text-sm font-bold disabled:opacity-40"
                style={{ backgroundColor: 'var(--color-primary)', color: '#000' }}
              >
                {editingRoutine ? 'Guardar' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Templates modal */}
      {showTemplates && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <div
            className="w-full max-w-md rounded-2xl p-5 space-y-4"
            style={{ backgroundColor: 'var(--color-surface)' }}
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold">Plantillas</h2>
            <p className="text-xs" style={{ color: 'var(--color-text-2)' }}>
              Elige una plantilla para crear una rutina con ejercicios sugeridos
            </p>
            <div className="space-y-2">
              {TEMPLATE_ROUTINES.map(t => (
                <button
                  key={t.name}
                  onClick={() => {
                    setFormName(t.name);
                    setFormDesc(t.description);
                    setShowTemplates(false);
                    setShowForm(true);
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl text-left"
                  style={{ backgroundColor: 'var(--color-surface-2)' }}
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--color-surface)' }}>
                    <Dumbbell size={18} style={{ color: 'var(--color-primary)' }} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{t.name}</p>
                    <p className="text-xs" style={{ color: 'var(--color-text-2)' }}>{t.description}</p>
                  </div>
                  <Clock size={12} style={{ color: 'var(--color-text-2)' }} />
                  <span className="text-xs" style={{ color: 'var(--color-text-2)' }}>{t.estimated_duration_minutes}m</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowTemplates(false)}
              className="w-full py-2 text-sm rounded-lg"
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
