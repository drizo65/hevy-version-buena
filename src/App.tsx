import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import ExercisesPage from './pages/ExercisesPage';
import WorkoutsPage from './pages/WorkoutsPage';
import ProgressPage from './pages/ProgressPage';
import SettingsPage from './pages/SettingsPage';
import ExerciseDetailPage from './pages/ExerciseDetailPage';
import ExerciseProgressPage from './pages/ExerciseProgressPage';
import RoutinesPage from './pages/RoutinesPage';
import RoutineDetailPage from './pages/RoutineDetailPage';
import CustomExercisePage from './pages/CustomExercisePage';
import WorkoutDetailPage from './pages/WorkoutDetailPage';
import MeasurementsPage from './pages/MeasurementsPage';
import CompareWorkoutsPage from './pages/CompareWorkoutsPage';
import Toast from './components/ui/Toast';
import { useEffect, useState } from 'react';
import { initDatabase } from './database/init';
import { useExerciseStore } from './store/exerciseStore';
import { getAllExercises } from './database/queries';
import { initNotificationService } from './services/notifications';
import { toastStore, type ToastMessage } from './components/ui/toastStore';
import FloatingWorkoutBar from './components/FloatingWorkoutBar';

// F60 — Global keyboard shortcut listener for quick exercise search
function KeyboardShortcuts() {
  const navigate = useNavigate();
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't trigger when typing in an input/textarea (except for "/" which is often a shortcut)
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      // "/" is always a shortcut (common in UX patterns), "f" only when not in an input
      if (e.key === '/' && !isInput) {
        e.preventDefault();
        navigate('/exercises');
      } else if (e.key.toLowerCase() === 'f' && !isInput && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        navigate('/exercises');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate]);
  return null;
}

// Toast listener — subscribes to toastStore and renders the Toast component
function ToastManager() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  useEffect(() => {
    // Subscribe to toast store — the callback handles all state updates
    const unsubscribe = toastStore.subscribe(setToasts);
    return () => { unsubscribe(); };
  }, []);
  return <Toast toasts={toasts} onDismiss={toastStore.dismiss} />;
}

export default function App() {
  const [ready, setReady] = useState(false);
  const setExercises = useExerciseStore(s => s.setExercises);

  useEffect(() => {
    initDatabase()
      .then(db => {
        const exercises = getAllExercises(db);
        setExercises(exercises);
        setReady(true);
        // Initialize notification service (F11)
        initNotificationService().catch(err => {
          console.warn('Notification service init failed:', err);
        });
      })
      .catch(err => {
        console.error('Database initialization failed:', err);
        setReady(true); // Still show app in degraded mode
      });
  }, [setExercises]);

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--color-bg)]">
        <div className="text-center">
          <div className="text-4xl font-black mb-2" style={{ color: 'var(--color-primary)' }}>H</div>
          <p className="text-sm" style={{ color: 'var(--color-text-2)' }}>Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <KeyboardShortcuts />
      <ToastManager />
      <FloatingWorkoutBar />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<ExercisesPage />} />
          <Route path="/workouts" element={<WorkoutsPage />} />
          <Route path="/progress" element={<ProgressPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/exercise/:id" element={<ExerciseDetailPage />} />
          <Route path="/exercise-progress/:id" element={<ExerciseProgressPage />} />
          <Route path="/routines" element={<RoutinesPage />} />
          <Route path="/routine/:id" element={<RoutineDetailPage />} />
          <Route path="/exercise/custom" element={<CustomExercisePage />} />
          <Route path="/exercise/custom/:id" element={<CustomExercisePage />} />
          <Route path="/workout/:id" element={<WorkoutDetailPage />} />
          <Route path="/workout-compare" element={<CompareWorkoutsPage />} />
          <Route path="/measurements" element={<MeasurementsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
