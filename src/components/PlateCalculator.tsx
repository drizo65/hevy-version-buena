// PlateCalculator — Calculadora de peso en barra
// Muestra cuántas placas necesitas poner en cada lado de la barra
import { useState } from 'react';
import { X } from 'lucide-react';

interface PlateConfig {
  label: string;
  color: string;
  bg: string;
}

const METRIC_PLATES: PlateConfig[] = [
  { label: '25', color: '#ef4444', bg: '#fef2f2' },
  { label: '20', color: '#3b82f6', bg: '#eff6ff' },
  { label: '15', color: '#eab308', bg: '#fefce8' },
  { label: '10', color: '#22c55e', bg: '#f0fdf4' },
  { label: '5', color: '#a855f7', bg: '#faf5ff' },
  { label: '2.5', color: '#f97316', bg: '#fff7ed' },
  { label: '1.25', color: '#6b7280', bg: '#f9fafb' },
];

const IMPERIAL_PLATES: PlateConfig[] = [
  { label: '45', color: '#ef4444', bg: '#fef2f2' },
  { label: '35', color: '#3b82f6', bg: '#eff6ff' },
  { label: '25', color: '#eab308', bg: '#fefce8' },
  { label: '10', color: '#22c55e', bg: '#f0fdf4' },
  { label: '5', color: '#a855f7', bg: '#faf5ff' },
  { label: '2.5', color: '#f97316', bg: '#fff7ed' },
];

const BARWEIGHT: Record<'kg' | 'lbs', number> = { kg: 20, lbs: 45 };

interface Props {
  unit: 'kg' | 'lbs';
  initialWeight?: number;
  onClose: () => void;
  /** Called when user taps a plate — fills the weight input */
  onFill?: (weight: number) => void;
}

function calculatePlates(targetWeight: number, unit: 'kg' | 'lbs'): { perSide: { label: string; color: string; bg: string; count: number }[]; barWeight: number; achievedWeight: number } {
  const plates = unit === 'kg' ? METRIC_PLATES : IMPERIAL_PLATES;
  const barWeight = BARWEIGHT[unit];
  const perSide = (targetWeight - barWeight) / 2;
  if (perSide <= 0) return { perSide: [], barWeight, achievedWeight: barWeight };

  const result: { label: string; color: string; bg: string; count: number }[] = [];
  let remaining = perSide;

  for (const plate of plates) {
    const plateWeight = parseFloat(plate.label);
    if (plateWeight <= remaining) {
      const count = Math.floor(remaining / plateWeight);
      if (count > 0) {
        result.push({ label: plate.label, color: plate.color, bg: plate.bg, count });
        remaining -= count * plateWeight;
      }
    }
  }

  const achievedPerSide = result.reduce((sum, p) => sum + parseFloat(p.label) * p.count, 0);
  const achievedWeight = barWeight + achievedPerSide * 2;

  return { perSide: result, barWeight, achievedWeight };
}

