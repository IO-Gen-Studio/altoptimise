const STOP = new Set([
  "room",
  "rooms",
  "zone",
  "the",
  "and",
  "of",
  "area",
  "meter",
  "supply",
  "circuit",
  "sub",
  "no",
  "l1",
  "l2",
  "l3",
]);

/** Lower-cases, strips punctuation and boilerplate words, returns comparable tokens. */
export function tokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t && !STOP.has(t));
}

export function normalise(name: string): string {
  return tokens(name).join(" ");
}

function bigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}

/** 0..1 similarity blending token overlap with character bigram overlap. */
export function similarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return 0;
  const setA = new Set(ta);
  const setB = new Set(tb);
  let inter = 0;
  for (const t of setA) if (setB.has(t)) inter += 1;
  const tokenScore = (2 * inter) / (setA.size + setB.size);

  const sa = bigrams(ta.join(""));
  const sb = bigrams(tb.join(""));
  let bInter = 0;
  for (const g of sa) if (sb.has(g)) bInter += 1;
  const charScore = sa.size + sb.size ? (2 * bInter) / (sa.size + sb.size) : 0;

  return Number((tokenScore * 0.65 + charScore * 0.35).toFixed(4));
}

export interface RoomSuggestion {
  room: string;
  circuit: string | null;
  confidence: number;
}

/** Confident enough to apply without asking. */
export const AUTO_MATCH_THRESHOLD = 0.72;
/** Worth offering as a suggestion. */
export const SUGGEST_THRESHOLD = 0.42;

export function suggestMatches(rooms: string[], circuits: string[]): RoomSuggestion[] {
  return rooms.map((room) => {
    let best: { circuit: string; score: number } | null = null;
    for (const circuit of circuits) {
      const score = similarity(room, circuit);
      if (!best || score > best.score) best = { circuit, score };
    }
    return best && best.score >= SUGGEST_THRESHOLD
      ? { room, circuit: best.circuit, confidence: best.score }
      : { room, circuit: null, confidence: 0 };
  });
}
