/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect } from 'react';
import { Plus, Trash2, Ruler, TrendingUp } from 'lucide-react';
import { getDb, generateId } from '../database/init';
import { getMeasurementHistory, getLatestMeasurement, getPreviousMeasurement, getMeasurementTrendBatch, type BodyPart } from '../database/queries';
import { saveBodyMeasurement, deleteBodyMeasurement } from '../database/mutations';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts';
import { useSettingsStore } from '../store/settingsStore';

const BODY_PARTS: { key: BodyPart; label: string }[] = [
  { key: 'waist', label: 'Cintura' },
  { key: 'chest', label: 'Pecho' },
  { key: 'biceps', label: 'Bíceps' },
  { key: 'thigh', label: 'Muslo' },
  { key: 'calf', label: 'Pantorrilla' },
  { key: 'hips', label: 'Caderas' },
  { key: 'shoulders', label: 'Hombros' },
  { key: 'neck', label: 'Cuello' },
];

// F115 — Measurement unit conversion helpers
const CM_TO_IN = 0.393701;
const IN_TO_CM = 2.54;

function toDisplayUnit(value: number, unit: 'cm' | 'in'): string {
  if (unit === 'in') return `${(value * CM_TO_IN).toFixed(1)}`;
  return `${value}`;
}

function getUnitLabel(unit: 'cm' | 'in'): string {
  return unit === 'in' ? 'in' : 'cm';
}

// Convert input value to cm for storage
function toCm(value: number, unit: 'cm' | 'in'): number {
  if (unit === 'in') return value * IN_TO_CM;
  return value;
}

