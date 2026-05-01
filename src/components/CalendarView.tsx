import { useState } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronUp, ChevronDown } from 'lucide-react';
import type { Workout } from '../types';

interface CalendarViewProps {
  workoutHistory: Workout[];
  onSelectWorkout: (workoutId: string) => void;
  onClose?: () => void;
}

export default function CalendarView({ workoutHistory, onSelectWorkout }: CalendarViewProps) {
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const start = startOfMonth(calendarMonth);
  const end = endOfMonth(calendarMonth);
  const days = eachDayOfInterval({ start, end });
  // Monday = 0
  const startDow = (getDay(start) + 6) % 7;

  // Group workouts by date
  const workoutDates: Record<string, Workout[]> = {};
  workoutHistory.forEach(w => {
    const d = w.started_at ? format(new Date(w.started_at), 'yyyy-MM-dd') : null;
    if (d) {
      if (!workoutDates[d]) workoutDates[d] = [];
      workoutDates[d].push(w);
    }
  });

  // Pad cells so rows are complete
  const cells: (Date | null)[] = [...Array(startDow).fill(null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);

  const selectedDayWorkouts = selectedDay ? workoutDates[selectedDay] || [] : [];

  return (
    <>
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setCalendarMonth(m => subMonths(m, 1))}
          className="p-1.5 rounded-lg"
          style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text-2)' }}
        >
          <ChevronDown size={14} className="rotate-90" />
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCalendarMonth(m => subMonths(m, 12))}
            className="p-1 rounded text-xs font-bold"
            style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text-2)' }}
            title="Año anterior"
          >
            &lt;&lt;
          </button>
          <span className="text-sm font-bold capitalize min-w-[100px] text-center">
            {format(calendarMonth, 'MMMM yyyy', { locale: es })}
          </span>
          <button
            onClick={() => setCalendarMonth(m => addMonths(m, 12))}
            className="p-1 rounded text-xs font-bold"
            style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text-2)' }}
            title="Año siguiente"
          >
            &gt;&gt;
          </button>
        </div>
        <button
          onClick={() => setCalendarMonth(m => addMonths(m, 1))}
          className="p-1.5 rounded-lg"
          style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text-2)' }}
        >
          <ChevronUp size={14} className="rotate-90" />
        </button>
      </div>

      {/* Day labels */}
      <div className="grid grid-cols-7 mb-1">
        {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d, i) => (
          <div key={i} className="text-center text-[10px] font-bold" style={{ color: 'var(--color-text-2)' }}>{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, idx) => {
          if (!day) return <div key={`empty-${idx}`} />;
          const dateKey = format(day, 'yyyy-MM-dd');
          const workouts = workoutDates[dateKey] || [];
          const hasWorkout = workouts.length > 0;
          const isToday = format(new Date(), 'yyyy-MM-dd') === dateKey;
          const isSelected = selectedDay === dateKey;

          return (
            <button
              key={dateKey}
              onClick={() => {
                if (hasWorkout) {
                  if (workouts.length === 1) {
                    onSelectWorkout(workouts[0].id);
                  } else {
                    setSelectedDay(dateKey);
                  }
                }
              }}
              className="flex flex-col items-center justify-center aspect-square rounded-lg text-xs transition-colors"
              style={{
                backgroundColor: isSelected
                  ? 'var(--color-primary)'
                  : isToday
                  ? 'var(--color-surface-2)'
                  : 'transparent',
                color: isSelected
                  ? '#000'
                  : hasWorkout
                  ? 'var(--color-text)'
                  : 'var(--color-text-2)',
                cursor: hasWorkout ? 'pointer' : 'default',
              }}
            >
              <span className="text-[11px] font-medium">{format(day, 'd')}</span>
              {hasWorkout && !isSelected && (
                <div
                  className="mt-0.5 rounded-full"
                  style={{
                    width: workouts.length === 1 ? '5px' : '14px',
                    height: '5px',
                    backgroundColor: 'var(--color-primary)',
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Day workouts bottom sheet */}
      {selectedDay && (
        <div
          className="mt-3 rounded-xl overflow-hidden"
          style={{ backgroundColor: 'var(--color-surface)' }}
        >
          <div className="p-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--color-border)' }}>
            <span className="text-sm font-semibold capitalize">
              {format(new Date(selectedDay + 'T12:00:00'), "d 'de' MMMM", { locale: es })}
              {' — '}{selectedDayWorkouts.length} {selectedDayWorkouts.length === 1 ? 'workout' : 'workouts'}
            </span>
            <button
              onClick={() => setSelectedDay(null)}
              className="p-1 rounded text-xs"
              style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text-2)' }}
            >
              ✕
            </button>
          </div>
          <div className="max-h-40 overflow-y-auto">
            {selectedDayWorkouts.map(w => (
              <button
                key={w.id}
                onClick={() => onSelectWorkout(w.id)}
                className="w-full flex items-center gap-2 p-3 text-left border-b last:border-b-0"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <div
                  className="w-1.5 h-8 rounded-full"
                  style={{ backgroundColor: 'var(--color-primary)' }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{w.name}</p>
                  <p className="text-xs" style={{ color: 'var(--color-text-2)' }}>
                    {w.started_at ? format(new Date(w.started_at), 'HH:mm') : ''}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
