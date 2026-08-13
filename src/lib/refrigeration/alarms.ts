export interface AlarmEntry {
  serial: number;
  controller: string;
  description: string;
  alarm: string;
  occurred: Date;
  accepted: Date | null;
  acceptedBy: string;
  cleared: Date | null;
}

function parseAlarmDate(val: string): Date | null {
  if (!val || !val.trim()) return null;
  const [datePart, timePart] = val.trim().split(' ');
  if (!datePart || !timePart) return null;
  const [d, m, y] = datePart.split('/');
  const [h, min, s] = timePart.split(':');
  return new Date(2000 + parseInt(y), parseInt(m) - 1, parseInt(d), parseInt(h), parseInt(min), parseInt(s));
}

export function parseAlarmCSV(text: string): AlarmEntry[] {
  const lines = text.split('\n');
  if (lines.length < 2) return [];

  const alarms: AlarmEntry[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(',');
    if (cols.length < 8) continue;
    const occurred = parseAlarmDate(cols[4]);
    if (!occurred) continue;
    alarms.push({
      serial: parseInt(cols[0]) || 0,
      controller: cols[1]?.trim() || '',
      description: cols[2]?.trim() || '',
      alarm: cols[3]?.trim() || '',
      occurred,
      accepted: parseAlarmDate(cols[5]),
      acceptedBy: cols[6]?.trim() || '',
      cleared: parseAlarmDate(cols[7]),
    });
  }
  return alarms;
}

export function hourKeyFromDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}`;
}

/** Build a map of caseId -> hourKey -> AlarmEntry[] */
export function buildAlarmIndex(alarms: AlarmEntry[]): Map<string, Map<string, AlarmEntry[]>> {
  const index = new Map<string, Map<string, AlarmEntry[]>>();
  for (const a of alarms) {
    const caseId = a.controller;
    if (!index.has(caseId)) index.set(caseId, new Map());
    const hourMap = index.get(caseId)!;
    const hk = hourKeyFromDate(a.occurred);
    if (!hourMap.has(hk)) hourMap.set(hk, []);
    hourMap.get(hk)!.push(a);
  }
  return index;
}
