/**
 * Without this, a drag over a gap between the invisible words, or over a clickable move, selects
 * everything to the end of the page, as the browser takes that place to be past the last word. So
 * clickable things let the pointer through during a drag, and an empty block kept just after the word
 * being reached fills the gaps, as in pdf.js's own viewer.
 */
export function keepSelectionWherePointed(layer: HTMLElement): () => void {
  const endOf = () => layer.querySelector<HTMLElement>(':scope > .endOfContent');
  let previous: Range | null = null;

  const setSelecting = (isSelecting: boolean) => {
    layer.classList.toggle('selecting', isSelecting);
    layer.parentElement?.classList.toggle('selecting-text', isSelecting);
  };
  const onPointerDown = () => setSelecting(true);

  const reset = () => {
    setSelecting(false);
    previous = null;
    const end = endOf();
    if (!end) return;
    end.style.removeProperty('user-select');
    layer.append(end);
  };

  const onSelectionChange = () => {
    const selection = document.getSelection();
    if (!layer.classList.contains('selecting') || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!layer.contains(range.commonAncestorContainer)) return;
    const end = endOf();
    if (!end) return;

    // The end that has just moved is the one under the pointer.
    const isStartMoving = previous !== null && (range.compareBoundaryPoints(Range.END_TO_END, previous) === 0 || range.compareBoundaryPoints(Range.START_TO_END, previous) === 0);
    let reached: Node | null = isStartMoving ? range.startContainer : range.endContainer;
    if (reached.nodeType === Node.TEXT_NODE) reached = reached.parentNode;
    if (!isStartMoving && range.endOffset === 0 && reached) {
      // The selection stops just before this word, so what it reached is the one before.
      while (reached && !reached.previousSibling && reached !== layer) reached = reached.parentNode;
      reached = reached && reached !== layer ? reached.previousSibling : null;
      while (reached?.lastChild) reached = reached.lastChild;
      if (reached?.nodeType === Node.TEXT_NODE) reached = reached.parentNode;
    }
    const parent = reached?.parentElement;
    if (reached && parent && layer.contains(parent) && reached !== end) {
      end.style.userSelect = 'text';
      parent.insertBefore(end, isStartMoving ? reached : reached.nextSibling);
    }
    previous = range.cloneRange();
  };

  layer.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('pointerup', reset);
  window.addEventListener('blur', reset);
  document.addEventListener('selectionchange', onSelectionChange);
  return () => {
    layer.removeEventListener('pointerdown', onPointerDown);
    document.removeEventListener('pointerup', reset);
    window.removeEventListener('blur', reset);
    document.removeEventListener('selectionchange', onSelectionChange);
  };
}
