import { differenceInDays, differenceInHours } from 'date-fns';

/**
 * Format a date string as a relative label (e.g. "hoy", "ayer", "3d", "2sem", "1mes").
 * Used across ExerciseDetailPage, ExerciseProgressPage, and ExercisesPage.
 */
export function formatLastPerformed(lastDate: string | null | undefined): string {
  if (!lastDate) return '—';
  const days = Math.abs(differenceInDays(new Date(), new Date(lastDate)));
  if (days === 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}sem`;
  return `${Math.floor(days / 30)}mes`;
}

/**
 * Return the CSS color for the last performed label.
 * Blue ≤3d, green ≤7d, amber ≤14d, gray older.
 */
export function getLastPerformedColor(lastDate: string | null | undefined): string {
  if (!lastDate) return 'var(--color-text-2)';
  const days = Math.abs(differenceInDays(new Date(), new Date(lastDate)));
  if (days <= 3) return 'var(--color-primary)';
  if (days <= 7) return '#10b981';
  if (days <= 14) return '#f59e0b';
  return 'var(--color-text-2)';
}

/**
 * F234 — Format a date string as "Hace Nh" (hours) or "Hace Nd" (days).
 * More granular than formatLastPerformed for recent timeframes.
 * Shows "Hace 2h" if < 24h, "Hace 3d" if ≥ 24h.
 */
export function formatTimeSince(lastDate: string | null | undefined): string {
  if (!lastDate) return '—';
  const hours = Math.abs(differenceInHours(new Date(), new Date(lastDate)));
  if (hours < 1) return 'Hace <1h';
  if (hours < 24) return `Hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Ayer';
  if (days < 30) return `Hace ${days}d`;
  if (days < 60) return 'Hace 1mes';
  return `Hace ${Math.floor(days / 30)}mes`;
}

/**
/** F234 — Return the CSS color for the "time since" chip.
 * Primary (yellow/gold) if ≤24h, green if ≤3d, amber if ≤7d, gray older.
 */
export function getTimeSinceColor(lastDate: string | null | undefined): string {
  if (!lastDate) return 'var(--color-text-2)';
  const hours = Math.abs(differenceInHours(new Date(), new Date(lastDate)));
  if (hours <= 24) return 'var(--color-primary)'; // yellow/gold — very recent
  const days = Math.floor(hours / 24);
  if (days <= 3) return '#10b981'; // green
  if (days <= 7) return '#f59e0b'; // amber
  return 'var(--color-text-2)'; // gray — stale
}

/** F243 — Classify a workout's time-of-day based on its start time.
 * Mañana: 5:00-11:59, Tarde: 12:00-17:59, Noche: 18:00-4:59
 */
export type TimeOfDay = 'morning' | 'afternoon' | 'evening';

export function getTimeOfDay(startedAt: string | null | undefined): TimeOfDay | null {
  if (!startedAt) return null;
  const h = new Date(startedAt).getHours();
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 18) return 'afternoon';
  return 'evening';
}

export const TIME_OF_DAY_LABELS: Record<TimeOfDay, string> = {
  morning: 'Mañana',
  afternoon: 'Tarde',
  evening: 'Noche',
};

export const TIME_OF_DAY_COLORS: Record<TimeOfDay, string> = {
  morning: '#f59e0b',    // amber
  afternoon: '#3b82f6', // blue
  evening: '#8b5cf6',   // purple
};
