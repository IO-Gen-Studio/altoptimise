import { useMemo, useState, useCallback } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ReferenceLine,
} from 'recharts';
import type { RefrigerationReading } from '@/lib/refrigeration/parse';

interface Props {
  readings: RefrigerationReading[];
  dateRange: [Date, Date];
  maxSafeTemp?: number;
}

const SERIES = ['control', 'airOn', 'airOff', 'alarm', 'logging'] as const;

export function TemperatureChart({ readings, dateRange, maxSafeTemp = 8 }: Props) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const toggleSeries = useCallback((dataKey: string) => {
    setHidden(prev => {
      const next = new Set(prev);
      if (next.has(dataKey)) next.delete(dataKey);
      else next.add(dataKey);
      return next;
    });
  }, []);

  const data = useMemo(() => {
    const filtered = readings.filter(r => r.time >= dateRange[0] && r.time <= dateRange[1]);
    const step = Math.max(1, Math.floor(filtered.length / 500));
    return filtered.filter((_, i) => i % step === 0).map(r => ({
      time: r.time.getTime(),
      label: r.time.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
      control: r.controlTemp,
      airOn: r.airOnTemp,
      airOff: r.airOffTemp,
      alarm: r.alarmTemp,
      logging: r.loggingTemp,
    }));
  }, [readings, dateRange]);

  const handleLegendClick = (e: any) => {
    const key = e.dataKey ?? e.value;
    if (key) toggleSeries(key);
  };

  return (
    <div className="stat-card opacity-0 animate-fade-up" style={{ animationDelay: '200ms' }}>
      <h3 className="text-sm font-semibold mb-4 text-foreground">Temperature Over Time</h3>
      <div className="h-[360px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.6} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
              tickLine={false}
              axisLine={false}
              unit="°C"
            />
            <Tooltip
              contentStyle={{
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                fontSize: 12,
                boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
              }}
            />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 12, cursor: 'pointer' }}
              onClick={handleLegendClick}
              formatter={(value: string, entry: any) => {
                const isHidden = hidden.has(entry.dataKey);
                return <span style={{ color: isHidden ? 'var(--muted-foreground)' : entry.color, opacity: isHidden ? 0.4 : 1, textDecoration: isHidden ? 'line-through' : 'none' }}>{value}</span>;
              }}
            />
            <ReferenceLine y={maxSafeTemp} stroke="var(--chart-alarm)" strokeDasharray="6 4" strokeOpacity={0.5} label={{ value: `Cut-in ${maxSafeTemp}°C`, fill: "var(--chart-alarm)", fontSize: 10, position: "insideTopRight" }} />
            <Line type="monotone" dataKey="control" name="Control" stroke="var(--chart-control)" strokeWidth={2} dot={false} hide={hidden.has('control')} />
            <Line type="monotone" dataKey="airOn" name="Air On" stroke="var(--chart-air-on)" strokeWidth={1.5} dot={false} hide={hidden.has('airOn')} />
            <Line type="monotone" dataKey="airOff" name="Air Off" stroke="var(--chart-air-off)" strokeWidth={1.5} dot={false} hide={hidden.has('airOff')} />
            <Line type="monotone" dataKey="alarm" name="Alarm" stroke="var(--chart-alarm)" strokeWidth={1} dot={false} strokeDasharray="4 2" hide={hidden.has('alarm')} />
            <Line type="monotone" dataKey="logging" name="Logging" stroke="var(--chart-logging)" strokeWidth={1} dot={false} opacity={0.7} hide={hidden.has('logging')} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
