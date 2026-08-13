import { useState, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react';
import { parseRefrigerationCSV, type RefrigerationReading } from '@/lib/refrigeration/parse';
import type { CaseOption } from '@/lib/refrigeration/types';
import { AlertTriangle } from 'lucide-react';
import type { AlarmEntry } from '@/lib/refrigeration/alarms';
import { buildAlarmIndex } from '@/lib/refrigeration/alarms';

export interface HourlyTemperatureViewHandle {
  getExportData: () => Record<string, any>[];
}

interface Props {
  cases: CaseOption[];
  dateRange: [Date, Date];
  alarms?: AlarmEntry[];
  showLabels?: boolean;
  onCaseClick?: (caseId: string) => void;
}

function loadCaseReadings(c: CaseOption): Promise<RefrigerationReading[]> {
  if (c.csvText) {
    try { return Promise.resolve(parseRefrigerationCSV(c.csvText).readings); }
    catch { return Promise.resolve([]); }
  }
  if (c.file) {
    return fetch(c.file).then(r => r.text()).then(t => parseRefrigerationCSV(t).readings).catch(() => []);
  }
  return Promise.resolve([]);
}

function hourKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}`;
}

function formatHour(hk: string): string {
  const [datePart, hourPart] = hk.split('T');
  const [y, mo, d] = datePart.split('-').map(Number);
  const dt = new Date(y, mo - 1, d, Number(hourPart));
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ' ' +
    dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export const HourlyTemperatureView = forwardRef<HourlyTemperatureViewHandle, Props>(function HourlyTemperatureView({ cases, dateRange, alarms, showLabels, onCaseClick }, ref) {
  const [allData, setAllData] = useState<Map<string, RefrigerationReading[]>>(new Map());
  const [loading, setLoading] = useState(true);

  const alarmIndex = useMemo(() => {
    if (!alarms || alarms.length === 0) return new Map<string, Map<string, AlarmEntry[]>>();
    const idx = buildAlarmIndex(alarms);
    console.log('[AlarmIndex] Built index with', idx.size, 'controllers:', Array.from(idx.keys()));
    return idx;
  }, [alarms]);

  useEffect(() => {
    setLoading(true);
    Promise.all(cases.map(async (c) => [c.id, await loadCaseReadings(c)] as const))
      .then((results) => {
        const map = new Map<string, RefrigerationReading[]>();
        results.forEach(([id, readings]) => map.set(id, readings));
        setAllData(map);
        setLoading(false);
      });
  }, [cases]);

  const cutInMap = useMemo(() => {
    const m = new Map<string, number>();
    cases.forEach(c => m.set(c.id, c.maxSafeTemp ?? 8));
    return m;
  }, [cases]);

  const { timeColumns, caseIds, grid } = useMemo(() => {
    const caseIds = cases.map(c => c.id);
    const [start, end] = dateRange;

    const hourlyByCase = new Map<string, Map<string, number[]>>();
    caseIds.forEach(id => hourlyByCase.set(id, new Map()));

    allData.forEach((readings, caseId) => {
      const hourMap = hourlyByCase.get(caseId);
      if (!hourMap) return;
      readings.forEach(r => {
        if (r.time < start || r.time > end || r.controlTemp === null) return;
        const hk = hourKey(r.time);
        if (!hourMap.has(hk)) hourMap.set(hk, []);
        hourMap.get(hk)!.push(r.controlTemp);
      });
    });

    const allHours = new Set<string>();
    hourlyByCase.forEach(m => m.forEach((_, k) => allHours.add(k)));

    caseIds.forEach(caseId => {
      const caseAlarmHours = alarmIndex.get(caseId);
      caseAlarmHours?.forEach((entries, hk) => {
        if (entries.some(entry => entry.occurred >= start && entry.occurred <= end)) {
          allHours.add(hk);
        }
      });
    });

    const timeColumns = Array.from(allHours).sort().reverse();
    const grid = new Map<string, Map<string, number | null>>();

    caseIds.forEach(id => {
      const row = new Map<string, number | null>();
      const hourMap = hourlyByCase.get(id)!;
      timeColumns.forEach(hk => {
        const temps = hourMap.get(hk);
        row.set(hk, temps && temps.length > 0 ? +(temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1) : null);
      });
      grid.set(id, row);
    });

    if (timeColumns.length > 0) {
      console.log('[HourlyTable] timeColumns range:', timeColumns[0], '→', timeColumns[timeColumns.length - 1], '(', timeColumns.length, 'columns)');
      console.log('[HourlyTable] dateRange:', dateRange[0].toISOString(), '→', dateRange[1].toISOString());
    }

    return { timeColumns, caseIds, grid };
  }, [allData, dateRange, cases, alarmIndex]);

  useImperativeHandle(ref, () => ({
    getExportData: () => {
      return caseIds.map(id => {
        const row: Record<string, any> = { 'Case': id };
        const caseConfig = cases.find(c => c.id === id);
        if (caseConfig?.label) row['Label'] = caseConfig.label;
        row['Cut-in °C'] = cutInMap.get(id) ?? 8;
        timeColumns.forEach(hk => {
          const val = grid.get(id)?.get(hk) ?? null;
          row[formatHour(hk)] = val !== null ? val : '';
        });
        return row;
      });
    }
  }), [caseIds, timeColumns, grid, cases, cutInMap]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (timeColumns.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">No data available for this period</p>;
  }

  return (
    <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
      <table className="text-sm">
        <thead className="sticky top-0 bg-card z-10">
          <tr className="border-b border-border">
            <th className="text-left py-2.5 px-4 text-muted-foreground font-medium text-xs sticky left-0 bg-card z-20 min-w-[180px]">
              Case
            </th>
            {timeColumns.map(hk => (
              <th key={hk} className="text-center py-2.5 px-2 text-muted-foreground font-medium text-[10px] whitespace-nowrap min-w-[60px]">
                {formatHour(hk)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {caseIds.map(id => {
            const cutIn = cutInMap.get(id) ?? 8;
            const row = grid.get(id);
            return (
              <tr
                key={id}
                onClick={onCaseClick ? () => onCaseClick(id) : undefined}
                className={`border-b border-border/40 hover:bg-muted/40 transition-colors ${onCaseClick ? 'cursor-pointer' : ''}`}
              >
                <td className="py-1.5 px-4 font-medium text-xs text-foreground whitespace-nowrap sticky left-0 bg-card z-10 min-w-[180px]">
                  {id}
                  {showLabels && (() => {
                    const caseConfig = cases.find(c => c.id === id);
                    const label = caseConfig?.label;
                    return label ? <span className="block text-[10px] text-muted-foreground font-normal truncate max-w-[160px]">{label}</span> : null;
                  })()}
                  <span className="block text-[10px] text-muted-foreground font-normal">Cut-in: {cutIn}°C</span>
                </td>
                {timeColumns.map(hk => {
                  const val = row?.get(hk) ?? null;
                  const exceeded = val !== null && val > cutIn;
                  const hkForAlarm = hk;
                  const cellAlarms = alarmIndex.get(id)?.get(hkForAlarm);
                  if (cellAlarms && cellAlarms.length > 0) {
                    console.log('[AlarmMatch]', id, hk, cellAlarms.length, 'alarms');
                  }
                  return (
                    <td
                      key={hk}
                      className={`text-center py-1.5 px-2 font-mono text-xs relative group/cell ${
                        exceeded
                          ? 'text-status-error bg-status-error/10 font-medium'
                          : val !== null
                          ? 'text-foreground'
                          : 'text-muted-foreground/40'
                      }`}
                    >
                      <span>{val !== null ? val : '—'}</span>
                      {cellAlarms && cellAlarms.length > 0 && (
                        <span className="inline-block ml-0.5 align-top">
                          <AlertTriangle size={12} className="text-amber-500 inline-block" />
                          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover/cell:block z-30 w-48 p-2 rounded-md border border-border bg-popover text-popover-foreground shadow-md text-[10px] text-left font-sans whitespace-normal">
                            {cellAlarms.map((a, i) => (
                              <span key={i} className="block mb-1 last:mb-0">
                                <span className="font-semibold">{a.alarm}</span>
                                <span className="block text-muted-foreground">
                                  {a.accepted ? `Accepted: ${a.accepted.toLocaleString('en-GB')}` : 'Not accepted'}
                                  {a.cleared ? ` · Cleared: ${a.cleared.toLocaleString('en-GB')}` : ' · Not cleared'}
                                </span>
                              </span>
                            ))}
                          </span>
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});
