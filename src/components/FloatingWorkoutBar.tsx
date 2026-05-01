import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useWorkoutStore } from '../store/workoutStore';
import { Dumbbell, X, ArrowRight, Clock } from 'lucide-react';

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function FloatingWorkoutBar() {
  const navigate = useNavigate();
  const location = useLocation();

  // All hooks ALWAYS first — same order every render
  const activeWorkout = useWorkoutStore(s => s.activeWorkout);
  const cancelWorkout = useWorkoutStore(s => s.cancelWorkout);
  const [elapsed, setElapsed] = useState(0);
  const [showConfirm, setShowConfirm] = useState(false);

  // Derive everything with useMemo so hooks order never changes
  const isOnWorkoutPage = useMemo(
    () => location.pathname.startsWith('/workout/'),
    [location.pathname]
  );

  const currentExercise = useMemo(() => {
    if (!activeWorkout || activeWorkout.exercises.length === 0) return null;
    const withCompleted = activeWorkout.exercises.filter(e => e.sets.some(s => s.completed));
    if (withCompleted.length > 0) return withCompleted[withCompleted.length - 1].exercise_name;
    return activeWorkout.exercises[0].exercise_name;
  }, [activeWorkout]);

  const workoutId = activeWorkout?.id ?? null;

  // Tick — only active when visible
  useEffect(() => {
    if (!activeWorkout || isOnWorkoutPage) return;
    const tick = () => {
      const e = Math.floor((Date.now() - new Date(activeWorkout.startedAt).getTime()) / 1000);
      setElapsed(Math.max(0, e));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [activeWorkout, isOnWorkoutPage]);

  const handleDelete = () => {
    if (!showConfirm) {
      setShowConfirm(true);
      setTimeout(() => setShowConfirm(false), 3000);
      return;
    }
    cancelWorkout();
    setShowConfirm(false);
  };

  // Don't render anything if no workout or we're on the workout page
  if (!activeWorkout || isOnWorkoutPage) return null;

  return (
    <div
      className="fixed left-0 right-0 z-50 flex items-center gap-3 px-4 py-3 mx-2 mb-2 rounded-2xl shadow-lg"
      style={{
        bottom: 'calc(60px + 8px)',
        backgroundColor: 'rgba(20, 20, 20, 0.92)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {/* Icon */}
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: 'var(--color-surface-2)' }}
      >
        <Dumbbell size={16} style={{ color: 'var(--color-primary)' }} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: 'var(--color-text)' }}>
          {activeWorkout.name}
        </p>
        {currentExercise && (
          <p className="text-xs truncate" style={{ color: 'var(--color-text-2)' }}>
            {currentExercise}
          </p>
        )}
      </div>

      {/* Timer */}
      <div className="flex items-center gap-1 flex-shrink-0" style={{ color: 'var(--color-text-2)' }}>
        <Clock size={12} />
        <span className="text-xs font-mono">{formatDuration(elapsed)}</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {showConfirm ? (
          <>
            <button
              onClick={handleDelete}
              className="px-2 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1"
              style={{ backgroundColor: '#ef4444', color: '#fff' }}
            >
              <X size={10} /> ¿Eliminar?
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              className="px-2 py-1.5 rounded-lg text-xs"
              style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text-2)' }}
            >
              No
            </button>
          </>
        ) : (
          <>
            <button
              onClick={handleDelete}
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
              title="Cancelar workout"
            >
              <X size={14} />
            </button>
            {workoutId && (
              <button
                onClick={() => navigate('/workouts')}
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: 'var(--color-primary)', color: '#000' }}
                title="Ver workouts"
              >
                <ArrowRight size={14} />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
