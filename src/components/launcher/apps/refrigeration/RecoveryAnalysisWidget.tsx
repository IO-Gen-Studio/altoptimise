import { useMemo } from 'react';
import { TrendingDown, Info } from 'lucide-react';
import type { RefrigerationReading } from '@/lib/refrigeration/parse';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface Props {
  readings: RefrigerationReading[];
  dateRange: [Date, Date];
  maxSafeTemp: number;
}

interface RecoveryEvent {
  start: Date;
  end: Date;
  tempBefore: number | null;
  tempPeak: number | null;
  tempAfter: number | null;
  recoveryMin: number; // time from end of recovery state until temp <= maxSafe
  durationMin: number; // length of the recovery state itself
}

function isRecoveryState(state: string): boolean {
  const s = (state || '').toLowerCase();
  return s.includes('recovery') || s.includes('post defrost') || s.includes('post-defrost');
}

export function RecoveryAnalysisWidget({ readings, dateRange, maxSafeTemp }: Props) {
  const { events, avgRecoveryMin, avgPeakTemp, avgDelta } = useMemo(() => {
    const filtered = readings.filter(r => r.time >= dateRange[0] && r.time <= dateRange[1]);
    const events: RecoveryEvent[] = [];

    let inRecovery = false;
    let recStart = -1;
    let recEnd = -1;

    const flush = (startIdx: number, endIdx: number) => {
      // before: avg of temps in 30 min before recovery start
      const startTime = filtered[startIdx].time.getTime();
      const beforeWindow = filtered.filter((r, i) => i < startIdx && startTime - r.time.getTime() <= 30 * 60000);
      const tempsBefore = beforeWindow.map(r => r.controlTemp).filter((t): t is number => t !== null);

      // peak during recovery
      const duringTemps: number[] = [];
      for (let i = startIdx; i <= endIdx; i++) {
        const t = filtered[i].controlTemp;
        if (t !== null) duringTemps.push(t);
      }

      // after: time until controlTemp returns to <= maxSafe
      const endTime = filtered[endIdx].time.getTime();
      let recoveryMin = 0;
      let tempAfter: number | null = null;
      for (let i = endIdx + 1; i < filtered.length; i++) {
        const r = filtered[i];
        if (r.controlTemp !== null && r.controlTemp <= maxSafeTemp) {
          recoveryMin = (r.time.getTime() - endTime) / 60000;
          tempAfter = r.controlTemp;
          break;
        }
        // safety cap: 4h
        if ((r.time.getTime() - endTime) > 4 * 3600 * 1000) {
          recoveryMin = 240;
          tempAfter = r.controlTemp;
          break;
        }
      }

      events.push({
        start: filtered[startIdx].time,
        end: filtered[endIdx].time,
        tempBefore: tempsBefore.length ? +(tempsBefore.reduce((a, b) => a + b, 0) / tempsBefore.length).toFixed(1) : null,
        tempPeak: duringTemps.length ? +Math.max(...duringTemps).toFixed(1) : null,
        tempAfter,
        recoveryMin: +recoveryMin.toFixed(1),
        durationMin: +((endTime - startTime) / 60000).toFixed(1),
      });
    };

    for (let i = 0; i < filtered.length; i++) {
      const recov = isRecoveryState(filtered[i].controlState);
      if (recov && !inRecovery) {
        inRecovery = true;
        recStart = i;
        recEnd = i;
      } else if (recov && inRecovery) {
        recEnd = i;
      } else if (!recov && inRecovery) {
        flush(recStart, recEnd);
        inRecovery = false;
      }
    }
    if (inRecovery) flush(recStart, recEnd);

    const recTimes = events.map(e => e.recoveryMin).filter(v => v > 0);
    const peaks = events.map(e => e.tempPeak).filter((t): t is number => t !== null);
    const deltas = events
      .filter(e => e.tempBefore !== null && e.tempPeak !== null)
      .map(e => (e.tempPeak as number) - (e.tempBefore as number));

    return {
      events,
      avgRecoveryMin: recTimes.length ? recTimes.reduce((a, b) => a + b, 0) / recTimes.length : 0,
      avgPeakTemp: peaks.length ? peaks.reduce((a, b) => a + b, 0) / peaks.length : 0,
      avgDelta: deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : 0,
    };
  }, [readings, dateRange, maxSafeTemp]);

  const recent = events.slice(-5).reverse();

  return (
    <div className="stat-card opacity-0 animate-fade-up" style={{ animationDelay: '450ms' }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <TrendingDown size={14} className="text-primary" />
          Recovery Behaviour
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-muted-foreground hover:text-foreground transition-colors">
                  <Info size={12} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
                Identifies "Recovery" and "Post Defrost" states and compares the average temperature in the 30 minutes before, the peak during, and how long it takes to return below the cut-in temperature afterward. Indicates how quickly the system recovers from disturbances.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </h3>
        <span className="text-xs text-muted-foreground">{events.length} event{events.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="text-center p-2 rounded-md bg-muted/40">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Avg Recovery</p>
          <p className="text-base font-mono font-semibold text-foreground mt-0.5">
            {events.length ? `${avgRecoveryMin.toFixed(0)}m` : '—'}
          </p>
        </div>
        <div className="text-center p-2 rounded-md bg-muted/40">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Avg Peak</p>
          <p className="text-base font-mono font-semibold text-foreground mt-0.5">
            {events.length ? `${avgPeakTemp.toFixed(1)}°C` : '—'}
          </p>
        </div>
        <div className="text-center p-2 rounded-md bg-muted/40">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Avg Δ</p>
          <p className="text-base font-mono font-semibold text-foreground mt-0.5">
            {events.length ? `${avgDelta >= 0 ? '+' : ''}${avgDelta.toFixed(1)}°C` : '—'}
          </p>
        </div>
      </div>

      {recent.length > 0 ? (
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">Recent recoveries</p>
          <div className="space-y-1">
            {recent.map((e, i) => (
              <div key={i} className="flex items-center justify-between text-[11px] py-1 px-2 rounded-md bg-muted/30">
                <span className="font-mono text-muted-foreground">
                  {e.start.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="font-mono text-foreground">
                  {e.tempBefore ?? '—'}° → <span className="text-destructive">{e.tempPeak ?? '—'}°</span> → {e.tempAfter ?? '—'}°
                </span>
                <span className="font-mono text-muted-foreground">{e.recoveryMin.toFixed(0)}m</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center py-3">No recovery events in this range.</p>
      )}
    </div>
  );
}
