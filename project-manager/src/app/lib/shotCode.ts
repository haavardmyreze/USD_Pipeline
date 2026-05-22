/** Studio shot codes: <sequence>-<####> (e.g. kine-0010). Legacy underscore form still accepted. */
const SHOT_CODE_RE = /^([a-z0-9]+)[_-](\d{4})$/i;

export interface ParsedShotCode {
  sequence: string;
  shotNumber: number;
}

export function parseShotCode(shotName: string): ParsedShotCode | null {
  const trimmed = shotName?.trim();
  if (!trimmed) return null;
  const match = trimmed.match(SHOT_CODE_RE);
  if (!match) return null;
  return {
    sequence: match[1].toLowerCase(),
    shotNumber: parseInt(match[2], 10),
  };
}

export function getShotSequence(shotName: string): string {
  return parseShotCode(shotName)?.sequence ?? 'misc';
}

export function compareShotCodes(a: string, b: string): number {
  const left = parseShotCode(a);
  const right = parseShotCode(b);
  if (left && right) {
    const bySequence = left.sequence.localeCompare(right.sequence);
    if (bySequence !== 0) return bySequence;
    return left.shotNumber - right.shotNumber;
  }
  return a.localeCompare(b);
}
