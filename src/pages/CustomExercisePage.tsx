/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Trash2, AlertCircle } from 'lucide-react';
import { getDb } from '../database/init';
import { getExerciseById } from '../database/queries';
import { saveExercise, deleteExercise } from '../database/mutations';
import { generateId } from '../database/init';
import type { MuscleGroup, Equipment } from '../types';

const muscleGroups: { key: MuscleGroup; label: string }[] = [
  { key: 'chest', label: 'Pecho' },
  { key: 'back', label: 'Espalda' },
  { key: 'legs', label: 'Piernas' },
  { key: 'shoulders', label: 'Hombros' },
  { key: 'arms', label: 'Brazos' },
  { key: 'core', label: 'Core' },
  { key: 'cardio', label: 'Cardio' },
  { key: 'full_body', label: 'Full Body' },
];

const equipmentOptions: { key: Equipment; label: string; color: string }[] = [
  { key: 'barbell', label: 'Barra', color: '#3b82f6' },
  { key: 'dumbbell', label: 'Mancuernas', color: '#8b5cf6' },
  { key: 'machine', label: 'Máquina', color: '#10b981' },
  { key: 'cable', label: 'Cable', color: '#f59e0b' },
  { key: 'bodyweight', label: 'Peso corporal', color: '#ef4444' },
  { key: 'kettlebell', label: 'Kettlebell', color: '#ec4899' },
  { key: 'bands', label: 'Bandas', color: '#06b6d4' },
  { key: 'other', label: 'Otro', color: '#6b7280' },
];

interface FormData {
  name: string;
  muscle_group: MuscleGroup;
  secondary_muscles: MuscleGroup[];
  equipment: Equipment;
}

export default function CustomExercisePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEditing = Boolean(id);

  const [form, setForm] = useState<FormData>({
    name: '',
    muscle_group: 'chest',
    secondary_muscles: [],
    equipment: 'barbell',
  });
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (id) {
      const db = getDb();
      if (!db) return;
      const exercise = getExerciseById(db, id);
      if (exercise && exercise.is_custom) {
        setForm({
          name: exercise.name,
          muscle_group: exercise.muscle_group,
          secondary_muscles: exercise.secondary_muscles || [],
          equipment: exercise.equipment,
        });
      }
    }
  }, [id]);

  const toggleSecondary = (muscle: MuscleGroup) => {
    setForm(prev => ({
      ...prev,
      secondary_muscles: prev.secondary_muscles.includes(muscle)
        ? prev.secondary_muscles.filter(m => m !== muscle)
        : [...prev.secondary_muscles, muscle],
    }));
  };

  const handleSave = () => {
    const trimmed = form.name.trim();
    if (!trimmed) {
      setError('El nombre es obligatorio');
      return;
    }
    setError('');

    const db = getDb();
    if (!db) return;

    const exercise = {
      id: id || generateId(),
      name: trimmed,
      muscle_group: form.muscle_group,
      secondary_muscles: form.secondary_muscles,
      equipment: form.equipment,
      is_custom: true,
      is_favorite: false,
      created_at: new Date().toISOString(),
    };

    saveExercise(db, exercise);
    navigate(-1);
  };

  const handleDelete = () => {
    if (!id) return;
    const db = getDb();
    if (!db) return;
    deleteExercise(db, id);
    navigate('/exercises');
  };

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--color-bg)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-lg transition-colors"
          style={{ backgroundColor: 'var(--color-surface)' }}
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold flex-1">
          {isEditing ? 'Editar ejercicio' : 'Nuevo ejercicio'}
        </h1>
        <button
          onClick={handleSave}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold"
          style={{ backgroundColor: 'var(--color-primary)', color: '#000' }}
        >
          <Check size={16} />
          Guardar
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg text-sm" style={{ backgroundColor: '#3d1a1a', color: '#ff6b6b' }}>
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        {/* Nombre */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-2)' }}>
            Nombre del ejercicio *
          </label>
          <input
            type="text"
            value={form.name}
            onChange={e => { setForm(prev => ({ ...prev, name: e.target.value })); setError(''); }}
            placeholder="Ej: Press inclinado con mancuernas"
            className="w-full px-4 py-3 rounded-xl text-sm"
            style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
            autoFocus
          />
        </div>

        {/* Músculo principal */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-2)' }}>
            Músculo principal *
          </label>
          <div className="grid grid-cols-2 gap-2">
            {muscleGroups.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setForm(prev => ({ ...prev, muscle_group: key }))}
                className="py-2.5 px-3 rounded-xl text-sm font-medium transition-colors text-left"
                style={{
                  backgroundColor: form.muscle_group === key ? 'var(--color-primary)' : 'var(--color-surface)',
                  color: form.muscle_group === key ? '#000' : 'var(--color-text)',
                  border: `1px solid ${form.muscle_group === key ? 'var(--color-primary)' : 'var(--color-border)'}`,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Músculos secundarios */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-2)' }}>
            Músculos secundarios
            <span className="font-normal normal-case tracking-normal ml-1">(opcional)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {muscleGroups.map(({ key, label }) => {
              const selected = form.secondary_muscles.includes(key);
              const isPrimary = form.muscle_group === key;
              return (
                <button
                  key={key}
                  onClick={() => !isPrimary && toggleSecondary(key)}
                  disabled={isPrimary}
                  className="py-1.5 px-3 rounded-full text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: selected ? 'var(--color-surface-2)' : 'var(--color-surface)',
                    color: isPrimary ? 'var(--color-text-2)' : selected ? 'var(--color-text)' : 'var(--color-text-2)',
                    border: `1px solid ${selected ? 'var(--color-border)' : 'var(--color-border)'}`,
                    opacity: isPrimary ? 0.4 : 1,
                    cursor: isPrimary ? 'not-allowed' : 'pointer',
                  }}
                >
                  {label}
                  {selected && !isPrimary && ' ✓'}
                </button>
              );
            })}
          </div>
        </div>

        {/* Equipamiento */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-2)' }}>
            Equipamiento *
          </label>
          <div className="grid grid-cols-2 gap-2">
            {equipmentOptions.map(({ key, label, color }) => (
              <button
                key={key}
                onClick={() => setForm(prev => ({ ...prev, equipment: key }))}
                className="flex items-center gap-2 py-2.5 px-3 rounded-xl text-sm font-medium transition-colors text-left"
                style={{
                  backgroundColor: form.equipment === key ? 'var(--color-surface)' : 'var(--color-surface)',
                  border: `2px solid ${form.equipment === key ? color : 'var(--color-border)'}`,
                  color: 'var(--color-text)',
                }}
              >
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Eliminar (solo al editar) */}
        {isEditing && (
          <div className="pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
            {!deleting ? (
              <button
                onClick={() => setDeleting(true)}
                className="flex items-center gap-2 text-sm font-medium"
                style={{ color: 'var(--color-danger)' }}
              >
                <Trash2 size={16} />
                Eliminar ejercicio
              </button>
            ) : (
              <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
                <p className="text-sm mb-3">¿Seguro que quieres eliminar este ejercicio? Se eliminará de todas las rutinas y workouts donde esté.</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setDeleting(false)}
                    className="flex-1 py-2 rounded-lg text-sm font-medium"
                    style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)' }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleDelete}
                    className="flex-1 py-2 rounded-lg text-sm font-medium text-white"
                    style={{ backgroundColor: 'var(--color-danger)' }}
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
