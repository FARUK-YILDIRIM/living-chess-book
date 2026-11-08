import type { BookOverlay, MoveNode } from '../src/core/types';

/** Compares an overlay's main lines with hand-checked ones, and gives aggregate numbers only. */
export function scoreLines(overlay: BookOverlay, truth: Record<string, string[]>) {
  const children = new Map<string | null, MoveNode[]>();
  for (const move of overlay.moves) {
    if (!move.isMainLine) continue;
    const list = children.get(move.parentId) ?? [];
    list.push(move);
    children.set(move.parentId, list);
  }

  const lineFrom = (root: MoveNode): MoveNode[] => {
    const line = [root];
    for (let next = children.get(root.id)?.[0]; next; next = children.get(next.id)?.[0]) line.push(next);
    return line;
  };

  let total = 0;
  let correct = 0;
  let flagged = 0;
  let silentlyWrong = 0;
  let missing = 0;
  let linesPerfect = 0;
  let linesFound = 0;

  for (const [label, expected] of Object.entries(truth)) {
    total += expected.length;
    const diagramIds = new Set(overlay.diagrams.filter((d) => d.label === label).map((d) => d.id));
    const roots = (children.get(null) ?? []).filter((m) => m.diagramId && diagramIds.has(m.diagramId));

    // A diagram can have several stretches of moves. Score the one closest to the truth.
    let best: { matched: MoveNode[]; wrong: MoveNode[] } | null = null;
    for (const root of roots) {
      const line = lineFrom(root);
      const matched: MoveNode[] = [];
      const used = new Set<number>();
      let cursor = 0;
      for (const san of expected) {
        const found = line.findIndex((m, i) => i >= cursor && !used.has(i) && m.san.replace(/[+#]/g, '') === san.replace(/[+#]/g, ''));
        if (found >= 0) {
          matched.push(line[found]!);
          used.add(found);
          cursor = found + 1;
        }
      }
      const wrong = line.filter((_, i) => !used.has(i));
      if (!best || matched.length > best.matched.length) best = { matched, wrong };
    }

    if (!best) {
      missing += expected.length;
      continue;
    }
    linesFound++;
    correct += best.matched.length;
    missing += expected.length - best.matched.length;
    for (const move of best.wrong) {
      if (move.confidence === 'low') flagged++;
      else silentlyWrong++;
    }
    if (best.matched.length === expected.length && !best.wrong.length) linesPerfect++;
  }

  return {
    truthLines: Object.keys(truth).length,
    linesFound,
    linesPerfect,
    truthMoves: total,
    correctMoves: correct,
    correctPercent: Number(((100 * correct) / Math.max(total, 1)).toFixed(1)),
    missingMoves: missing,
    wrongButFlagged: flagged,
    silentlyWrong,
  };
}
