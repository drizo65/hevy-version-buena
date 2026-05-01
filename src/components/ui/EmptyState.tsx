import type { ReactNode } from 'react';

type EmptyStateVariant = 'workout' | 'exercise' | 'routine' | 'progress' | 'measurement' | 'general';

interface EmptyStateProps {
  variant?: EmptyStateVariant;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  icon?: ReactNode;
  className?: string;
}

const illustrations: Record<EmptyStateVariant, { path: string; color: string }> = {
  workout: {
    path: 'M6.5 6.5 18 18M21 21l-1-1M3 3l1 1M18 22l4-4M2 6l4-4M3 10l7-7M14 21l7-7',
    color: 'var(--color-primary)',
  },
  exercise: {
    path: 'M6.5 6.5 18 18M3 3l1 1M18 22l4-4M2 6l4-4',
    color: 'var(--color-info)',
  },
  routine: {
    path: 'M9 12H3M21 12h-6M16 7l-4 5-4-5M10 17v4M14 17v4',
    color: 'var(--color-success)',
  },
  progress: {
    path: 'M3 3v18h18M7 14l4-4 4 4 5-5',
    color: 'var(--color-warning)',
  },
  measurement: {
    path: 'M12 20v-6M6 20v-4M18 20v-8M3 20h18',
    color: 'var(--color-text-2)',
  },
  general: {
    path: 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 6v4m0 4h.01',
    color: 'var(--color-text-3)',
  },
};

export default function EmptyState({ variant = 'general', title, description, action, icon, className = '' }: EmptyStateProps) {
  const illustration = illustrations[variant];

  return (
    <div className={`flex flex-col items-center justify-center py-12 px-6 text-center ${className}`}>
      {/* Decorative circle background */}
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center mb-5"
        style={{
          background: `radial-gradient(circle, ${illustration.color}18 0%, transparent 70%)`,
          boxShadow: `0 0 30px ${illustration.color}20`,
        }}
      >
        {icon ? (
          <div style={{ color: illustration.color }}>{icon}</div>
        ) : (
          <svg
            width="36"
            height="36"
            viewBox="0 0 24 24"
            fill="none"
            stroke={illustration.color}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {illustration.path.split('M').filter(Boolean).map((segment, i) => (
              <path key={i} d={'M' + segment} />
            ))}
          </svg>
        )}
      </div>

      <h3 className="text-base font-bold mb-1.5" style={{ color: 'var(--color-text)' }}>
        {title}
      </h3>

      {description && (
        <p className="text-sm max-w-xs leading-relaxed mb-5" style={{ color: 'var(--color-text-2)' }}>
          {description}
        </p>
      )}

      {action && (
        <button
          onClick={action.onClick}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200"
          style={{
            backgroundColor: 'var(--color-primary)',
            color: '#000',
            boxShadow: 'var(--shadow-glow)',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.backgroundColor = 'var(--color-primary-hover)';
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = '0 0 28px rgba(255,179,0,0.3)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.backgroundColor = 'var(--color-primary)';
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'var(--shadow-glow)';
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
