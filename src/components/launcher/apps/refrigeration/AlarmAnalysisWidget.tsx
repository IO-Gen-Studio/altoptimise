import { useMemo } from 'react';
import { Bell, Info } from 'lucide-react';
import type { RefrigerationReading } from '@/lib/refrigeration/parse';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface Props {
  readings: RefrigerationReading[];
  dateRange: [Date, Date];
}

interface AlarmEvent {
  start: Date;
  end: Date;
  durationMin: number;
  precedingState: string;
}

function isOTAlarm(r: RefrigerationReading): boolean {
  // OT (Over Temp) alarm is primarily indicated by Control State = "OT Alarm".
  // Also fall back to plant fault fields containing OT / Over Temp indicators.
  const state = (r.controlState || '').trim().toUpperCase();
  if (state.includes('OT') || state.includes('OVER TEMP') || state.includes('HIGH TEMP')) return true;

  const fields = [r.plantFault1, r.plantFault2, r.plantFault3];
  return fields.some(f => {
    const v = (f || '').trim().toUpperCase();
    if (!v || v === 'OK') return false;
    return v === 'OT' || v.includes('OT ALARM') || v.includes('OVER TEMP') || v.includes('HIGH TEMP');
  });
}

export function AlarmAnalysisWidget({ readings, dateRange }: Props) {
  const { events, hourBuckets, totalDurationMin, avgDurationMin } = useMemo(() => {
    const filtered = readings.filter(r => r.time >= dateRange[0] && r.time <= dateRange[1]);
    const events: AlarmEvent[] = [];
    let current: { start: Date; end: Date; precedingState: string } | null = null;
    let lastNonAlarmState = '';

    for (let i = 0; i < filtered.length; i++) {
      const r = filtered[i];
      const alarmed = isOTAlarm(r);
      if (alarmed) {
        if (!current) {
          current = { start: r.time, end: r.time, precedingState: lastNonAlarmState };
        } else {
          current.end = r.time;
        }
      } else {
        lastNonAlarmState = r.controlState || lastNonAlarmState;
        if (current) {
          const durMin = Math.max(1, (current.end.getTime() - current.start.getTime()) / 60000);
          events.push({ ...current, durationMin: durMin });
          current = null;
        }
      }
    }
    if (current) {
      const durMin = Math.max(1, (current.end.getTime() - current.start.getTime()) / 60000);
      events.push({ ...current, durationMin: durMin });
    }

    const hourBuckets = new Array(24).fill(0);
    for (const e of events) hourBuckets[e.start.getHours()]++;

    const totalDurationMin = events.reduce((s, e) => s + e.durationMin, 0);
    const avgDurationMin = events.length ? totalDurationMin / events.length : 0;

    return { events, hourBuckets, totalDurationMin, avgDurationMin };
  }, [readings, dateRange]);

  const maxBucket = Math.max(...hourBuckets, 1);
  const peakHour = hourBuckets.indexOf(maxBucket);

  // Top preceding states
  const precedingCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of events) {
      const k = e.precedingState || 'Unknown';
      m.set(k, (m.get(k) || 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);
  }, [events]);

  return (
    <div className="stat-card opacity-0 animate-fade-up" style={{ animationDelay: '400ms' }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Bell size={14} className="text-destructive" />
          OT Alarm Frequency & Duration
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-muted-foreground hover:text-foreground transition-colors">
                  <Info size={12} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
                Detects Over-Temperature (OT) alarms by scanning the Control State for "OT Alarm" (with fallback to plant fault fields). Reports total alarm time, average duration, peak hour-of-day, and the operating state that preceded each alarm — helping spot clustering after specific events like defrosts.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </h3>
        <span className="text-xs text-muted-foreground">{events.length} event{events.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="text-center p-2 rounded-md bg-muted/40">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Time</p>
          <p className="text-base font-mono font-semibold text-foreground mt-0.5">
            {totalDurationMin >= 60 ? `${(totalDurationMin / 60).toFixed(1)}h` : `${Math.round(totalDurationMin)}m`}
          </p>
        </div>
        <div className="text-center p-2 rounded-md bg-muted/40">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Avg Duration</p>
          <p className="text-base font-mono font-semibold text-foreground mt-0.5">
            {avgDurationMin >= 60 ? `${(avgDurationMin / 60).toFixed(1)}h` : `${Math.round(avgDurationMin)}m`}
          </p>
        </div>
        <div className="text-center p-2 rounded-md bg-muted/40">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Peak Hour</p>
          <p className="text-base font-mono font-semibold text-foreground mt-0.5">
            {events.length ? `${String(peakHour).padStart(2, '0')}:00` : '—'}
          </p>
        </div>
      </div>

      <div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">Hour-of-day distribution</p>
        <div className="flex items-end gap-[2px] h-14">
          {hourBuckets.map((c, h) => (
            <div
              key={h}
              className="flex-1 bg-destructive/70 hover:bg-destructive rounded-sm transition-colors min-h-[2px]"
              style={{ height: `${(c / maxBucket) * 100}%` }}
              title={`${String(h).padStart(2, '0')}:00 — ${c} alarm${c !== 1 ? 's' : ''}`}
            />
          ))}
        </div>
        <div className="flex justify-between text-[9px] text-muted-foreground mt-1 font-mono">
          <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
        </div>
      </div>

      {precedingCounts.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">Preceded by state</p>
          <div className="flex flex-wrap gap-1.5">
            {precedingCounts.map(([state, count]) => (
              <span key={state} className="text-[11px] px-2 py-0.5 rounded-md bg-secondary text-foreground">
                {state || 'Unknown'} <span className="font-mono text-muted-foreground">×{count}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
