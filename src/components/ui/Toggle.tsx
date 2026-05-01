import { ToggleRight, ToggleLeft } from 'lucide-react';

interface ToggleProps {
  value: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  description?: string;
  icon?: React.ReactNode;
}

export default function Toggle({ value, onChange, label, description, icon }: ToggleProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {icon && <span className="flex-shrink-0 text-[var(--color-primary)]">{icon}</span>}
        {label && <span className="text-sm font-semibold">{label}</span>}
        {description && (
          <p className="text-xs w-full" style={{ color: 'var(--color-text-2)' }}>{description}</p>
        )}
      </div>
      <button
        onClick={() => onChange(!value)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex-shrink-0"
        aria-pressed={value}
        style={{
          backgroundColor: value ? 'var(--color-primary)' : 'var(--color-surface-2)',
          color: value ? '#000' : 'var(--color-text-2)',
        }}
      >
        {value ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
        {value ? 'On' : 'Off'}
      </button>
    </div>
  );
}
