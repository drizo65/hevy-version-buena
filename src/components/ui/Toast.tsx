import React, { useEffect } from 'react';
import { Check, AlertTriangle, Info, X, Award } from 'lucide-react';
import { type ToastMessage } from './toastStore';

const ICONS: Record<ToastMessage['type'], React.ReactNode> = {
  success: <Check size={16} />,
  error: <AlertTriangle size={16} />,
  info: <Info size={16} />,
  warning: <AlertTriangle size={16} />,
  pr: <Award size={16} />,
};

const COLORS: Record<ToastMessage['type'], { bg: string; border: string; icon: string; title: string; body: string }> = {
  success: { bg: 'var(--color-surface)', border: '#10b981', icon: '#10b981', title: 'var(--color-text)', body: 'var(--color-text-2)' },
  error: { bg: 'var(--color-surface)', border: '#ef4444', icon: '#ef4444', title: '#ef4444', body: 'var(--color-text-2)' },
  info: { bg: 'var(--color-surface)', border: 'var(--color-primary)', icon: 'var(--color-primary)', title: 'var(--color-text)', body: 'var(--color-text-2)' },
  warning: { bg: 'var(--color-surface)', border: '#f59e0b', icon: '#f59e0b', title: '#f59e0b', body: 'var(--color-text-2)' },
  pr: { bg: 'var(--color-primary)', border: 'transparent', icon: '#000', title: '#000', body: '#000' },
};

function ToastItem({ toast, onDismiss }: { toast: ToastMessage; onDismiss: (id: string) => void }) {
  const colors = COLORS[toast.type];

  useEffect(() => {
    if (toast.type === 'pr') return; // PR toast stays until dismissed
    const timer = setTimeout(() => onDismiss(toast.id), toast.duration ?? 3000);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  return (
    <div
      className="flex items-start gap-3 p-3 rounded-xl shadow-lg cursor-pointer"
      style={{
        backgroundColor: colors.bg,
        border: `1px solid ${colors.border}`,
        color: colors.icon,
      }}
      onClick={() => onDismiss(toast.id)}
    >
      <span className="flex-shrink-0 mt-0.5" style={{ color: colors.icon }}>
        {ICONS[toast.type]}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold mb-0.5" style={{ color: colors.title }}>{toast.title}</p>
        {toast.body && (
          <p className="text-xs font-medium" style={{ color: colors.body }}>{toast.body}</p>
        )}
      </div>
      <button onClick={() => onDismiss(toast.id)} className="p-0.5 flex-shrink-0" style={{ color: colors.body }}>
        <X size={14} />
      </button>
    </div>
  );
}

export default function Toast({ toasts, onDismiss }: { toasts: ToastMessage[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-4 left-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none"
      role="region"
      aria-label="Notificaciones"
      aria-live="polite"
    >
      {toasts.map(toast => (
        <div key={toast.id} className="pointer-events-auto max-w-md mx-auto w-full">
          <ToastItem toast={toast} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  );
}
