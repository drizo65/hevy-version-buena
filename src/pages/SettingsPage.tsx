import { useState, useEffect } from 'react';
import { useSettingsStore } from '../store/settingsStore';
import { Scale, Clock, Repeat, Info, Download, Upload, AlertTriangle, Bell, Vibrate, TrendingUp, Volume2, Ruler, BellOff, BellRing, BellMinus } from 'lucide-react';
import { getDb } from '../database/init';
import { exportAllData, importAllData } from '../database/mutations';
import { requestNotificationPermission, scheduleNextReminder } from '../services/notifications';
import Toggle from '../components/ui/Toggle';
import { toastStore } from '../components/ui/toastStore';

export default function SettingsPage() {
  const {
    unit, measurementUnit, defaultRestSeconds, defaultSets, defaultReps,
    autoStartRest, vibrationEnabled, soundEnabled,
    reminderEnabled, reminderTime, reminderDays,
    muscleAlertDays, targetDurationMinutes,
    setUnit, setMeasurementUnit, setDefaultRest, setDefaultSets, setDefaultReps,
    setAutoStartRest, setVibrationEnabled, setSoundEnabled,
    setReminderEnabled, setReminderTime, setReminderDays,
    setMuscleAlertDays, setTargetDurationMinutes,
  } = useSettingsStore();

  // F11 — Request notification permission when enabling reminders
  const handleSetReminderEnabled = async (enabled: boolean) => {
    if (enabled) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        toastStore.error('Activa las notificaciones en tu navegador para recibir recordatorios');
        return;
      }
    }
    setReminderEnabled(enabled);
  };

  // F244 — Notification permission status (tracked reactively so UI updates when permission changes)
  const [notifPermission, setNotifPermission] = useState<'granted' | 'denied' | 'default' | 'unsupported'>(() => {
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission as 'granted' | 'denied' | 'default';
  });

  // Re-check permission whenever the window gains focus (user may have changed it in browser settings)
  useEffect(() => {
    const check = () => {
      if (!('Notification' in window)) {
        setNotifPermission('unsupported');
      } else {
        setNotifPermission(Notification.permission as 'granted' | 'denied' | 'default');
      }
    };
    window.addEventListener('focus', check);
    return () => window.removeEventListener('focus', check);
  }, []);

  // F11 — Reschedule notification whenever reminder settings change
  useEffect(() => {
    // Only schedule if notifications are supported and permission is granted
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      scheduleNextReminder();
    }
  }, [reminderEnabled, reminderTime, reminderDays]);

  const handleRequestPermission = async () => {
    const granted = await requestNotificationPermission();
    if (!('Notification' in window)) {
      setNotifPermission('unsupported');
    } else {
      setNotifPermission(Notification.permission as 'granted' | 'denied' | 'default');
    }
    if (granted) {
      toastStore.success('Notificaciones activadas');
      scheduleNextReminder(); // F11 — schedule once permission is granted
    }
  };

  const dayLabels = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const toggleDay = (day: number) => {
    if (reminderDays.includes(day)) {
      setReminderDays(reminderDays.filter(d => d !== day));
    } else {
      setReminderDays([...reminderDays, day].sort());
    }
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        // Validate basic structure before importing
        if (!data || typeof data !== 'object') {
          throw new Error('Invalid backup format');
        }
        const db = getDb();
        if (!db) return;
        importAllData(db, data);
        toastStore.success('Datos importados correctamente');
        setTimeout(() => window.location.reload(), 1000);
      } catch {
        toastStore.error('Error al importar', 'Asegúrate de que el archivo es un backup válido de HEVY.');
      }
    };
    reader.readAsText(file);
    // Reset input so same file can be re-imported
    e.target.value = '';
  };

  const handleExport = () => {
    const db = getDb();
    if (!db) return;
    try {
      const data = exportAllData(db);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hevy-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toastStore.success('Backup descargado');
    } catch {
      toastStore.error('Error al exportar');
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
        <h1 className="text-2xl font-bold">Ajustes</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Unit */}
        <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Scale size={16} className="text-[var(--color-primary)]" />
            <h3 className="text-sm font-semibold">Unidades</h3>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setUnit('kg')}
              className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors"
              aria-pressed={unit === 'kg'}
              style={{
                backgroundColor: unit === 'kg' ? 'var(--color-primary)' : 'var(--color-surface-2)',
                color: unit === 'kg' ? '#000' : 'var(--color-text-2)',
              }}
            >
              KG
            </button>
            <button
              onClick={() => setUnit('lbs')}
              className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors"
              aria-pressed={unit === 'lbs'}
              style={{
                backgroundColor: unit === 'lbs' ? 'var(--color-primary)' : 'var(--color-surface-2)',
                color: unit === 'lbs' ? '#000' : 'var(--color-text-2)',
              }}
            >
              LBS
            </button>
          </div>
        </div>

        {/* F115 — Measurement unit */}
        <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Ruler size={16} className="text-[var(--color-primary)]" />
            <h3 className="text-sm font-semibold">Unidades de medida corporal</h3>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setMeasurementUnit('cm')}
              className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors"
              aria-pressed={measurementUnit === 'cm'}
              style={{
                backgroundColor: measurementUnit === 'cm' ? 'var(--color-primary)' : 'var(--color-surface-2)',
                color: measurementUnit === 'cm' ? '#000' : 'var(--color-text-2)',
              }}
            >
              CM
            </button>
            <button
              onClick={() => setMeasurementUnit('in')}
              className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors"
              aria-pressed={measurementUnit === 'in'}
              style={{
                backgroundColor: measurementUnit === 'in' ? 'var(--color-primary)' : 'var(--color-surface-2)',
                color: measurementUnit === 'in' ? '#000' : 'var(--color-text-2)',
              }}
            >
              IN
            </button>
          </div>
          <p className="text-xs mt-2" style={{ color: 'var(--color-text-2)' }}>
            Afecta a medidas corporales (cintura, bíceps, etc.)
          </p>
        </div>

        {/* Default rest */}
        <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Clock size={16} className="text-[var(--color-primary)]" />
            <h3 className="text-sm font-semibold">Descanso por defecto</h3>
          </div>
          <div className="flex gap-2 flex-wrap">
            {[60, 90, 120, 180, 300].map(secs => (
              <button
                key={secs}
                onClick={() => setDefaultRest(secs)}
                className="px-3 py-2 rounded-lg text-sm"
                style={{
                  backgroundColor: defaultRestSeconds === secs ? 'var(--color-primary)' : 'var(--color-surface-2)',
                  color: defaultRestSeconds === secs ? '#000' : 'var(--color-text-2)',
                }}
              >
                {secs < 60 ? `${secs}s` : `${secs / 60}m`}
              </button>
            ))}
          </div>
        </div>

        {/* Auto-start rest timer */}
        <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Clock size={16} className="text-[var(--color-primary)]" />
            <h3 className="text-sm font-semibold">Inicio automático del descanso</h3>
          </div>
          <Toggle
            value={autoStartRest}
            onChange={setAutoStartRest}
            description="Iniciar el timer de descanso automáticamente al completar una serie"
          />
        </div>

        {/* Vibration toggle */}
        <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
          <Toggle
            value={vibrationEnabled}
            onChange={setVibrationEnabled}
            icon={<Vibrate size={16} />}
            label="Vibración al terminar"
            description="Vibrar cuando termine el tiempo de descanso"
          />
        </div>

        {/* Sound toggle (F109) */}
        <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
          <Toggle
            value={soundEnabled}
            onChange={setSoundEnabled}
            icon={<Volume2 size={16} />}
            label="Sonido al terminar"
            description="Reproducir un sonido cuando termine el tiempo de descanso"
          />
        </div>

        {/* Muscle group frequency alert threshold */}
        <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={16} className="text-[var(--color-primary)]" />
            <h3 className="text-sm font-semibold">Aviso músculos sin trabajar</h3>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs" style={{ color: 'var(--color-text-2)' }}>
              Alertar si un músculo no se ha entrenado en
            </p>
            <div className="flex gap-1">
              {[5, 7, 10, 14, 21].map(n => (
                <button
                  key={n}
                  onClick={() => setMuscleAlertDays(n)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium"
                  style={{
                    backgroundColor: muscleAlertDays === n ? 'var(--color-primary)' : 'var(--color-surface-2)',
                    color: muscleAlertDays === n ? '#000' : 'var(--color-text-2)',
                  }}
                >
                  {n}d
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs mt-1.5" style={{ color: 'var(--color-text-2)' }}>
            Aparece en Progreso cuando un grupo muscular lleva X días sin volumen de entrenamiento.
          </p>
        </div>

        {/* Workout duration goal */}
        <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Clock size={16} className="text-[var(--color-primary)]" />
            <h3 className="text-sm font-semibold">Objetivo de duración</h3>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs" style={{ color: 'var(--color-text-2)' }}>
              Mostrar progreso del workout vs. duración objetivo
            </p>
            <div className="flex gap-1">
              {[0, 30, 45, 60, 75, 90].map(n => (
                <button
                  key={n}
                  onClick={() => setTargetDurationMinutes(n)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium"
                  style={{
                    backgroundColor: targetDurationMinutes === n ? 'var(--color-primary)' : 'var(--color-surface-2)',
                    color: targetDurationMinutes === n ? '#000' : 'var(--color-text-2)',
                  }}
                >
                  {n === 0 ? 'Off' : `${n}m`}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs mt-1.5" style={{ color: 'var(--color-text-2)' }}>
            Durante el workout activo se muestra un anillo de progreso en la cabecera.
          </p>
        </div>

        {/* Reminder notifications */}
        <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Bell size={16} className="text-[var(--color-primary)]" />
            <h3 className="text-sm font-semibold">Recordatorio de entrenamiento</h3>
            {/* F244 — Permission status badge */}
            {notifPermission === 'granted' && (
              <span className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
                <BellRing size={10} /> Permitidas
              </span>
            )}
            {notifPermission === 'denied' && (
              <span className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
                <BellOff size={10} /> Bloqueadas
              </span>
            )}
            {notifPermission === 'default' && (
              <span className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
                <BellMinus size={10} /> Pendiente
              </span>
            )}
            {notifPermission === 'unsupported' && (
              <span className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ backgroundColor: 'rgba(107,114,128,0.15)', color: '#6b7280' }}>
                <BellOff size={10} /> No disponible
              </span>
            )}
          </div>

          {/* F244 — Request permission button (only when needed) */}
          {notifPermission === 'default' && (
            <button
              onClick={handleRequestPermission}
              className="w-full mb-3 py-2 rounded-lg text-xs font-semibold text-center"
              style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}
            >
              Solicitar permiso de notificaciones
            </button>
          )}

          {/* F244 — Denied state help message */}
          {notifPermission === 'denied' && (
            <div className="mb-3 p-2 rounded-lg flex items-start gap-2" style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" style={{ color: '#ef4444' }} />
              <p className="text-[11px]" style={{ color: 'var(--color-text-2)' }}>
                Notificaciones bloqueadas. Habilítalas en la configuración de tu navegador para recibir recordatorios.
              </p>
            </div>
          )}

          <div className="mb-3">
            <Toggle
              value={reminderEnabled}
              onChange={handleSetReminderEnabled}
              description="Recibir un recordatorio para entrenar"
            />
          </div>

          {reminderEnabled && (
            <div className="space-y-3">
              {/* Time picker */}
              <div className="flex items-center gap-2">
                <label htmlFor="reminder-time" className="text-xs" style={{ color: 'var(--color-text-2)' }}>Hora:</label>
                <input
                  id="reminder-time"
                  type="time"
                  value={reminderTime}
                  onChange={e => setReminderTime(e.target.value)}
                  className="px-2 py-1 rounded-lg text-sm"
                  style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                />
              </div>

              {/* Day selector */}
              <div className="flex items-center gap-1 flex-wrap" role="group" aria-label="Días de recordatorio">
                {dayLabels.map((label, idx) => (
                  <button
                    key={idx}
                    onClick={() => toggleDay(idx)}
                    className="w-9 h-9 rounded-lg text-xs font-medium transition-colors"
                    aria-pressed={reminderDays.includes(idx)}
                    style={{
                      backgroundColor: reminderDays.includes(idx) ? 'var(--color-primary)' : 'var(--color-surface-2)',
                      color: reminderDays.includes(idx) ? '#000' : 'var(--color-text-2)',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {reminderDays.length === 0 && (
                <p className="text-xs" style={{ color: '#f59e0b' }}>Selecciona al menos un día</p>
              )}
            </div>
          )}
        </div>

        {/* Default sets */}
        <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Repeat size={16} className="text-[var(--color-primary)]" />
            <h3 className="text-sm font-semibold">Series por defecto</h3>
          </div>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5, 6].map(n => (
              <button
                key={n}
                onClick={() => setDefaultSets(n)}
                className="flex-1 py-2 rounded-lg text-sm font-medium"
                style={{
                  backgroundColor: defaultSets === n ? 'var(--color-primary)' : 'var(--color-surface-2)',
                  color: defaultSets === n ? '#000' : 'var(--color-text-2)',
                }}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Default reps */}
        <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Repeat size={16} className="text-[var(--color-primary)]" />
            <h3 className="text-sm font-semibold">Reps por defecto</h3>
          </div>
          <div className="flex gap-2 flex-wrap">
            {[5, 6, 8, 10, 12, 15, 20].map(n => (
              <button
                key={n}
                onClick={() => setDefaultReps(n)}
                className="px-3 py-2 rounded-lg text-sm"
                style={{
                  backgroundColor: defaultReps === n ? 'var(--color-primary)' : 'var(--color-surface-2)',
                  color: defaultReps === n ? '#000' : 'var(--color-text-2)',
                }}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* About */}
        <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Info size={16} className="text-[var(--color-primary)]" />
            <h3 className="text-sm font-semibold">Acerca de</h3>
          </div>
          <div className="space-y-1 text-xs" style={{ color: 'var(--color-text-2)' }}>
            <p><strong style={{ color: 'var(--color-text)' }}>HEVY Clone</strong> — Tu tracker de workouts</p>
            <p>100% local — Sin cloud, sin cuenta, sin límites.</p>
            <p>Datos guardados solo en tu dispositivo.</p>
          </div>
        </div>

        {/* Export / Import */}
        <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Download size={16} className="text-[var(--color-primary)]" />
            <h3 className="text-sm font-semibold">Exportar / Importar</h3>
          </div>
          <p className="text-xs mb-3" style={{ color: 'var(--color-text-2)' }}>
            Descarga tus workouts, rutinas y ejercicios como archivo JSON. Puedes importarlo más tarde para restaurar tus datos.
          </p>

          {/* Export */}
          <button
            onClick={handleExport}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold mb-2"
            style={{ backgroundColor: 'var(--color-primary)', color: '#000' }}
          >
            <Download size={14} /> Exportar a JSON
          </button>

          {/* Import */}
          <label
            htmlFor="import-file"
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium text-center cursor-pointer"
            style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
          >
            <Upload size={14} /> Importar desde JSON
            <input
              id="import-file"
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImport}
            />
          </label>

          {/* Warning */}
          <div className="flex items-start gap-2 mt-3 p-2 rounded-lg" style={{ backgroundColor: 'rgba(245,158,11,0.1)' }}>
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" style={{ color: '#f59e0b' }} />
            <p className="text-xs" style={{ color: 'var(--color-text-2)' }}>
              Importar replace todos los datos actuales. Haz export antes de importar.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
