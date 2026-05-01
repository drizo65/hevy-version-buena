// Tarjeta de resumen del workout para capturar como imagen JPG
// Se usa html2canvas para convertir el div a JPG

import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface SetRow {
  reps: number;
  weight: number;
  rpe: number | null;
  set_type: string;
  notes?: string;
}

interface ExerciseRow {
  exercise_name: string;
  sets: SetRow[];
}

interface WorkoutShareCardProps {
  workoutName: string;
  date: string; // ISO string
  durationSeconds: number;
  exercises: ExerciseRow[];
  totalVolume: number; // kg
  workoutCount: number; // total workouts hasta la fecha
  muscleGroups: string[]; // músculos trabajados
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

const MUSCLE_LABELS: Record<string, string> = {
  chest: 'Pecho', back: 'Espalda', legs: 'Piernas',
  shoulders: 'Hombros', arms: 'Brazos', core: 'Core',
  cardio: 'Cardio', full_body: 'Full Body',
};

export default function WorkoutShareCard({
  workoutName, date, durationSeconds, exercises, totalVolume, workoutCount, muscleGroups,
}: WorkoutShareCardProps) {
  const totalSets = exercises.reduce((acc, ex) => acc + ex.sets.filter(s => s.set_type === 'normal').length, 0);

  return (
    <div
      id="workout-share-card"
      style={{
        width: 600,
        backgroundColor: '#0f0f0f',
        color: '#ffffff',
        padding: 28,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        borderRadius: 20,
        boxSizing: 'border-box',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <div>
            <div style={{ fontSize: 11, color: '#888888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
              Workout completado
            </div>
            <div style={{ fontSize: 26, fontWeight: '800', color: '#f97316', letterSpacing: -0.5 }}>
              {workoutName}
            </div>
          </div>
          {/* Badge */}
          <div style={{
            backgroundColor: '#f97316',
            borderRadius: 20,
            padding: '4px 12px',
            fontSize: 11,
            fontWeight: '700',
            color: '#000',
          }}>
            #{workoutCount}
          </div>
        </div>
        <div style={{ fontSize: 13, color: '#888888', marginTop: 4 }}>
          {format(new Date(date), "EEEE, d 'de' MMMM yyyy", { locale: es })}
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Duración', value: formatDuration(durationSeconds) },
          { label: 'Ejercicios', value: exercises.length.toString() },
          { label: 'Series', value: totalSets.toString() },
          { label: 'Volumen', value: totalVolume > 0 ? `${(totalVolume / 1000).toFixed(1)}k kg` : '—' },
        ].map(stat => (
          <div key={stat.label} style={{
            flex: 1,
            backgroundColor: '#1a1a1a',
            borderRadius: 12,
            padding: '10px 8px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 18, fontWeight: '700', color: '#f97316' }}>{stat.value}</div>
            <div style={{ fontSize: 10, color: '#666666', marginTop: 2 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Muscle tags */}
      {muscleGroups.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
          {muscleGroups.slice(0, 5).map(mg => (
            <span key={mg} style={{
              backgroundColor: '#1a1a1a',
              borderRadius: 20,
              padding: '4px 10px',
              fontSize: 11,
              color: '#aaaaaa',
              fontWeight: '500',
            }}>
              {MUSCLE_LABELS[mg] || mg}
            </span>
          ))}
        </div>
      )}

      {/* Exercise list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {exercises.slice(0, 6).map((ex, i) => (
          <div key={i} style={{
            backgroundColor: '#1a1a1a',
            borderRadius: 10,
            padding: '10px 14px',
          }}>
            <div style={{ fontSize: 13, fontWeight: '700', marginBottom: 6, color: '#ffffff' }}>
              {ex.exercise_name}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {ex.sets.slice(0, 6).map((set, si) => (
                <div key={si} style={{
                  backgroundColor: '#2a2a2a',
                  borderRadius: 6,
                  padding: '3px 8px',
                  fontSize: 11,
                  color: '#cccccc',
                  fontWeight: '500',
                }}>
                  {set.weight > 0 ? `${set.weight}kg` : '—'} × {set.reps}
                  {set.rpe && <span style={{ color: '#f97316', marginLeft: 3 }}>@{set.rpe}</span>}
                </div>
              ))}
            </div>
          </div>
        ))}
        {exercises.length > 6 && (
          <div style={{ textAlign: 'center', color: '#555555', fontSize: 12, padding: '6px 0' }}>
            + {exercises.length - 6} ejercicios más
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        marginTop: 20,
        paddingTop: 14,
        borderTop: '1px solid #2a2a2a',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ fontSize: 11, color: '#555555' }}>
          Entrenamiento con HEVY
        </div>
        <div style={{ fontSize: 11, color: '#444444' }}>
          {format(new Date(), 'd MMM yyyy', { locale: es })}
        </div>
      </div>
    </div>
  );
}
