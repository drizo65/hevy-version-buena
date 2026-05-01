// Toast store for global toast management
// Separated from Toast.tsx to avoid React Fast Refresh issues when
// exporting both a component and non-component values from the same file

export type ToastType = 'success' | 'error' | 'info' | 'warning' | 'pr';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  body?: string;
  duration?: number; // ms, default 3000
}

type ToastListener = (toasts: ToastMessage[]) => void;
const listeners = new Set<ToastListener>();
let currentToasts: ToastMessage[] = [];
let counter = 0;

function notify() {
  listeners.forEach(l => l([...currentToasts]));
}

export const toastStore = {
  add(t: Omit<ToastMessage, 'id'>): string {
    const id = `toast-${++counter}`;
    currentToasts = [...currentToasts, { ...t, id }];
    notify();
    return id;
  },
  dismiss(id: string) {
    currentToasts = currentToasts.filter(t => t.id !== id);
    notify();
  },
  clear() {
    currentToasts = [];
    notify();
  },
  subscribe(listener: ToastListener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getAll(): ToastMessage[] {
    return [...currentToasts];
  },
  // Convenience helpers
  success(title: string, body?: string) { return this.add({ type: 'success', title, body }); },
  error(title: string, body?: string) { return this.add({ type: 'error', title, body }); },
  info(title: string, body?: string) { return this.add({ type: 'info', title, body }); },
  warning(title: string, body?: string) { return this.add({ type: 'warning', title, body }); },
  pr(title: string, body?: string) { return this.add({ type: 'pr', title, body, duration: 0 }); },
};
