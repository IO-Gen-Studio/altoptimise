import { useMemo } from 'react';
import type { RefrigerationReading } from '@/lib/refrigeration/parse';

interface Props {
  readings: RefrigerationReading[];
  dateRange: [Date, Date];
}

const stateColors: Record<string, string> = {
  'Normal': 'bg-primary',
  'Case Off': 'bg-status-off',
  'Refrigerating': 'bg-primary',
  'Defrost': 'bg-chart-air-off',
  'Fan Only': 'bg-chart-air-on',
  'Post Defrost': 'bg-chart-logging',
};

export function ControlStateTimeline({ readings, dateRange }: Props) {
  const segments = useMemo(() => {
    const filtered = readings.filter(r => r.time >= dateRange[0] && r.time <= dateRange[1]);
    if (!filtered.length) return [];

    const result: { state: string; start: Date; end: Date; count: number }[] = [];
    let current = { state: filtered[0].controlState, start: filtered[0].time, end: filtered[0].time, count: 1 };

    for (let i = 1; i < filtered.length; i++) {
      if (filtered[i].controlState === current.state) {
        current.end = filtered[i].time;
        current.count++;
      } else {
        result.push({ ...current });
        current = { state: filtered[i].controlState, start: filtered[i].time, end: filtered[i].time, count: 1 };
      }
    }
    result.push(current);
    return result;
  }, [readings, dateRange]);

  const total = useMemo(() => {
    if (!segments.length) return 1;
    return dateRange[1].getTime() - dateRange[0].getTime();
  }, [segments, dateRange]);

  const stateCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of segments) {
      counts[s.state] = (counts[s.state] || 0) + s.count;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [segments]);

  return (
    <div className="stat-card opacity-0 animate-fade-up" style={{ animationDelay: '350ms' }}>
      <h3 className="text-sm font-semibold mb-4 text-foreground">Control State Timeline</h3>
      <div className="flex rounded-md overflow-hidden h-8 mb-4">
        {segments.map((seg, i) => {
          const width = ((seg.end.getTime() - seg.start.getTime() + 900000) / total) * 100;
          if (width < 0.1) return null;
          const colorClass = stateColors[seg.state] || 'bg-muted';
          return (
            <div
              key={i}
              className={`${colorClass} transition-opacity hover:opacity-80`}
              style={{ width: `${Math.max(width, 0.3)}%` }}
              title={`${seg.state}: ${seg.start.toLocaleString('en-GB')} — ${seg.end.toLocaleString('en-GB')}`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3">
        {stateCounts.map(([state, count]) => (
          <div key={state} className="flex items-center gap-1.5 text-xs">
            <span className={`w-2.5 h-2.5 rounded-sm ${stateColors[state] || 'bg-muted'}`} />
            <span className="text-muted-foreground">{state}</span>
            <span className="font-mono font-medium text-foreground">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
