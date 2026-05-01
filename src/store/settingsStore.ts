// Store de Zustand — settings del usuario

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  unit: 'kg' | 'lbs';
  measurementUnit: 'cm' | 'in'; // F115 — body measurement unit
  defaultRestSeconds: number;
  defaultSets: number;
  defaultReps: number;
  reminderEnabled: boolean;
  reminderTime: string; // HH:MM format
  reminderDays: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
  autoStartRest: boolean; // auto-start rest timer after completing a set
  vibrationEnabled: boolean; // vibrate when rest timer ends
  soundEnabled: boolean; // play sound when rest timer ends
  muscleAlertDays: number; // days threshold for muscle group frequency alert (default 7)
  targetDurationMinutes: number; // workout duration goal in minutes (0 = off)
  setUnit: (unit: 'kg' | 'lbs') => void;
  setMeasurementUnit: (unit: 'cm' | 'in') => void;
  setDefaultRest: (seconds: number) => void;
  setDefaultSets: (sets: number) => void;
  setDefaultReps: (reps: number) => void;
  setReminderEnabled: (enabled: boolean) => void;
  setReminderTime: (time: string) => void;
  setReminderDays: (days: number[]) => void;
  setAutoStartRest: (enabled: boolean) => void;
  setVibrationEnabled: (enabled: boolean) => void;
  setSoundEnabled: (soundEnabled: boolean) => void;
  setMuscleAlertDays: (days: number) => void;
  setTargetDurationMinutes: (minutes: number) => void;
}
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      unit: 'kg',
      measurementUnit: 'cm', // F115 — default to cm
      defaultRestSeconds: 90,
      defaultSets: 3,
      defaultReps: 10,
      reminderEnabled: false,
      reminderTime: '09:00',
      reminderDays: [1, 3, 5], // Mon, Wed, Fri
      autoStartRest: true,
      vibrationEnabled: true,
      soundEnabled: true,
      muscleAlertDays: 7,
      targetDurationMinutes: 0,

      setUnit: (unit) => set({ unit }),
      setMeasurementUnit: (measurementUnit) => set({ measurementUnit }),
      setDefaultRest: (defaultRestSeconds) => set({ defaultRestSeconds }),
      setDefaultSets: (defaultSets) => set({ defaultSets }),
      setDefaultReps: (defaultReps) => set({ defaultReps }),
      setReminderEnabled: (reminderEnabled) => set({ reminderEnabled }),
      setReminderTime: (reminderTime) => set({ reminderTime }),
      setReminderDays: (reminderDays) => set({ reminderDays }),
      setAutoStartRest: (autoStartRest) => set({ autoStartRest }),
      setVibrationEnabled: (vibrationEnabled) => set({ vibrationEnabled }),
      setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
      setMuscleAlertDays: (muscleAlertDays) => set({ muscleAlertDays }),
      setTargetDurationMinutes: (targetDurationMinutes) => set({ targetDurationMinutes }),
    }),
    { name: 'hevy-settings' }
  )
);
