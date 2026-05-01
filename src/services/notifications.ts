// Browser Notification API service for workout reminders (F11)

import { useSettingsStore } from '../store/settingsStore';

// Request notification permission from the browser
export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

// Check if current day matches selected reminder days
function isReminderDay(days: number[]): boolean {
  const today = new Date().getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  return days.includes(today);
}

// Parse time string "HH:MM" into total minutes from midnight
function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

// Check if current time is within N minutes of the reminder time
function isWithinReminderWindow(reminderTime: string, windowMinutes = 2): boolean {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const targetMinutes = parseTimeToMinutes(reminderTime);
  const diff = Math.abs(nowMinutes - targetMinutes);
  // Handle midnight wrap-around
  const minDiff = Math.min(diff, 24 * 60 - diff);
  return minDiff <= windowMinutes;
}

// Fire a workout reminder notification
function fireReminderNotification() {
  if (Notification.permission !== 'granted') return;
  const notification = new Notification('¡Hora de entrenar! 💪', {
    body: 'Tienes un recordatorio de entrenamiento programado.',
    icon: undefined,
    badge: undefined,
    tag: 'hevy-reminder',
    requireInteraction: true,
  });
  notification.onclick = () => {
    window.focus();
    notification.close();
  };
}

// Schedule the next reminder check
let _scheduledTimeout: ReturnType<typeof setTimeout> | null = null;

// F11 — Exported so SettingsPage can reschedule when user changes reminder settings
export function scheduleNextReminder() {
  if (_scheduledTimeout) {
    clearTimeout(_scheduledTimeout);
    _scheduledTimeout = null;
  }

  const { reminderEnabled, reminderTime, reminderDays } = useSettingsStore.getState();
  if (!reminderEnabled) return;
  if (!isReminderDay(reminderDays)) return;
  // F11 — Double-check permission before scheduling (may have been revoked)
  if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') return;

  const now = new Date();
  const [h, m] = reminderTime.split(':').map(Number);
  const target = new Date(now);
  target.setHours(h, m, 0, 0);

  // If target time has already passed today, schedule for tomorrow
  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }

  // Find next valid day if today isn't a reminder day
  if (!isReminderDay(reminderDays)) {
    // Find next reminder day
    for (let i = 1; i <= 7; i++) {
      const check = new Date(now);
      check.setDate(check.getDate() + i);
      const checkDay = check.getDay();
      if (reminderDays.includes(checkDay)) {
        target.setTime(check.getTime());
        target.setHours(h, m, 0, 0);
        break;
      }
    }
  }

  const delayMs = target.getTime() - now.getTime();
  _scheduledTimeout = setTimeout(() => {
    const { reminderEnabled: enabled, reminderTime: time, reminderDays: days } = useSettingsStore.getState();
    if (enabled && isReminderDay(days) && isWithinReminderWindow(time)) {
      fireReminderNotification();
    }
    scheduleNextReminder(); // Schedule the next day's reminder
  }, delayMs);
}

// Initialize the notification service — call once on app load
export async function initNotificationService(): Promise<void> {
  const granted = await requestNotificationPermission();
  if (granted) {
    // Check immediately if we should fire now (in case app was opened at exactly the reminder time)
    const { reminderEnabled, reminderTime, reminderDays } = useSettingsStore.getState();
    if (reminderEnabled && isReminderDay(reminderDays) && isWithinReminderWindow(reminderTime)) {
      fireReminderNotification();
    }
    // Schedule next check
    scheduleNextReminder();
  }
}
