export type SourceLine = { number: number; text: string; changed: boolean };

/** Preserve blank source lines; a final newline terminates a line, rather than adding one. */
export function numberedSource(source: string): SourceLine[] {
  if (!source) return [];
  const lines = source.split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines.map((text, index) => ({ number: index + 1, text, changed: false }));
}

/** A line comparison for the included, small captured artifact; never runs submitted code. */
export function compareCapturedSource(before: string, after: string) {
  const original = numberedSource(before);
  const patched = numberedSource(after);
  const common = Array.from({ length: original.length + 1 }, () => new Uint16Array(patched.length + 1));
  for (let i = original.length - 1; i >= 0; i--) {
    for (let j = patched.length - 1; j >= 0; j--) {
      common[i][j] = original[i].text === patched[j].text
        ? common[i + 1][j + 1] + 1
        : Math.max(common[i + 1][j], common[i][j + 1]);
    }
  }
  let i = 0, j = 0;
  while (i < original.length || j < patched.length) {
    if (i < original.length && j < patched.length && original[i].text === patched[j].text) {
      i++; j++;
    } else if (j < patched.length && (i === original.length || common[i][j + 1] >= common[i + 1][j])) {
      patched[j++].changed = true;
    } else {
      original[i++].changed = true;
    }
  }
  return { before: original, after: patched };
}

/** Automatic tab activation is safe here: all evidence panels are already mounted. */
export function inspectionTabDestination(key: string, current: number, count: number): number | null {
  if (count < 1) return null;
  if (key === "ArrowRight") return (current + 1) % count;
  if (key === "ArrowLeft") return (current + count - 1) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}
