import { type ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  unit?: string;
  icon: ReactNode;
  trend?: 'ok' | 'warn' | 'error';
  delay?: number;
}

export function StatCard({ label, value, unit, icon, trend = 'ok', delay = 0 }: StatCardProps) {
  const trendColors = {
    ok: 'text-status-ok',
    warn: 'text-status-warn',
    error: 'text-status-error',
  };

  return (
    <div
      className="stat-card opacity-0 animate-fade-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-muted-foreground text-sm font-medium">{label}</span>
        <span className={`${trendColors[trend]} opacity-70`}>{icon}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`text-2xl font-semibold font-mono tracking-tight ${trendColors[trend]}`}>
          {value}
        </span>
        {unit && <span className="text-muted-foreground text-sm">{unit}</span>}
      </div>
    </div>
  );
}
