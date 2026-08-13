import { getDailySummary, type RefrigerationReading } from '@/lib/refrigeration/parse';
import { useMemo } from 'react';
import { Download } from 'lucide-react';
import { exportToExcel } from '@/lib/refrigeration/export-excel';

interface Props {
  readings: RefrigerationReading[];
  dateRange: [Date, Date];
}

export function DailySummaryTable({ readings, dateRange }: Props) {
  const summary = useMemo(() => {
    const filtered = readings.filter(r => r.time >= dateRange[0] && r.time <= dateRange[1]);
    return getDailySummary(filtered);
  }, [readings, dateRange]);

  const handleExport = () => {
    const data = summary.map(day => ({
      'Date': new Date(day.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      'Min °C': day.min?.toFixed(1) ?? '',
      'Avg °C': day.avg ?? '',
      'Max °C': day.max?.toFixed(1) ?? '',
      'Faults': day.faultCount || '',
      'Readings': day.readingCount,
    }));
    exportToExcel(data, 'DailySummary');
  };

  return (
    <div className="stat-card opacity-0 animate-fade-up overflow-hidden" style={{ animationDelay: '400ms' }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">Daily Summary</h3>
        <button
          onClick={handleExport}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground rounded-md hover:bg-secondary transition-colors active:scale-[0.97]"
          title="Export to Excel"
        >
          <Download size={13} />
          Export
        </button>
      </div>
      <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card z-10">
            <tr className="border-b border-border">
              <th className="text-left py-2.5 px-3 text-muted-foreground font-medium">Date</th>
              <th className="text-right py-2.5 px-3 text-muted-foreground font-medium">Min °C</th>
              <th className="text-right py-2.5 px-3 text-muted-foreground font-medium">Avg °C</th>
              <th className="text-right py-2.5 px-3 text-muted-foreground font-medium">Max °C</th>
              <th className="text-right py-2.5 px-3 text-muted-foreground font-medium">Faults</th>
              <th className="text-right py-2.5 px-3 text-muted-foreground font-medium">Readings</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((day) => {
              const isHigh = day.max !== null && day.max > 8;
              return (
                <tr key={day.date} className="border-b border-border/40 hover:bg-muted/40 transition-colors">
                  <td className="py-2 px-3 font-mono text-xs">
                    {new Date(day.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="text-right py-2 px-3 font-mono text-xs">{day.min?.toFixed(1) ?? '—'}</td>
                  <td className="text-right py-2 px-3 font-mono text-xs">{day.avg ?? '—'}</td>
                  <td className={`text-right py-2 px-3 font-mono text-xs font-medium ${isHigh ? 'text-status-error' : ''}`}>
                    {day.max?.toFixed(1) ?? '—'}
                  </td>
                  <td className={`text-right py-2 px-3 font-mono text-xs ${day.faultCount > 0 ? 'text-status-error font-medium' : 'text-muted-foreground'}`}>
                    {day.faultCount || '—'}
                  </td>
                  <td className="text-right py-2 px-3 font-mono text-xs text-muted-foreground">{day.readingCount}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
