import type { ReactNode } from 'react';

type CardVariant = 'default' | 'elevated' | 'bordered' | 'highlight';

interface CardProps {
  children: ReactNode;
  className?: string;
  variant?: CardVariant;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  onClick?: () => void;
}

const paddingMap: Record<'none' | 'sm' | 'md' | 'lg', string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-5',
};

const variantStyles: Record<CardVariant, string> = {
  default: 'bg-[var(--color-surface)] border border-[var(--color-border)]',
  elevated: 'bg-[var(--color-surface)] border border-[var(--color-border)]',
  bordered: 'bg-[var(--color-surface)] border border-[var(--color-border-light)]',
  highlight: 'bg-[var(--color-surface)] border border-[var(--color-primary)]',
};

export default function Card({
  children,
  className = '',
  variant = 'default',
  padding = 'md',
  onClick,
}: CardProps) {
  const paddingClass = paddingMap[padding];

  if (onClick) {
    return (
      <div
        onClick={onClick}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
        className={`rounded-2xl ${paddingClass} ${variantStyles[variant]} transition-all duration-200 cursor-pointer ${className}`}
        onMouseEnter={e => {
          if (variant === 'default') {
            e.currentTarget.style.borderColor = 'var(--color-border-light)';
          }
          e.currentTarget.style.transform = 'translateY(-1px)';
        }}
        onMouseLeave={e => {
          if (variant === 'default') {
            e.currentTarget.style.borderColor = 'var(--color-border)';
          }
          e.currentTarget.style.transform = 'translateY(0)';
        }}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl ${paddingClass} ${variantStyles[variant]} ${className}`}
    >
      {children}
    </div>
  );
}
