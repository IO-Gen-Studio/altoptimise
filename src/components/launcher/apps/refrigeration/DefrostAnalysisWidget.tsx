import { useMemo } from 'react';
import { Snowflake, Info } from 'lucide-react';
import type { RefrigerationReading } from '@/lib/refrigeration/parse';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface Props {
  readings: RefrigerationReading[];
  dateRange: [Date, Date];
  maxSafeTemp: number;
}

interface DefrostEvent {
  time: Date;
  lengthMin: number | null;
  defTemp: number | null;
  defType: string;
  postPeak: number | null;
  recoveryMin: number | null;
  spike: boolean;
}

function parseLength(s: string): number | null {
  if (!s) return null;
  // Could be "0:25" or "25" or "25 min"
  const t = s.trim();
  if (t.includes(':')) {
    const [h, m] = t.split(':').map(v => parseInt(v));
    if (!isNaN(h) && !isNaN(m)) return h * 60 + m;
  }
  const n = parseFloat(t);
  return isNaN(n) ? null : n;
}

export function DefrostAnalysisWidget({ readings, dateRange, maxSafeTemp }: Props) {
  const { events, avgLength, avgRecoveryMin, spikePct } = useMemo(() => {
    const filtered = readings.filter(r => r.time >= dateRange[0] && r.time <= dateRange[1]);
    const events: DefrostEvent[] = [];

    // Detect transitions out of "Defrost" or "Post Defrost" / use lastDefTime change as a defrost marker
    let inDefrost = false;
    let defStart = -1;
    let defEnd = -1;
    let lastSeenDefTime = '';

    for (let i = 0; i < filtered.length; i++) {
      const state = (filtered[i].controlState || '').toLowerCase();
      const isDef = state.includes('defrost') && !state.includes('post');
      if (isDef && !inDefrost) {
        inDefrost = true;
        defStart = i;
        defEnd = i;
      } else if (isDef) {
        defEnd = i;
      } else if (!isDef && inDefrost) {
        // record defrost ended at defEnd
        const r = filtered[defEnd];
        const endTime = r.time.getTime();
        // post-defrost peak within 60 min after end
        let postPeak: number | null = null;
        let recoveryMin: number | null = null;
        for (let j = defEnd + 1; j < filtered.length; j++) {
          const f = filtered[j];
          const dt = (f.time.getTime() - endTime) / 60000;
          if (dt > 90) break;
          if (f.controlTemp !== null) {
            if (postPeak === null || f.controlTemp > postPeak) postPeak = f.controlTemp;
            if (recoveryMin === null && f.controlTemp <= maxSafeTemp && dt > 0) recoveryMin = dt;
          }
        }
        events.push({
          time: filtered[defStart].time,
          lengthMin: +(((endTime - filtered[defStart].time.getTime()) / 60000).toFixed(1)),
          defTemp: r.lastDefTemp,
          defType: r.lastDefType || '—',
          postPeak,
          recoveryMin: recoveryMin !== null ? +recoveryMin.toFixed(1) : null,
          spike: postPeak !== null && postPeak > maxSafeTemp,
        });
        inDefrost = false;
      }
    }

    // Fallback: if no state-based defrosts found, derive from changes in lastDefTime
    if (events.length === 0) {
      for (const r of filtered) {
        if (r.lastDefTime && r.lastDefTime !== lastSeenDefTime) {
          if (lastSeenDefTime !== '') {
            // check post peak within 60 min after this reading
            const startTime = r.time.getTime();
            let postPeak: number | null = null;
            let recoveryMin: number | null = null;
            for (const f of filtered) {
              const dt = (f.time.getTime() - startTime) / 60000;
              if (dt < 0) continue;
              if (dt > 90) break;
              if (f.controlTemp !== null) {
                if (postPeak === null || f.controlTemp > postPeak) postPeak = f.controlTemp;
                if (recoveryMin === null && f.controlTemp <= maxSafeTemp && dt > 0) recoveryMin = dt;
              }
            }
            events.push({
              time: r.time,
              lengthMin: parseLength(r.lastDefLength),
              defTemp: r.lastDefTemp,
              defType: r.lastDefType || '—',
              postPeak,
              recoveryMin: recoveryMin !== null ? +recoveryMin.toFixed(1) : null,
              spike: postPeak !== null && postPeak > maxSafeTemp,
            });
          }
          lastSeenDefTime = r.lastDefTime;
        }
      }
    }

    const lengths = events.map(e => e.lengthMin).filter((v): v is number => v !== null);
    const recs = events.map(e => e.recoveryMin).filter((v): v is number => v !== null);
    const spikes = events.filter(e => e.spike).length;

    return {
      events,
      avgLength: lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0,
      avgRecoveryMin: recs.length ? recs.reduce((a, b) => a + b, 0) / recs.length : 0,
      spikePct: events.length ? (spikes / events.length) * 100 : 0,
    };
  }, [readings, dateRange, maxSafeTemp]);

  const recent = events.slice(-5).reverse();

  return (
    <div className="stat-card opacity-0 animate-fade-up" style={{ animationDelay: '500ms' }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Snowflake size={14} className="text-chart-air-off" />
          Defrost Analysis
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-muted-foreground hover:text-foreground transition-colors">
                  <Info size={12} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
                Tracks defrost cycles using Control State transitions and the Last Def. Time / Length / Probe / Ext Defrost fields. Reports average defrost duration, recovery time back below cut-in, and the percentage of defrosts followed by a temperature spike — flagging poor or incomplete defrost cycles.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </h3>
        <span className="text-xs text-muted-foreground">{events.length} event{events.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="text-center p-2 rounded-md bg-muted/40">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Avg Length</p>
          <p className="text-base font-mono font-semibold text-foreground mt-0.5">
            {events.length ? `${avgLength.toFixed(0)}m` : '—'}
          </p>
        </div>
        <div className="text-center p-2 rounded-md bg-muted/40">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Avg Recovery</p>
          <p className="text-base font-mono font-semibold text-foreground mt-0.5">
            {events.length ? `${avgRecoveryMin.toFixed(0)}m` : '—'}
          </p>
        </div>
        <div className="text-center p-2 rounded-md bg-muted/40">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Post-spike</p>
          <p className={`text-base font-mono font-semibold mt-0.5 ${spikePct > 50 ? 'text-destructive' : 'text-foreground'}`}>
            {events.length ? `${spikePct.toFixed(0)}%` : '—'}
          </p>
        </div>
      </div>

      {recent.length > 0 ? (
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">Recent defrosts</p>
          <div className="space-y-1">
            {recent.map((e, i) => (
              <div key={i} className="flex items-center justify-between text-[11px] py-1 px-2 rounded-md bg-muted/30">
                <span className="font-mono text-muted-foreground">
                  {e.time.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="font-mono text-foreground">
                  {e.defType !== '—' ? `${e.defType} · ` : ''}
                  {e.lengthMin !== null ? `${e.lengthMin.toFixed(0)}m` : '—'}
                  {e.defTemp !== null ? ` · probe ${e.defTemp}°` : ''}
                </span>
                <span className={`font-mono ${e.spike ? 'text-destructive' : 'text-muted-foreground'}`}>
                  peak {e.postPeak !== null ? `${e.postPeak.toFixed(1)}°` : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center py-3">No defrost events detected in this range.</p>
      )}
    </div>
  );
}
