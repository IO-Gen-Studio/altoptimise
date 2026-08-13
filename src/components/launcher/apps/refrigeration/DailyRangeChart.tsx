import { useMemo } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, Cell,
} from 'recharts';
import { getDailySummary, type RefrigerationReading } from '@/lib/refrigeration/parse';

interface Props {
  readings: RefrigerationReading[];
  dateRange: [Date, Date];
  maxSafeTemp?: number;
}

export function DailyRangeChart({ readings, dateRange, maxSafeTemp = 8 }: Props) {
  const data = useMemo(() => {
    const filtered = readings.filter(r => r.time >= dateRange[0] && r.time <= dateRange[1]);
    return getDailySummary(filtered).map(d => ({
      date: new Date(d.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
      min: d.min,
      avg: d.avg,
      max: d.max,
      range: d.min !== null && d.max !== null ? +(d.max - d.min).toFixed(1) : 0,
      isHigh: d.max !== null && d.max > maxSafeTemp,
    }));
  }, [readings, dateRange, maxSafeTemp]);

  return (
    <div className="stat-card opacity-0 animate-fade-up" style={{ animationDelay: '300ms' }}>
      <h3 className="text-sm font-semibold mb-4 text-foreground">Daily Average Temperature</h3>
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.6} vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} unit="°C" />
            <Tooltip
              contentStyle={{
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                fontSize: 12,
              }}
            />
            <ReferenceLine y={maxSafeTemp} stroke="var(--chart-alarm)" strokeDasharray="6 4" strokeOpacity={0.5} />
            <Bar dataKey="avg" radius={[4, 4, 0, 0]} maxBarSize={16}>
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.isHigh ? 'var(--chart-alarm)' : 'var(--chart-control)'} opacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
