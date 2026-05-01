import { NavLink } from 'react-router-dom';
import { Dumbbell, ListChecks, BarChart3, User, ListTodo } from 'lucide-react';

const tabs = [
  { to: '/', label: 'Ejercicios', icon: Dumbbell },
  { to: '/workouts', label: 'Workouts', icon: ListChecks },
  { to: '/routines', label: 'Rutinas', icon: ListTodo },
  { to: '/progress', label: 'Progreso', icon: BarChart3 },
  { to: '/settings', label: 'Ajustes', icon: User },
];

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
      {tabs.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-1 py-3 text-xs transition-colors ${
              isActive ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-2)]'
            }`
          }
        >
          <Icon size={20} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
