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


// =============================================================================
// Shared weight utility — F343
// =============================================================================

/**
 * Format a weight number with its unit (kg/lb), consistent with formatWeight
 * used across all pages. F339 eliminated inline weight+unit strings.
 * kg: 1 decimal place (e.g. "50.0 kg"), lb: integer (e.g. "110 lb")
 */
export function formatWeight(w: number, unit: string): string {
  if (unit === 'lb') return `${Math.round(w)} lb`;
  return `${w.toFixed(1)} kg`;
}

// =============================================================================
// Workout quality score — F342
// RPE consistency (0-50) + volume efficiency (0-50)
// Extracted from WorkoutsPage.tsx (F98) and WorkoutDetailPage.tsx (F294).
// Both implementations were identical; this is the single shared source.
// =============================================================================

export function computeQualityScore(
  sets: { rpe: number | null; set_type: string; weight: number; reps: number }[],
  volume: number,
  durationSec: number,
  avgVolume: number,
  sortedHistory: { duration_seconds: number | null }[]
): number {
  if (sets.length === 0) return 0;
  // Filter working sets (exclude warmup and drop sets) — same logic in both pages
  const workingSets = sets.filter((s) => s.set_type !== 'warmup' && s.set_type !== 'drop');
  // RPE consistency score (0-50 points): lower variance = higher score
  const rpeSets = workingSets.filter((s: { rpe: number | null }) => s.rpe != null && s.rpe > 0);
  let rpeScore = 25; // neutral baseline if no RPE data
  if (rpeSets.length >= 3) {
    const rpes = rpeSets.map((s) => s.rpe as number);
    const mean = rpes.reduce((a: number, b: number) => a + b, 0) / rpes.length;
    const variance = rpes.reduce((a: number, r: number) => a + (r - mean) ** 2, 0) / rpes.length;
    // variance of 0 = perfect consistency = 50pts; variance of 4 (max) = 0pts
    rpeScore = Math.max(0, 50 - (variance * 12.5));
  } else if (rpeSets.length > 0) {
    rpeScore = 30; // partial credit for having some RPE data
  }
  // Volume efficiency score (0-50 points): kg per minute vs user average
  const volPerMin = durationSec > 0 ? (volume / durationSec) * 60 : 0;
  // Compare to overall avgVolume / avgDuration
  const avgDur = sortedHistory.reduce((sum: number, h: { duration_seconds: number | null }) => sum + (h.duration_seconds || 0), 0) / Math.max(sortedHistory.length, 1);
  const avgVolPerMin = avgDur > 0 ? (avgVolume / avgDur) * 60 : 0;
  let effScore = 25; // neutral
  if (avgVolPerMin > 0 && volPerMin > 0) {
    const effRatio = volPerMin / avgVolPerMin;
    // ratio of 1.0 = 50pts, ratio of 0.5 or 2.0 = ~25pts, extreme = lower
    effScore = Math.min(50, Math.round(50 * Math.min(effRatio, 2 / effRatio)));
  }
  return Math.round(rpeScore + effScore);
}
