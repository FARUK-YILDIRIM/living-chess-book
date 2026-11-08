/** Builds a FEN placement field from 64 labels, a8 first. `.` is an empty square. */
export function placementFromLabels(labels: readonly string[]): string {
  const ranks: string[] = [];
  for (let rank = 0; rank < 8; rank++) {
    let text = '';
    let empty = 0;
    for (let file = 0; file < 8; file++) {
      const label = labels[rank * 8 + file]!;
      if (label === '.') {
        empty++;
      } else {
        if (empty) text += empty;
        empty = 0;
        text += label;
      }
    }
    if (empty) text += empty;
    ranks.push(text);
  }
  return ranks.join('/');
}

/**
 * The 64 labels of a placement, a8 first, for editing it. A misread placement may have too many or too
 * few squares, so a rank is cut or filled out to eight, and missing ranks are empty.
 */
export function labelsFromPlacement(placement: string): string[] {
  const labels: string[] = [];
  const ranks = placement.split('/');
  for (let rank = 0; rank < 8; rank++) {
    const squares: string[] = [];
    for (const char of ranks[rank] ?? '') {
      if (/\d/.test(char)) squares.push(...Array<string>(Number(char)).fill('.'));
      else squares.push(char);
    }
    for (let file = 0; file < 8; file++) labels.push(squares[file] ?? '.');
  }
  return labels;
}

/** Lists the reasons a placement cannot come from a real game or study. */
export function checkPlacement(placement: string): string[] {
  const issues: string[] = [];
  const count = (piece: string) => placement.split(piece).length - 1;

  const shape = placement.split('/');
  if (shape.length !== 8) issues.push('a position needs 8 ranks');
  shape.forEach((rank, index) => {
    const squares = [...rank].reduce((sum, char) => sum + (/\d/.test(char) ? Number(char) : 1), 0);
    if (squares !== 8) issues.push(`rank ${8 - index} does not have 8 squares`);
  });

  if (count('K') !== 1) issues.push(`white king count is ${count('K')}`);
  if (count('k') !== 1) issues.push(`black king count is ${count('k')}`);
  if (count('P') > 8) issues.push('more than 8 white pawns');
  if (count('p') > 8) issues.push('more than 8 black pawns');

  const ranks = placement.split('/');
  if (/[pP]/.test(ranks[0] ?? '') || /[pP]/.test(ranks[7] ?? '')) {
    issues.push('pawn on the first or last rank');
  }
  return issues;
}
