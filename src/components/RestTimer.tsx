// Componente RestTimer — barra de cuenta regresiva para descanso entre series
import { useEffect, useRef, useState } from 'react';
import { useWorkoutStore } from '../store/workoutStore';
import { useSettingsStore } from '../store/settingsStore';
import { getDb } from '../database/init';
import { searchExercises, getLastExerciseSets, getExerciseBestRestTime } from '../database/queries';
import { X, Plus, Minus, Search, Clock, Trophy } from 'lucide-react';
import { differenceInSeconds } from 'date-fns';
import type { Exercise } from '../types';

// Play a short beep via Web Audio API
function playBeep(frequency = 880, duration = 0.15, volume = 0.4) {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioContextClass();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.frequency.value = frequency;
    oscillator.type = 'sine';
    gainNode.gain.setValueAtTime(volume, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);
  } catch {
    // AudioContext not available — silently ignore
  }
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function RestTimer() {
  const { restActive, restTimeRemaining, restDuration, stopRest, tickRest, startRest, setRestDuration, activeWorkout, addExerciseToWorkout } = useWorkoutStore();
  const { vibrationEnabled, soundEnabled } = useSettingsStore();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // F169 — Workout elapsed timer: track elapsed time during rest
  const [workoutElapsed, setWorkoutElapsed] = useState(0);

  // F118 — Quick-add exercise modal state
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddSearch, setQuickAddSearch] = useState('');
  const [quickAddResults, setQuickAddResults] = useState<Exercise[]>([]);
  const quickAddInputRef = useRef<HTMLInputElement>(null);

  // Tick del timer
  useEffect(() => {
    if (restActive) {
      intervalRef.current = setInterval(() => {
        tickRest();
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [restActive, tickRest]);

  // F169 — Track workout elapsed time while rest is active
  useEffect(() => {
    if (!activeWorkout || !restActive) return;
    const update = () => {
      const started = new Date(activeWorkout.startedAt);
      const total = differenceInSeconds(new Date(), started);
      const paused = activeWorkout.pausedAt
        ? Math.round((Date.now() - new Date(activeWorkout.pausedAt).getTime()) / 1000)
        : 0;
      setWorkoutElapsed(Math.max(0, total - activeWorkout.totalPausedSeconds - paused));
    };
    update();
    const elapsedInterval = setInterval(update, 1000);
    return () => clearInterval(elapsedInterval);
  }, [restActive, activeWorkout]);

  // F195 — 3-second countdown warning: distinct beep + visual flash at 3, 2, 1
  const [countdownWarning, setCountdownWarning] = useState(false);
  const prevRestTimeRef = useRef(restTimeRemaining);

  // F267 — Best rest time for the current exercise (personal best = minimum rest time)
  // F267 — isRestPR is computed as derived state — no separate state needed, avoids cascading renders
  const [bestRestTime, setBestRestTime] = useState<number | null>(null);

  // F267 — Load best rest time (minimum rest in last 30 days) for the current exercise when rest starts
  const { lastExerciseIdForRest } = useWorkoutStore();
  useEffect(() => {
    if (!restActive || !lastExerciseIdForRest) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: null reset on deps change
      setBestRestTime(null);
      return;
    }
    const db = getDb();
     
    setBestRestTime(db ? getExerciseBestRestTime(db, lastExerciseIdForRest) : null);
  }, [restActive, lastExerciseIdForRest]);

  // F267 — Derived: isRestPR is computed directly from the freshly-fetched bestRestTime in the same render pass.
  // restDuration is a store value (not derived from state), so this is stable and doesn't create cascading renders.
  const isRestPR =
    restActive &&
    bestRestTime !== null &&
    bestRestTime > 0 &&
    restDuration <= bestRestTime;

  // F169 — Countdown warning at 3, 2, 1 seconds remaining
  useEffect(() => {
    if (!restActive) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting visual warning state when rest ends is intentional UX
      setCountdownWarning(false);
      prevRestTimeRef.current = restTimeRemaining;
      return;
    }
    const prev = prevRestTimeRef.current;
    // Fire when timer crosses 3 → 2, 2 → 1, 1 → 0
    if (
      (prev > 3 && restTimeRemaining === 3) ||
      (prev > 2 && restTimeRemaining === 2) ||
      (prev > 1 && restTimeRemaining === 1)
    ) {
      setCountdownWarning(true);
      // Play countdown beep — higher pitch than the completion beep
      if (soundEnabled) {
        playBeep(restTimeRemaining === 3 ? 1200 : restTimeRemaining === 2 ? 1400 : 1600, 0.1, 0.5);
      }
      // Short vibration pattern
      if (vibrationEnabled && 'vibrate' in navigator) {
        navigator.vibrate(80);
      }
      setTimeout(() => setCountdownWarning(false), 300);
    }
    prevRestTimeRef.current = restTimeRemaining;
  }, [restTimeRemaining, restActive, soundEnabled, vibrationEnabled]);

  // Vibración y sonido al terminar
  useEffect(() => {
    if (restTimeRemaining === 0 && intervalRef.current) {
      clearInterval(intervalRef.current);
      // Vibración si disponible y activada
      if (vibrationEnabled && 'vibrate' in navigator) {
        navigator.vibrate([200, 100, 200]);
      }
      // Sonido si activado (F109)
      if (soundEnabled) {
        playBeep(880, 0.15, 0.4);
      }
    }
  }, [restTimeRemaining, vibrationEnabled, soundEnabled]);

  // F118 — Quick-add exercise search
  useEffect(() => {
    if (!showQuickAdd) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- cascading render is intended UX here
      setQuickAddSearch('');
      setQuickAddResults([]);
      return;
    }
    // Focus input after modal opens
    setTimeout(() => quickAddInputRef.current?.focus(), 50);
  }, [showQuickAdd]);

  useEffect(() => {
    if (!showQuickAdd) return;
    if (quickAddSearch.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- cascading render is intended UX here
      setQuickAddResults([]);
      return;
    }
    const db = getDb();
    if (!db) return;
    const results = searchExercises(db, quickAddSearch);
    setQuickAddResults(results.slice(0, 50));
  }, [quickAddSearch, showQuickAdd]);

  const handleQuickAddExercise = (exercise: Exercise) => {
    if (!activeWorkout) return;
    const db = getDb();
    if (!db) return;
    const lastSets = getLastExerciseSets(db, exercise.id);
    addExerciseToWorkout(exercise.id, exercise.name, 3, lastSets);
    setShowQuickAdd(false);
    setQuickAddSearch('');
    setQuickAddResults([]);
  };

  // F129 — Keyboard shortcuts for rest timer presets
  useEffect(() => {
    if (!restActive) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      if (isInput) return;
      // Keys 1-4 map to preset durations: 1=60s, 2=90s, 3=120s, 4=180s
      const presetMap: Record<string, number> = { '1': 60, '2': 90, '3': 120, '4': 180 };
      if (presetMap[e.key] !== undefined) {
        e.preventDefault();
        startRest(presetMap[e.key]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [restActive, startRest]);

  if (!restActive && restTimeRemaining === 0) return null;

  const progress = restDuration > 0 ? restTimeRemaining / restDuration : 0;
  const isDone = restTimeRemaining === 0;

  // F130 — Circular SVG ring parameters
  const CIRCLE_RADIUS = 28;
  const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS;
  const strokeDashoffset = CIRCLE_CIRCUMFERENCE * (1 - progress);

  // F101 — Adjust time without resetting progress
  // +15s: if done, restart timer with new duration; if running, extend both remaining and total duration
  // -15s: clamp remaining to minimum 1 second to prevent negative values
  const handlePlus15 = () => {
    const next = restTimeRemaining + 15;
    if (isDone) {
      // Restart the timer from the new extended duration
      startRest(next);
    } else {
      setRestDuration(next);
      useWorkoutStore.setState({ restTimeRemaining: next });
    }
  };

  const handleMinus15 = () => {
    const next = Math.max(1, restTimeRemaining - 15);
    if (isDone) {
      // Restart with the reduced duration
      startRest(next);
    } else {
      setRestDuration(next);
      useWorkoutStore.setState({ restTimeRemaining: next });
    }
  };

  return (
    <>
      <style>{`
        @keyframes flashWarning {
          0% { opacity: 1; }
          50% { opacity: 0.7; }
          100% { opacity: 1; }
        }
      `}</style>
      <div
        className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4 pt-3"
        role="timer"
        aria-label={`Temporizador de descanso: ${isDone ? 'descanso terminado' : formatTime(restTimeRemaining)}`}
        style={{
          background: isDone
            ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
            : countdownWarning
            ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
            : 'linear-gradient(135deg, var(--color-primary) 0%, #6366f1 100%)',
          boxShadow: '0 -4px 20px rgba(0,0,0,0.3)',
          animation: countdownWarning ? 'flashWarning 0.3s ease-out' : undefined,
        }}
      >
        <div className="flex items-center gap-3">
          {/* Skip */}
          <button
            onClick={stopRest}
            className="p-1.5 rounded-lg flex-shrink-0"
            style={{ backgroundColor: 'rgba(255,255,255,20%)' }}
          >
            <X size={16} color="#fff" />
          </button>

          {/* F130 — Circular countdown ring + time display */}
          <div className="relative flex-shrink-0 flex items-center justify-center" style={{ width: 72, height: 72 }}>
            <svg
              width="72"
              height="72"
              viewBox="0 0 72 72"
              style={{ transform: 'rotate(-90deg)', position: 'absolute' }}
            >
              {/* Background ring */}
              <circle
                cx="36"
                cy="36"
                r={CIRCLE_RADIUS}
                fill="none"
                stroke="rgba(255,255,255,25%)"
                strokeWidth="5"
              />
              {/* Progress ring */}
              <circle
                cx="36"
                cy="36"
                r={CIRCLE_RADIUS}
                fill="none"
                stroke="#fff"
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={CIRCLE_CIRCUMFERENCE}
                strokeDashoffset={isDone ? 0 : strokeDashoffset}
                style={{ transition: 'stroke-dashoffset 0.9s linear' }}
              />
            </svg>
            {/* Time text centered */}
            <span className="text-white font-bold text-base leading-none z-10">
              {isDone
                ? '✓'
                : restTimeRemaining >= 60
                ? `${Math.floor(restTimeRemaining / 60)}:${(restTimeRemaining % 60).toString().padStart(2, '0')}`
                : restTimeRemaining
              }
            </span>
          </div>

          {/* Info central */}
          <div className="flex-1 min-w-0">
            {/* F130 — Label row (replaces old progress bar) */}
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-white font-bold text-base">
                {isDone ? '¡Descanso terminado!' : `Descanso`}
              </span>
              {!isDone && (
                <span className="text-white text-xs opacity-80">
                  {Math.round(progress * 100)}%
                </span>
              )}
            </div>

            {/* Percentage bar below label — subtle */}
            <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,20%)' }}>
              <div
                className="h-full rounded-full transition-all duration-1000"
                style={{
                  width: isDone ? '100%' : `${progress * 100}%`,
                  backgroundColor: 'rgba(255,255,255,60%)',
                }}
              />
            </div>

            {/* F169 — Workout elapsed time indicator */}
            {workoutElapsed > 0 && (
              <div className="flex items-center gap-1 mt-1">
                <Clock size={10} className="text-white opacity-60" />
                <span className="text-white opacity-70 text-[10px] font-medium">
                  Workout: {Math.floor(workoutElapsed / 60)}:{(workoutElapsed % 60).toString().padStart(2, '0')}
                </span>
              </div>
            )}

            {/* F267 — Best rest time PR indicator */}
            {isRestPR && bestRestTime && (
              <div className="flex items-center gap-1 mt-0.5">
                <Trophy size={10} className="text-yellow-300" />
                <span className="text-yellow-200 text-[10px] font-bold">
                  ¡Nuevo PR! Mejor: {formatTime(bestRestTime)}
                </span>
              </div>
            )}
          </div>

          {/* Ajustes de tiempo */}
          {!isDone && (
            <div className="flex gap-1 flex-shrink-0">
              <button
                onClick={handleMinus15}
                className="p-1.5 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: 'rgba(255,255,255,20%)' }}
                title="-15s"
              >
                <Minus size={14} color="#fff" />
              </button>
              <button
                onClick={handlePlus15}
                className="p-1.5 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: 'rgba(255,255,255,20%)' }}
                title="+15s"
              >
                <Plus size={14} color="#fff" />
              </button>
              {/* F118 — Quick-add exercise button */}
              {activeWorkout && (
                <button
                  onClick={() => setShowQuickAdd(true)}
                  className="p-1.5 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: 'rgba(255,255,255,20%)' }}
                  title="Añadir ejercicio"
                >
                  <Plus size={14} color="#fff" />
                </button>
              )}
            </div>
          )}

          {/* Listo para siguiente */}
          {isDone && (
            <button
              onClick={stopRest}
              className="px-3 py-1.5 rounded-lg text-sm font-bold flex-shrink-0"
              style={{ backgroundColor: 'rgba(255,255,255,25%)', color: '#fff' }}
            >
              Continuar
            </button>
          )}
        </div>

        {/* Quick presets */}
        {!isDone && (
          <div className="flex gap-2 mt-2 justify-center">
            {[60, 90, 120, 180].map((seconds, idx) => (
              <button
                key={seconds}
                onClick={() => startRest(seconds)}
                className="px-2 py-0.5 rounded text-xs font-medium transition-all"
                style={{
                  backgroundColor: restTimeRemaining === seconds ? 'rgba(255,255,255,30%)' : 'transparent',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,30%)',
                }}
              >
                {seconds >= 60 ? `${seconds / 60}m` : `${seconds}s`}
                <span className="ml-1 opacity-60 text-[9px]">{idx + 1}</span>
              </button>
            ))}
          </div>
        )}
        {/* F129 — Keyboard shortcut hint */}
        {restActive && !isDone && (
          <p className="text-center text-white opacity-50 text-[9px] mt-1">
            Pulsa 1–4 para cambiar duración
          </p>
        )}

        {/* F118 — Quick-add exercise modal */}
        {showQuickAdd && (
          <div
            className="fixed inset-0 z-[60] flex items-end justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
            onClick={(e) => { if (e.target === e.currentTarget) setShowQuickAdd(false); }}
          >
            <div
              className="w-full max-w-lg rounded-t-2xl p-4 pb-6"
              style={{ backgroundColor: 'var(--color-surface)', animation: 'slideUp 0.2s ease-out' }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Search size={16} style={{ color: 'var(--color-text-2)' }} />
                <input
                  ref={quickAddInputRef}
                  type="text"
                  value={quickAddSearch}
                  onChange={e => setQuickAddSearch(e.target.value)}
                  placeholder="Buscar ejercicio..."
                  className="flex-1 px-3 py-2 rounded-lg text-sm"
                  style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                />
                <button
                  onClick={() => setShowQuickAdd(false)}
                  className="p-1.5 rounded-lg"
                  style={{ backgroundColor: 'var(--color-surface-2)' }}
                >
                  <X size={14} />
                </button>
              </div>
              <div className="max-h-64 overflow-y-auto space-y-1">
                {quickAddSearch.length < 2 && (
                  <p className="text-xs text-center py-4" style={{ color: 'var(--color-text-2)' }}>
                    Escribe al menos 2 caracteres para buscar
                  </p>
                )}
                {quickAddResults.length === 0 && quickAddSearch.length >= 2 && (
                  <p className="text-xs text-center py-4" style={{ color: 'var(--color-text-2)' }}>
                    No se encontraron ejercicios
                  </p>
                )}
                {quickAddResults.map(ex => {
                  const alreadyAdded = activeWorkout?.exercises.some(e => e.exercise_id === ex.id);
                  return (
                    <button
                      key={ex.id}
                      onClick={() => !alreadyAdded && handleQuickAddExercise(ex)}
                      disabled={alreadyAdded}
                      className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors disabled:opacity-50"
                      style={{ backgroundColor: 'var(--color-surface-2)' }}
                    >
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: alreadyAdded ? 'var(--color-text-2)' : 'var(--color-primary)' }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{ex.name}</p>
                        <p className="text-xs" style={{ color: 'var(--color-text-2)' }}>
                          {ex.muscle_group} · {ex.equipment}
                        </p>
                      </div>
                      {alreadyAdded && (
                        <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text-2)' }}>
                          Ya añadido
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