export default function PlateCalculator({ unit, initialWeight, onClose, onFill }: Props) {
  const [weight, setWeight] = useState(initialWeight ? String(initialWeight) : '');

  const targetWeight = parseFloat(weight) || 0;
  const { perSide, barWeight, achievedWeight } = calculatePlates(targetWeight, unit);
  const plates = unit === 'kg' ? METRIC_PLATES : IMPERIAL_PLATES;
  const unitLabel = unit.toUpperCase();

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
      <div
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl overflow-hidden"
        style={{ backgroundColor: 'var(--color-surface)', maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <h2 className="text-lg font-bold">Calculadora de peso</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg" style={{ backgroundColor: 'var(--color-surface-2)' }}>
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 140px)' }}>
          {/* Weight input */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--color-text-2)' }}>
                Peso total deseado ({unitLabel})
              </label>
              <input
                type="number"
                value={weight}
                onChange={e => setWeight(e.target.value)}
                placeholder={`Ej: ${unit === 'kg' ? '60' : '135'} ${unitLabel}`}
                className="w-full px-3 py-2 rounded-lg text-lg font-bold text-center"
                style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                autoFocus
              />
            </div>
          </div>

          {/* Resultado */}
          {weight && (
            <div className="space-y-3">
              {/* Barra + placas visual */}
              <div className="flex items-center justify-center gap-0.5 py-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface-2)' }}>
                {/* Placas izquierda */}
                <div className="flex items-center gap-0.5">
                  {perSide.length === 0 ? (
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ backgroundColor: '#6b7280', color: '#fff' }}>B</div>
                  ) : (
                    perSide.slice().reverse().map((plate, i) =>
                      Array.from({ length: plate.count }).map((_, j) => (
                        <div
                          key={`L-${i}-${j}`}
                          className="w-3 rounded-sm flex items-center justify-center text-[8px] font-bold"
                          style={{ height: `${28 + plate.count * 4}px`, backgroundColor: plate.bg, color: plate.color, border: `1px solid ${plate.color}40` }}
                        >
                          {plate.label}
                        </div>
                      ))
                    ).flat()
                  )}
                </div>

                {/* Barra */}
                <div className="h-4 rounded-full flex items-center justify-center" style={{ backgroundColor: '#6b7280', minWidth: '80px', border: '2px solid #4b5563' }}>
                  <span className="text-[9px] font-bold text-white/70">BAR</span>
                </div>

                {/* Placas derecha (mirrored) */}
                <div className="flex items-center gap-0.5">
                  {perSide.length === 0 ? null : (
                    perSide.map((plate, i) =>
                      Array.from({ length: plate.count }).map((_, j) => (
                        <div
                          key={`R-${i}-${j}`}
                          className="w-3 rounded-sm flex items-center justify-center text-[8px] font-bold"
                          style={{ height: `${28 + plate.count * 4}px`, backgroundColor: plate.bg, color: plate.color, border: `1px solid ${plate.color}40` }}
                        >
                          {plate.label}
                        </div>
                      ))
                    ).flat()
                  )}
                </div>
              </div>

              {/* Breakdown */}
              <div className="text-center space-y-1.5">
                <p className="text-sm" style={{ color: 'var(--color-text-2)' }}>
                  {unit === 'kg' ? 'Barra' : 'Barra'} {barWeight}{unitLabel} +{' '}
                  {perSide.length === 0
                    ? <span className="text-xs">sin placas</span>
                    : perSide.map(p => `${p.count}×${p.label}`).join(' + ')
                  }
                </p>
                <p className="text-xs" style={{ color: 'var(--color-text-2)' }}>
                  Conseguido: <span className="font-bold" style={{ color: 'var(--color-text)' }}>{achievedWeight}</span> {unitLabel}
                  {Math.abs(achievedWeight - targetWeight) > 0.01 && (
                    <span className="ml-1 text-[var(--color-danger)]">
                      (diff: {(targetWeight - achievedWeight).toFixed(2)} {unitLabel})
                    </span>
                  )}
                </p>
              </div>

              {/* Detalle por lado */}
              {perSide.length > 0 && (
                <div className="rounded-xl p-3 space-y-2" style={{ backgroundColor: 'var(--color-surface-2)' }}>
                  <p className="text-xs font-semibold" style={{ color: 'var(--color-text-2)' }}>Por lado:</p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {perSide.map((plate, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold"
                        style={{ backgroundColor: plate.bg, color: plate.color }}
                      >
                        <span className="font-bold">{plate.count}×</span>
                        <span>{plate.label}{unitLabel}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-center" style={{ color: 'var(--color-text-2)' }}>
                    Total por lado: <span className="font-bold">{perSide.reduce((s, p) => s + parseFloat(p.label) * p.count, 0)}</span>{unitLabel}
                  </p>
                </div>
              )}

              {/* Quick select plates */}
              <div className="space-y-2">
                <p className="text-xs font-medium" style={{ color: 'var(--color-text-2)' }}>Placas disponibles ({unitLabel}):</p>
                <div className="flex flex-wrap gap-1.5">
                  {plates.map(plate => (
                    <button
                      key={plate.label}
                      onClick={() => {
                        const current = parseFloat(weight) || barWeight;
                        const newWeight = current + parseFloat(plate.label) * 2;
                        setWeight(String(newWeight));
                      }}
                      className="px-2 py-1 rounded-lg text-xs font-semibold transition-all hover:scale-105"
                      style={{ backgroundColor: plate.bg, color: plate.color, border: `1px solid ${plate.color}40` }}
                    >
                      +{plate.label}
                    </button>
                  ))}
                  <button
                    onClick={() => setWeight(String(barWeight))}
                    className="px-2 py-1 rounded-lg text-xs font-semibold"
                    style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text-2)', border: '1px solid var(--color-border)' }}
                  >
                    Solo barra
                  </button>
                </div>
              </div>

              {/* Fill button */}
              {onFill && achievedWeight > 0 && (
                <button
                  onClick={() => { onFill(achievedWeight); onClose(); }}
                  className="w-full py-2.5 rounded-lg text-sm font-bold"
                  style={{ backgroundColor: 'var(--color-primary)', color: '#000' }}
                >
                  Usar {achievedWeight}{unitLabel}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
