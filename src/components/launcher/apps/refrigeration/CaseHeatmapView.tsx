import { useMemo, useState } from 'react';
import type { RefrigerationReading } from '@/lib/refrigeration/parse';

type Metric = 'controlTemp' | 'displayTemp' | 'airOffTemp';

const METRIC_LABELS: Record<Metric, string> = {
  controlTemp: 'Control Temp',
  displayTemp: 'Display Temp',
  airOffTemp: 'Air Off Probe',
};

interface CaseInput {
  caseId: string;
  label: string;
  description?: string;
  readings: RefrigerationReading[];
  loading?: boolean;
}

interface Props {
  caseReadings: CaseInput[];
  dateRange: [Date, Date];
  onCaseClick?: (caseId: string) => void;
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDay(key: string) {
  const [y, m, d] = key.split('-');
  return `${d}/${m}`;
}

function colorFor(value: number | null, min: number, max: number): string {
  if (value === null || !isFinite(value)) return 'var(--muted)';
  if (max === min) return 'color-mix(in oklab, var(--chart-control) 40%, transparent)';
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  // Cool (blue) → warm (red). Use HSL hue from 210 → 0
  const hue = 210 - 210 * t;
  return `hsl(${hue}, 75%, 50%)`;
}

function CaseHeatmap({ caseInput, dateRange, metric, onClick, hideHeader, bare }: {
  caseInput: CaseInput;
  dateRange: [Date, Date];
  metric: Metric;
  onClick?: () => void;
  hideHeader?: boolean;
  bare?: boolean;
}) {
  const { days, grid, min, max } = useMemo(() => {
    const filtered = caseInput.readings.filter(r => r.time >= dateRange[0] && r.time <= dateRange[1]);

    // Build day list from range
    const days: string[] = [];
    const start = new Date(dateRange[0]); start.setHours(0, 0, 0, 0);
    const end = new Date(dateRange[1]); end.setHours(0, 0, 0, 0);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      days.push(dayKey(d));
    }

    // grid[hour][dayIndex] = { sum, count }
    const acc: { sum: number; count: number }[][] = Array.from({ length: 24 }, () =>
      days.map(() => ({ sum: 0, count: 0 }))
    );
    const dayIdx = new Map(days.map((d, i) => [d, i]));

    let mn = Infinity, mx = -Infinity;
    for (const r of filtered) {
      const v = r[metric];
      if (v === null || v === undefined) continue;
      const di = dayIdx.get(dayKey(r.time));
      if (di === undefined) continue;
      const h = r.time.getHours();
      acc[h][di].sum += v;
      acc[h][di].count += 1;
    }

    const grid: (number | null)[][] = acc.map(row =>
      row.map(({ sum, count }) => {
        if (count === 0) return null;
        const avg = sum / count;
        if (avg < mn) mn = avg;
        if (avg > mx) mx = avg;
        return avg;
      })
    );

    return { days, grid, min: isFinite(mn) ? mn : 0, max: isFinite(mx) ? mx : 0 };
  }, [caseInput.readings, dateRange, metric]);

  const cellW = days.length > 0 ? Math.max(8, Math.min(20, 720 / days.length)) : 12;

  return (
    <div className={bare ? '' : 'rounded-lg border border-border bg-card p-4'}>
      {!hideHeader && (
      <div className="flex items-baseline justify-between mb-3 gap-3">
        <button
          onClick={onClick}
          disabled={!onClick}
          className={`text-left ${onClick ? 'hover:text-primary cursor-pointer' : 'cursor-default'} transition-colors`}
        >
          <div className="text-sm font-medium text-foreground">{caseInput.caseId}</div>
          <div className="text-[11px] text-muted-foreground">{caseInput.description || caseInput.label}</div>
        </button>
        {grid.some(row => row.some(v => v !== null)) && (
          <div className="text-[10px] text-muted-foreground font-mono shrink-0">
            {min.toFixed(1)}°C → {max.toFixed(1)}°C
          </div>
        )}
      </div>
      )}

      {caseInput.loading ? (
        <div className="h-[200px] flex items-center justify-center text-xs text-muted-foreground">Loading…</div>
      ) : days.length === 0 || !grid.some(row => row.some(v => v !== null)) ? (
        <div className="h-[120px] flex items-center justify-center text-xs text-muted-foreground">No data in range</div>
      ) : (
        <div className="overflow-x-auto">
          <div className="inline-block">
            <div className="flex">
              <div className="w-8 shrink-0" />
              <div className="flex">
                {days.map((d, i) => (
                  <div
                    key={d}
                    style={{ width: cellW }}
                    className="text-[8px] text-muted-foreground text-center"
                  >
                    {i % Math.max(1, Math.ceil(days.length / 12)) === 0 ? fmtDay(d) : ''}
                  </div>
                ))}
              </div>
            </div>
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="flex items-center">
                <div className="w-8 shrink-0 text-[9px] text-muted-foreground text-right pr-1.5 font-mono">
                  {h % 3 === 0 ? `${String(h).padStart(2, '0')}` : ''}
                </div>
                <div className="flex">
                  {days.map((d, di) => {
                    const v = grid[h][di];
                    return (
                      <div
                        key={d}
                        style={{ width: cellW, height: 12, background: colorFor(v, min, max) }}
                        className="border border-card"
                        title={`${fmtDay(d)} ${String(h).padStart(2, '0')}:00 — ${v !== null ? v.toFixed(1) + '°C' : 'no data'}`}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function CaseHeatmapView({ caseReadings, dateRange, onCaseClick }: Props) {
  const [metric, setMetric] = useState<Metric>('controlTemp');

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-sm font-medium text-foreground">Hour vs Day Temperature Heatmap</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Hourly average of selected probe across each day in range. Cool = colder, warm = hotter.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">Metric:</span>
          <select
            value={metric}
            onChange={e => setMetric(e.target.value as Metric)}
            className="text-xs px-2 py-1 bg-secondary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {(Object.keys(METRIC_LABELS) as Metric[]).map(m => (
              <option key={m} value={m}>{METRIC_LABELS[m]}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4">
        {caseReadings.map(c => (
          <CaseHeatmap
            key={c.caseId}
            caseInput={c}
            dateRange={dateRange}
            metric={metric}
            onClick={onCaseClick ? () => onCaseClick(c.caseId) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

export function HeatmapWidget({ readings, dateRange }: { readings: RefrigerationReading[]; dateRange: [Date, Date] }) {
  const [metric, setMetric] = useState<Metric>('controlTemp');

  return (
    <div className="stat-card opacity-0 animate-fade-up" style={{ animationDelay: '350ms' }}>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Hour vs Day Heatmap</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Hourly average across each day. Cool = colder, warm = hotter.
          </p>
        </div>
        <select
          value={metric}
          onChange={e => setMetric(e.target.value as Metric)}
          className="text-xs px-2 py-1 bg-secondary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {(Object.keys(METRIC_LABELS) as Metric[]).map(m => (
            <option key={m} value={m}>{METRIC_LABELS[m]}</option>
          ))}
        </select>
      </div>
      <CaseHeatmap
        caseInput={{ caseId: '', label: '', readings }}
        dateRange={dateRange}
        metric={metric}
        hideHeader
        bare
      />
    </div>
  );
}

