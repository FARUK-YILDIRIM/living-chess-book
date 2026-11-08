export interface Offset {
  x: number;
  y: number;
}

export interface Edges {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const within = (value: number, lowest: number, highest: number) => Math.max(lowest, Math.min(value, highest));

/**
 * The nearest offset to `wanted` that leaves a floating window inside `bounds`. `box` is where it is
 * now, at offset `current`. A window too big for them keeps its top left corner in view, as that is
 * where its title bar and the way to move it are.
 */
export function keepInside(wanted: Offset, current: Offset, box: Edges, bounds: Edges): Offset {
  const homeLeft = box.left - current.x;
  const homeTop = box.top - current.y;
  const homeRight = box.right - current.x;
  const homeBottom = box.bottom - current.y;
  return {
    x: within(wanted.x, bounds.left - homeLeft, bounds.right - homeRight),
    y: within(wanted.y, bounds.top - homeTop, bounds.bottom - homeBottom),
  };
}
