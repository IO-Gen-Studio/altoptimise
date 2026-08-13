export interface RefrigerationReading {
  time: Date;
  controlTemp: number | null;
  displayTemp: number | null;
  airOnTemp: number | null;
  airOffTemp: number | null;
  loggingTemp: number | null;
  alarmTemp: number | null;
  plantFault1: string;
  plantFault2: string;
  plantFault3: string;
  caseClean: string;
  controlState: string;
  lastDefTime: string;
  lastDefLength: string;
  lastDefTemp: number | null;
  lastDefType: string;
}

export interface SiteInfo {
  name: string;
  location: string;
  postcode: string;
  controller: string;
  controllerDescription: string;
}

function parseNum(val: string): number | null {
  if (!val || val.includes('?')) return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

function parseDate(val: string): Date {
  // DD/MM/YY HH:MM:SS
  const [datePart, timePart] = val.split(' ');
  const [d, m, y] = datePart.split('/');
  const [h, min, s] = timePart.split(':');
  return new Date(2000 + parseInt(y), parseInt(m) - 1, parseInt(d), parseInt(h), parseInt(min), parseInt(s));
}

export function parseRefrigerationCSV(text: string): { site: SiteInfo; readings: RefrigerationReading[] } {
  const lines = text.split('\n');

  // Find Controller and Controller description lines dynamically
  let controllerVal = '';
  let controllerDescVal = '';
  let dataStartIndex = -1;
  let headerLine = '';

  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    const line = lines[i].trim();
    if (line.startsWith('Controller description:')) {
      controllerDescVal = line.replace('Controller description:', '').replace(/^\t+/, '').trim();
    } else if (line.startsWith('Controller:')) {
      controllerVal = line.replace('Controller:', '').trim();
    }
    if (line.startsWith('Time,')) {
      headerLine = line;
      dataStartIndex = i + 1;
    }
  }

  if (dataStartIndex === -1) dataStartIndex = 13;

  // Build column index map from header
  const headerCols = headerLine.split(',').map(h => h.trim().toLowerCase());
  const colIndex = (name: string): number => {
    const idx = headerCols.findIndex(h => h.startsWith(name));
    return idx >= 0 ? idx : -1;
  };

  const controlStateIdx = colIndex('control state');
  const lastDefTimeIdx = colIndex('last def. time');
  const lastDefLengthIdx = colIndex('last def. length');
  const lastDefTempIdx = colIndex('last def. temp');
  const lastDefTypeIdx = colIndex('last def. type');

  const site: SiteInfo = {
    name: lines[1]?.trim() || '',
    location: `${lines[3]?.trim() || ''}, ${lines[4]?.trim() || ''}`.replace(/^, |, $/g, ''),
    postcode: lines[5]?.trim() || '',
    controller: controllerVal,
    controllerDescription: controllerDescVal,
  };

  const readings: RefrigerationReading[] = [];
  for (let i = dataStartIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(',');
    if (cols.length < 10) continue;

    try {
      readings.push({
        time: parseDate(cols[0]),
        controlTemp: parseNum(cols[1]),
        displayTemp: parseNum(cols[2]),
        airOnTemp: parseNum(cols[3]),
        airOffTemp: parseNum(cols[4]),
        loggingTemp: parseNum(cols[9]),
        alarmTemp: parseNum(cols[10]),
        plantFault1: cols[11] || '',
        plantFault2: cols[12] || '',
        plantFault3: cols[13] || '',
        caseClean: cols[14] || '',
        controlState: controlStateIdx >= 0 ? (cols[controlStateIdx] || '') : (cols[cols.length - 1] || ''),
        lastDefTime: lastDefTimeIdx >= 0 ? (cols[lastDefTimeIdx] || '') : (cols[25] || ''),
        lastDefLength: lastDefLengthIdx >= 0 ? (cols[lastDefLengthIdx] || '') : (cols[26] || ''),
        lastDefTemp: lastDefTempIdx >= 0 ? parseNum(cols[lastDefTempIdx]) : parseNum(cols[27]),
        lastDefType: lastDefTypeIdx >= 0 ? (cols[lastDefTypeIdx] || '') : (cols[28] || ''),
      });
    } catch {
      // skip malformed rows
    }
  }

  return { site, readings };
}

/**
 * Merge two CSV texts: keeps all data from oldText, overlays newText on top.
 * For timestamps that exist in both, new data wins.
 * Returns merged CSV text with the header from newText.
 */
export function mergeCSVTexts(oldText: string, newText: string): string {
  const extractParts = (text: string) => {
    const lines = text.split('\n');
    let dataStartIndex = -1;
    const headerLines: string[] = [];

    for (let i = 0; i < Math.min(lines.length, 30); i++) {
      const line = lines[i].trim();
      if (line.startsWith('Time,')) {
        dataStartIndex = i + 1;
        // Header includes everything up to and including the Time, line
        for (let j = 0; j <= i; j++) headerLines.push(lines[j]);
        break;
      }
    }

    if (dataStartIndex === -1) {
      dataStartIndex = 13;
      for (let j = 0; j < dataStartIndex && j < lines.length; j++) headerLines.push(lines[j]);
    }

    const dataLines: string[] = [];
    for (let i = dataStartIndex; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line && line.split(',').length >= 10) dataLines.push(line);
    }

    return { headerLines, dataLines };
  };

  const oldParts = extractParts(oldText);
  const newParts = extractParts(newText);

  // Build a map keyed by timestamp string (first column) → full data line
  // Old data first, then new data overwrites on collision
  const mergedMap = new Map<string, string>();

  for (const line of oldParts.dataLines) {
    const timeKey = line.split(',')[0];
    if (timeKey) mergedMap.set(timeKey, line);
  }

  for (const line of newParts.dataLines) {
    const timeKey = line.split(',')[0];
    if (timeKey) mergedMap.set(timeKey, line);
  }

  // Sort by timestamp string (DD/MM/YY HH:MM:SS)
  const sortedLines = Array.from(mergedMap.entries())
    .sort((a, b) => {
      try {
        const parseTs = (v: string) => {
          const [datePart, timePart] = v.split(' ');
          const [d, m, y] = datePart.split('/');
          const [h, min, s] = timePart.split(':');
          return new Date(2000 + parseInt(y), parseInt(m) - 1, parseInt(d), parseInt(h), parseInt(min), parseInt(s)).getTime();
        };
        return parseTs(a[0]) - parseTs(b[0]);
      } catch { return 0; }
    })
    .map(([, line]) => line);

  // Use header from new file
  return [...newParts.headerLines, ...sortedLines].join('\n');
}

export function getDailySummary(readings: RefrigerationReading[]) {
  const byDay = new Map<string, RefrigerationReading[]>();

  for (const r of readings) {
    const key = r.time.toISOString().slice(0, 10);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(r);
  }

  return Array.from(byDay.entries()).map(([date, dayReadings]) => {
    const temps = dayReadings.map(r => r.controlTemp).filter((t): t is number => t !== null);
    const alarms = dayReadings.map(r => r.alarmTemp).filter((t): t is number => t !== null);
    const faults = dayReadings.filter(r => r.plantFault1 !== 'OK' || r.plantFault2 !== 'OK' || r.plantFault3 !== 'OK');

    return {
      date,
      min: temps.length ? Math.min(...temps) : null,
      max: temps.length ? Math.max(...temps) : null,
      avg: temps.length ? +(temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1) : null,
      alarmMin: alarms.length ? Math.min(...alarms) : null,
      alarmMax: alarms.length ? Math.max(...alarms) : null,
      faultCount: faults.length,
      readingCount: dayReadings.length,
    };
  });
}
