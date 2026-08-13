import { useMemo, useState, useRef, useEffect } from 'react';
import { ChevronDown, Calendar } from 'lucide-react';

interface Props {
  dateRange: [Date, Date];
  onDateRangeChange: (range: [Date, Date]) => void;
  minDate: Date;
  maxDate: Date;
}

export function DateRangePicker({ dateRange, onDateRangeChange, minDate, maxDate }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const presets = useMemo(() => {
    const end = maxDate;
    return [
      { label: 'Last 24 hours', range: [new Date(end.getTime() - 86400000), end] as [Date, Date] },
      { label: 'Last 7 days', range: [new Date(end.getTime() - 7 * 86400000), end] as [Date, Date] },
      { label: 'Last 30 days', range: [new Date(end.getTime() - 30 * 86400000), end] as [Date, Date] },
      { label: 'Last 60 days', range: [new Date(end.getTime() - 60 * 86400000), end] as [Date, Date] },
    ];
  }, [maxDate]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const activePreset = presets.find(p =>
    Math.abs(dateRange[0].getTime() - p.range[0].getTime()) < 86400000 &&
    Math.abs(dateRange[1].getTime() - p.range[1].getTime()) < 86400000
  );

  const formatDate = (d: Date) => d.toISOString().slice(0, 10);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen(o => !o)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-all duration-150 active:scale-[0.97] border border-border"
        >
          <Calendar size={12} className="opacity-70" />
          {activePreset ? activePreset.label : 'Custom range'}
          <ChevronDown size={12} className={`opacity-60 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <div className="absolute top-full left-0 mt-1.5 w-48 bg-card border border-border rounded-lg shadow-lg overflow-hidden z-30 animate-in fade-in slide-in-from-top-1 duration-150">
            {presets.map(p => {
              const isActive = activePreset?.label === p.label;
              return (
                <button
                  key={p.label}
                  onClick={() => { onDateRangeChange(p.range); setOpen(false); }}
                  className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                    isActive
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-foreground hover:bg-secondary'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          value={formatDate(dateRange[0])}
          min={formatDate(minDate)}
          max={formatDate(maxDate)}
          onChange={e => onDateRangeChange([new Date(e.target.value), dateRange[1]])}
          className="px-2 py-1.5 text-xs bg-secondary border border-border rounded-md font-mono focus:outline-none focus:ring-2 focus:ring-ring text-foreground"
        />
        <span className="text-muted-foreground text-xs">→</span>
        <input
          type="date"
          value={formatDate(dateRange[1])}
          min={formatDate(minDate)}
          max={formatDate(maxDate)}
          onChange={e => onDateRangeChange([dateRange[0], new Date(e.target.value)])}
          className="px-2 py-1.5 text-xs bg-secondary border border-border rounded-md font-mono focus:outline-none focus:ring-2 focus:ring-ring text-foreground"
        />
      </div>
    </div>
  );
}