export default function MeasurementsPage() {
  const { measurementUnit } = useSettingsStore();
  const [selectedPart, setSelectedPart] = useState<BodyPart>('waist');
  const [history, setHistory] = useState<{ id: string; value: number; recorded_at: string }[]>([]);
  const [latest, setLatest] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showTrend, setShowTrend] = useState(true);
  const [valueInput, setValueInput] = useState('');
  const [allMeasurements, setAllMeasurements] = useState<Record<BodyPart, number | null>>({
    waist: null, chest: null, biceps: null, thigh: null,
    calf: null, hips: null, shoulders: null, neck: null,
  });
  // F252 — Previous (second-latest) measurements for delta display
  const [previousMeasurements, setPreviousMeasurements] = useState<Record<BodyPart, number | null>>({
    waist: null, chest: null, biceps: null, thigh: null,
    calf: null, hips: null, shoulders: null, neck: null,
  });
  // F292 — Last N measurements per body part for trend summary
  const [trendBatch, setTrendBatch] = useState<Record<string, { values: number[]; dates: string[] }>>({});

  const loadData = () => {
    const db = getDb();
    if (!db) return;

    // Load latest for all body parts
    const latestMap: Record<BodyPart, number | null> = { waist: null, chest: null, biceps: null, thigh: null, calf: null, hips: null, shoulders: null, neck: null };
    for (const { key } of BODY_PARTS) {
      latestMap[key] = getLatestMeasurement(db, key);
    }
    setAllMeasurements(latestMap);

    // F252 — Load previous (second-latest) measurements for delta display
    const prevMap: Record<BodyPart, number | null> = { waist: null, chest: null, biceps: null, thigh: null, calf: null, hips: null, shoulders: null, neck: null };
    for (const { key } of BODY_PARTS) {
      prevMap[key] = getPreviousMeasurement(db, key);
    }
    setPreviousMeasurements(prevMap);

    // F292 — Load last 5 measurements for all body parts for trend summary
    setTrendBatch(getMeasurementTrendBatch(db, 5));

    // Load history for selected part
    const hist = getMeasurementHistory(db, selectedPart, 30);
    setHistory(hist.reverse()); // chronological for chart
    setLatest(latestMap[selectedPart]);
  };

  useEffect(() => {
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPart]);

  const handleSave = () => {
    const value = parseFloat(valueInput.replace(',', '.'));
    if (isNaN(value) || value <= 0) return;
    const db = getDb();
    if (!db) return;
    const id = generateId();
    // F115 — Convert to cm for storage if unit is inches
    const valueInCm = toCm(value, measurementUnit);
    saveBodyMeasurement(db, id, selectedPart, valueInCm);
    setValueInput('');
    setShowForm(false);
    loadData();
  };

  const handleDelete = (id: string) => {
    const db = getDb();
    if (!db) return;
    deleteBodyMeasurement(db, id);
    loadData();
  };

  // F196 — Quick-adjust: save a new measurement by adding delta to the latest value
  const handleQuickAdjust = (delta: number) => {
    const db = getDb();
    if (!db || latest === null) return;
    const id = generateId();
    const newValueCm = latest + delta;
    saveBodyMeasurement(db, id, selectedPart, newValueCm);
    loadData();
  };

  const chartData: ({ date: string; value: number; label: string; trend?: number })[] = (() => {
    const data = history.map(h => ({
      date: h.recorded_at,
      value: h.value,
      label: format(new Date(h.recorded_at), 'd/M'),
    }));
    // F65 — compute linear regression trend values
    if (data.length < 2) return data;
    const n = data.length;
    const xMean = (n - 1) / 2;
    const yMean = data.reduce((s, d) => s + d.value, 0) / n;
    let num = 0;
    let den = 0;
    data.forEach((d, i) => {
      num += (i - xMean) * (d.value - yMean);
      den += (i - xMean) ** 2;
    });
    if (den === 0) return data;
    const slope = num / den;
    const intercept = yMean - slope * xMean;
    return data.map((d, i) => ({
      ...d,
      trend: Math.round((slope * i + intercept) * 10) / 10,
    }));
  })();

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b flex items-center gap-3" style={{ borderColor: 'var(--color-border)' }}>
        <Ruler size={20} style={{ color: 'var(--color-primary)' }} />
        <h1 className="text-xl font-bold">Medidas corporales</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* F292 — Trend summary row */}
        {Object.values(trendBatch).some(t => t.values.length >= 2) && (
          <div className="p-3 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold" style={{ color: 'var(--color-text-2)' }}>↕ Tendencias (últimas 5 mediciones)</h3>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {BODY_PARTS.map(({ key, label }) => {
                const trend = trendBatch[key];
                if (!trend || trend.values.length < 2) return (
                  <div key={key} className="flex flex-col items-center p-1.5 rounded-lg" style={{ backgroundColor: 'var(--color-surface-2)', opacity: 0.5 }}>
                    <span className="text-[9px] font-medium" style={{ color: 'var(--color-text-2)' }}>{label}</span>
                    <span className="text-xs" style={{ color: 'var(--color-text-2)' }}>—</span>
                  </div>
                );
                // Linear regression on last 5 values to determine direction
                const n = trend.values.length;
                const xMean = (n - 1) / 2;
                const yMean = trend.values.reduce((a, b) => a + b, 0) / n;
                let num = 0, den = 0;
                trend.values.forEach((v, i) => { num += (i - xMean) * (v - yMean); den += (i - xMean) ** 2; });
                const slope = den !== 0 ? num / den : 0;
                // Favorable direction: waist/hips down, rest up
                const isFavorable = key === 'waist' || key === 'hips' ? slope < 0 : slope > 0;
                const isStable = Math.abs(slope) < 0.05;
                const trendColor = isStable ? 'var(--color-text-2)' : isFavorable ? '#22c55e' : '#ef4444';
                const trendIcon = isStable ? '→' : slope > 0 ? '↑' : '↓';
                return (
                  <div key={key} className="flex flex-col items-center p-1.5 rounded-lg" style={{ backgroundColor: 'var(--color-surface-2)' }}>
                    <span className="text-[9px] font-medium truncate w-full text-center" style={{ color: 'var(--color-text-2)' }}>{label}</span>
                    <span className="text-sm font-bold" style={{ color: trendColor }}>{trendIcon}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Current snapshot */}
        <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
          <h3 className="text-sm font-semibold mb-3">Medidas actuales</h3>
          <div className="grid grid-cols-4 gap-2">
            {BODY_PARTS.map(({ key, label }) => {
              const curr = allMeasurements[key];
              const prev = previousMeasurements[key];
              const delta = curr !== null && prev !== null ? curr - prev : null;
              // F252 — delta chip: green if waist/hips down, biceps/thigh/calf up; red for opposite
              const isGood = delta !== null
                ? (key === 'waist' || key === 'hips' ? delta < 0 : delta > 0)
                : null;
              return (
                <button
                  key={key}
                  onClick={() => { setSelectedPart(key); setShowForm(false); }}
                  className="p-2 rounded-xl text-center flex flex-col items-center gap-0.5 transition-all"
                  style={{
                    backgroundColor: selectedPart === key ? 'var(--color-primary)' : 'var(--color-surface-2)',
                    color: selectedPart === key ? '#000' : 'var(--color-text)',
                  }}
                >
                  <span className="text-[10px] font-medium">{label}</span>
                  <span className="text-sm font-bold">
                    {curr !== null ? toDisplayUnit(curr, measurementUnit) : '—'}
                  </span>
                  {delta !== null && (
                    <span
                      className="text-[9px] font-semibold"
                      style={{ color: isGood ? '#22c55e' : '#ef4444' }}
                    >
                      {delta > 0 ? '↑' : '↓'}{Math.abs(delta * (measurementUnit === 'in' ? CM_TO_IN : 1)).toFixed(1)}
                    </span>
                  )}
                  <span className="text-[9px]" style={{ color: selectedPart === key ? '#00000099' : 'var(--color-text-2)' }}>{getUnitLabel(measurementUnit)}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Add measurement */}
        <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold capitalize">
              {BODY_PARTS.find(p => p.key === selectedPart)?.label || selectedPart}
              {' — '}
              {latest !== null ? `${toDisplayUnit(latest, measurementUnit)} ${getUnitLabel(measurementUnit)}` : 'Sin datos'}
            </h3>
            <button
              onClick={() => setShowForm(!showForm)}
              className="p-1.5 rounded-lg"
              style={{ backgroundColor: 'var(--color-primary)', color: '#000' }}
            >
              <Plus size={14} />
            </button>
          </div>

          {/* F196 — Quick-adjust buttons: only shown when there is a latest value */}
          {latest !== null && !showForm && (
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={() => handleQuickAdjust(-0.5)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)' }}
              >
                <span>−</span>
                <span>0.5 {getUnitLabel(measurementUnit)}</span>
              </button>
              <button
                onClick={() => handleQuickAdjust(0.5)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)' }}
              >
                <Plus size={12} />
                <span>0.5 {getUnitLabel(measurementUnit)}</span>
              </button>
              <button
                onClick={() => setShowForm(true)}
                className="px-3 py-2 rounded-lg text-xs font-medium"
                style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text-2)' }}
              >
                Custom
              </button>
            </div>
          )}

          {showForm && (
            <div className="flex gap-2 mb-3">
              <input
                type="number"
                value={valueInput}
                onChange={e => setValueInput(e.target.value)}
                placeholder={getUnitLabel(measurementUnit)}
                step="0.1"
                className="flex-1 rounded-lg px-3 py-2 text-sm"
                style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                autoFocus
              />
              <button
                onClick={handleSave}
                className="px-3 py-2 rounded-lg text-sm font-medium"
                style={{ backgroundColor: 'var(--color-primary)', color: '#000' }}
              >
                Guardar
              </button>
              <button
                onClick={() => { setShowForm(false); setValueInput(''); }}
                className="px-3 py-2 rounded-lg text-sm"
                style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text-2)' }}
              >
                Cancelar
              </button>
            </div>
          )}

          {/* Chart */}
          {chartData.length >= 2 && (
            <>
              <div className="flex items-center justify-end mb-1">
                <button
                  onClick={() => setShowTrend(!showTrend)}
                  className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded"
                  style={{
                    backgroundColor: showTrend ? 'var(--color-surface-2)' : 'transparent',
                    color: showTrend ? 'var(--color-primary)' : 'var(--color-text-2)',
                    border: showTrend ? '1px solid var(--color-border)' : '1px solid transparent',
                  }}
                >
                  <TrendingUp size={9} />
                  Tendencia
                </button>
              </div>
              <ResponsiveContainer width="100%" height={120}>
                <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <XAxis
                    dataKey="date"
                    tickFormatter={d => format(new Date(d), 'd/M')}
                    tick={{ fontSize: 9, fill: 'var(--color-text-2)' }}
                    interval="preserveStartEnd"
                    tickCount={4}
                  />
                  <YAxis
                    tick={{ fontSize: 9, fill: 'var(--color-text-2)' }}
                    domain={['dataMin - 1', 'dataMax + 1']}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--color-surface-2)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '8px',
                      fontSize: 11,
                    }}
                    labelFormatter={d => format(new Date(d), 'd MMM')}
                    formatter={(v: unknown) => [`${toDisplayUnit(Number(v), measurementUnit)} ${getUnitLabel(measurementUnit)}`, 'Medida'] as [string, string]}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="var(--color-primary)"
                    strokeWidth={2}
                    dot={{ r: 2, fill: 'var(--color-primary)' }}
                    activeDot={{ r: 4 }}
                  />
                  {showTrend && chartData.some(d => d.trend != null) && (
                    <Line
                      type="monotone"
                      dataKey="trend"
                      stroke="var(--color-text-2)"
                      strokeWidth={1}
                      strokeDasharray="4 2"
                      dot={false}
                      activeDot={{ r: 3 }}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
              {showTrend && chartData[0]?.trend != null && chartData.length > 1 && (
                <p className="text-[10px] text-right mt-1" style={{ color: 'var(--color-text-2)' }}>
                  {(() => {
                    const first = chartData[0].trend!;
                    const last = chartData[chartData.length - 1].trend!;
                    const diff = Math.round((last - first) * 10) / 10;
                    const unitLabel = getUnitLabel(measurementUnit);
                    if (measurementUnit === 'in') {
                      // Convert cm difference to inches for display
                      const diffIn = diff * CM_TO_IN;
                      return diffIn > 0 ? `↑ +${diffIn.toFixed(1)} ${unitLabel} total` : diffIn < 0 ? `↓ ${diffIn.toFixed(1)} ${unitLabel} total` : '→ Estable';
                    }
                    return diff > 0 ? `↑ +${diff} ${unitLabel} total` : diff < 0 ? `↓ ${diff} ${unitLabel} total` : '→ Estable';
                  })()}
                </p>
              )}
            </>
          )}

          {chartData.length === 1 && (
            <p className="text-xs text-center py-2" style={{ color: 'var(--color-text-2)' }}>
              Solo 1 registro. Añade más para ver la tendencia.
            </p>
          )}

          {chartData.length === 0 && !showForm && (
            <p className="text-xs text-center py-2" style={{ color: 'var(--color-text-2)' }}>
              Sin registros para esta medida. Pulsa + para añadir.
            </p>
          )}
        </div>

        {/* Recent entries for selected part */}
        {history.length > 0 && (
          <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
            <h3 className="text-sm font-semibold mb-3">Historial</h3>
            <div className="space-y-1.5">
              {/* Show in reverse chronological (most recent first) */}
              {[...history].reverse().slice(0, 10).map((h, i) => {
                const prev = i < [...history].reverse().length - 1 ? [...history].reverse()[i + 1].value : null;
                const diff = prev !== null ? h.value - prev : null;
                return (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b last:border-0" style={{ borderColor: 'var(--color-border)' }}>
                    <span className="text-xs" style={{ color: 'var(--color-text-2)' }}>
                      {format(new Date(h.recorded_at), 'd MMM', { locale: es })}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{toDisplayUnit(h.value, measurementUnit)} {getUnitLabel(measurementUnit)}</span>
                      {diff !== null && (
                        <span className="text-[10px]" style={{ color: diff > 0 ? '#22c55e' : diff < 0 ? '#ef4444' : 'var(--color-text-2)' }}>
                          {(() => {
                            const unitLabel = getUnitLabel(measurementUnit);
                            let diffStr: string;
                            if (measurementUnit === 'in') {
                              const diffIn = diff * CM_TO_IN;
                              diffStr = diffIn > 0 ? `+${diffIn.toFixed(1)}` : diffIn.toFixed(1);
                            } else {
                              diffStr = diff > 0 ? `+${diff}` : String(diff);
                            }
                            return `${diffStr} ${unitLabel}`;
                          })()}
                        </span>
                      )}
                      <button
                        onClick={() => handleDelete(h.id)}
                        className="p-1 rounded"
                        style={{ color: 'var(--color-text-2)' }}
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
