// Best scores on this device (FR-023). Stored data is input like any other: everything read
// back is checked field by field against an allowlist, and anything else is dropped
// (SEC-11, SEC-12).

export interface ScoreEntry {
  score: number;
  /** Time survived, in simulation steps. */
  steps: number;
  seed: string;
}

export const SEED_PATTERN = /^[A-Za-z0-9-]{1,24}$/;
export const SCORES_KEY = "backbone.scores.v1";
const KEEP = 5;

const whole = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 1e9;

/** Keeps only well-formed entries. */
export function validScores(raw: unknown): ScoreEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: ScoreEntry[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const { score, steps, seed } = item as Record<string, unknown>;
    if (whole(score) && whole(steps) && typeof seed === "string" && SEED_PATTERN.test(seed)) out.push({ score, steps, seed });
  }
  return out;
}

/** Sorted by score, then by time survived (R12); the best five. */
export function rank(entries: ScoreEntry[]): ScoreEntry[] {
  return [...entries].sort((p, q) => q.score - p.score || q.steps - p.steps).slice(0, KEEP);
}

/** The browser's storage, or null when the device refuses it. */
export function openStorage(): Storage | null {
  try {
    const store = window.localStorage;
    const probe = "backbone.probe";
    store.setItem(probe, "1");
    store.removeItem(probe);
    return store;
  } catch {
    return null;
  }
}

export function loadScores(store: Pick<Storage, "getItem"> | null): ScoreEntry[] {
  if (!store) return [];
  try {
    return rank(validScores(JSON.parse(store.getItem(SCORES_KEY) ?? "[]")));
  } catch {
    return [];
  }
}

/** Adds a score and returns the new table. `saved` is false when the device refused. */
export function saveScore(store: Pick<Storage, "getItem" | "setItem"> | null, entry: ScoreEntry): { entries: ScoreEntry[]; saved: boolean } {
  const entries = rank([...loadScores(store), ...validScores([entry])]);
  if (!store) return { entries, saved: false };
  try {
    store.setItem(SCORES_KEY, JSON.stringify(entries));
    return { entries, saved: true };
  } catch {
    return { entries, saved: false };
  }
}
