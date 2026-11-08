import { TextLayer, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist';
import { useCallback, useEffect, useRef, useState } from 'react';
import { coverBoxes } from '../core/guess';
import { boxesFromRects } from '../core/selection';
import type { BookOverlay, Box } from '../core/types';
import { useI18n } from './I18nContext';
import { keepSelectionWherePointed } from './textSelection';

const SELECTION_MENU_WIDTH = 140;
const SELECTION_MENU_GAP = 46;

interface PageViewProps {
  pdf: PDFDocumentProxy;
  overlay: BookOverlay;
  page: number;
  currentMoveId: string | null;
  currentDiagramId: string | null;
  showSideLines: boolean;
  notedMoveIds: ReadonlySet<string>;
  /** Moves still to come, covered while the reader tries to find them. */
  hiddenMoveIds: ReadonlySet<string>;
  /** Places the reader marked on this page. */
  highlights: readonly Box[];
  /** Covers the whole page, while its words would give an answer away. */
  isCovered: boolean;
  /** Keeps what follows this place out of sight, while the reader works it out. */
  coverFrom: Box | null;
  /** The diagrams the reader has solved, marked on the page. */
  solvedDiagramIds: ReadonlySet<string>;
  /** Offers to solve this diagram, if it is on the page. */
  solvableDiagramId: string | null;
  onSolve: () => void;
  /** The place being checked, if it is on this page. */
  markedBox: Box | null;
  /** How much larger than the width of its column to draw the page, or the whole page in view. */
  zoom: number | 'fit';
  onSelectionNote: (text: string, boxes: Box[]) => void;
  onSelectionExplain: (text: string, boxes: Box[]) => void;
  onMove: (moveId: string) => void;
  onDiagram: (diagramId: string) => void;
}

interface Size {
  width: number;
  height: number;
  scale: number;
}

/** The book's own page, with clickable regions over its moves and diagrams. */
export function PageView(props: PageViewProps) {
  const { pdf, overlay, page, currentMoveId, currentDiagramId, showSideLines, notedMoveIds, hiddenMoveIds, highlights, isCovered, coverFrom, solvedDiagramIds, solvableDiagramId, onSolve, markedBox, zoom, onSelectionNote, onSelectionExplain, onMove, onDiagram } = props;
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<{ text: string; boxes: Box[]; left: number; top: number } | null>(null);
  const [size, setSize] = useState<Size | null>(null);
  const [frameWidth, setFrameWidth] = useState(0);
  /** The height the page can have and still be seen whole, in the scrolling box around it. */
  const [roomHeight, setRoomHeight] = useState(0);

  useEffect(() => {
    const frame = frameRef.current;
    const room = frame?.parentElement;
    if (!frame || !room) return;
    const observer = new ResizeObserver(() => {
      setFrameWidth(Math.floor(frame.getBoundingClientRect().width));
      const padding = parseFloat(getComputedStyle(room).paddingTop) + parseFloat(getComputedStyle(room).paddingBottom);
      setRoomHeight(Math.floor(room.clientHeight - padding));
    });
    observer.observe(frame);
    observer.observe(room);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    return textRef.current ? keepSelectionWherePointed(textRef.current) : undefined;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !frameWidth) return;
    let cancelled = false;
    let task: RenderTask | null = null;
    let textLayer: TextLayer | null = null;

    void pdf.getPage(page + 1).then((pdfPage) => {
      if (cancelled) return;
      const base = pdfPage.getViewport({ scale: 1 });
      const scale = zoom === 'fit' ? Math.min(frameWidth / base.width, roomHeight > 0 ? roomHeight / base.height : Number.POSITIVE_INFINITY) : (frameWidth * zoom) / base.width;
      const pixelRatio = window.devicePixelRatio || 1;
      const viewport = pdfPage.getViewport({ scale: scale * pixelRatio });
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      canvas.style.width = `${Math.round(base.width * scale)}px`;
      canvas.style.height = `${Math.round(base.height * scale)}px`;
      setSize({ width: base.width * scale, height: base.height * scale, scale });
      // Until it is drawn an opaque canvas is black, which looks like a broken page.
      const context = canvas.getContext('2d', { alpha: false });
      if (context) {
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      task = pdfPage.render({ canvas, viewport });
      task.promise.catch(() => {
        // A newer render cancelled this one.
      });

      // Invisible words over the picture of the page, so that they can be selected.
      const words = textRef.current;
      if (words) {
        words.replaceChildren();
        words.style.setProperty('--total-scale-factor', String(scale));
        textLayer = new TextLayer({
          textContentSource: pdfPage.streamTextContent({ includeMarkedContent: true, disableNormalization: true }),
          container: words,
          viewport: pdfPage.getViewport({ scale }),
        });
        textLayer.render().then(
          () => {
            if (cancelled) return;
            const end = document.createElement('div');
            end.className = 'endOfContent';
            words.append(end);
          },
          () => {
            // A newer page replaced this one, or the page has no words to select.
          },
        );
      }
    }).catch(() => {
      // The book was closed while this page was being fetched.
    });

    return () => {
      cancelled = true;
      task?.cancel();
      textLayer?.cancel();
      setSelection(null);
    };
  }, [pdf, page, frameWidth, zoom, zoom === 'fit' ? roomHeight : 0]);

  const place = (box: Box) =>
    size
      ? {
          left: box.x0 * size.scale,
          top: box.y0 * size.scale,
          width: (box.x1 - box.x0) * size.scale,
          height: (box.y1 - box.y0) * size.scale,
        }
      : undefined;

  // The words under a cover stay out of reach too: they could be copied, or sent to the coach.
  const isTextHidden = isCovered || Boolean(coverFrom);

  /** Offers what can be done with a selection, once the reader has let go. */
  const readSelection = useCallback((pointer?: { x: number; y: number }) => {
    const chosen = window.getSelection();
    const frame = pageRef.current;
    const text = chosen?.toString().trim();
    if (isTextHidden || !chosen || !frame || !size || !text || chosen.rangeCount === 0 || !textRef.current?.contains(chosen.anchorNode)) {
      setSelection(null);
      return;
    }
    const pageRect = frame.getBoundingClientRect();
    const range = chosen.getRangeAt(0);
    const boxes = boxesFromRects(Array.from(range.getClientRects()), pageRect, size.scale);
    const last = boxes[boxes.length - 1];
    if (!last) {
      setSelection(null);
      return;
    }
    // Where the reader let go, as the first box of a selection can be far from it. Keys have no pointer.
    const left = pointer ? pointer.x - pageRect.left - SELECTION_MENU_WIDTH / 2 : last.x0 * size.scale;
    const top = pointer ? pointer.y - pageRect.top - SELECTION_MENU_GAP : last.y0 * size.scale - SELECTION_MENU_GAP;
    setSelection({ text, boxes, left: Math.min(Math.max(0, left), Math.max(0, pageRect.width - SELECTION_MENU_WIDTH)), top: Math.max(0, top) });
  }, [size, isTextHidden]);

  const closeSelection = () => {
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  };

  // What the board has reached, or what is being checked, can be further down a long or enlarged page.
  useEffect(() => {
    pageRef.current?.querySelector('.review-mark, .hit.current')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [currentMoveId, currentDiagramId, markedBox, size]);

  const { t } = useI18n();
  // Under a cover nothing may be reached by keyboard or read out either.
  const masks = size && coverFrom && !isCovered ? coverBoxes(size.width / size.scale, size.height / size.scale, coverFrom) : [];
  const isMasked = (box: Box) => masks.some((mask) => box.x0 < mask.x1 && box.x1 > mask.x0 && box.y0 < mask.y1 && box.y1 > mask.y0);
  const moves = isCovered ? [] : overlay.moves.filter((m) => m.page === page && (showSideLines || m.isMainLine) && !isMasked(m.box));
  const diagrams = isCovered ? [] : overlay.diagrams.filter((d) => d.page === page && !isMasked(d.box));

  return (
    <div className="page-frame" ref={frameRef}>
      <div
        className="page"
        ref={pageRef}
        style={size ? { width: size.width, height: size.height } : undefined}
        onPointerUp={(event) => {
          const pointer = { x: event.clientX, y: event.clientY };
          setTimeout(() => readSelection(pointer));
        }}
        onKeyUp={(event) => {
          if (event.shiftKey) readSelection();
        }}
      >
        <canvas ref={canvasRef} />
        <div className={`textLayer${isTextHidden ? ' no-select' : ''}`} ref={textRef} aria-hidden={isTextHidden || undefined} />
        {highlights.map((box, index) => (
          <span key={index} className="note-mark" style={place(box)} />
        ))}
        {diagrams.map((d) => (
          <button
            key={d.id}
            type="button"
            className={`hit diagram${d.id === currentDiagramId ? ' current' : ''}${d.issues.length ? ' doubtful' : ''}${solvedDiagramIds.has(d.id) ? ' solved' : ''}`}
            style={place(d.box)}
            onClick={() => onDiagram(d.id)}
            title={t('Show this diagram on the board')}
            aria-label={d.label ? `${t('Show this diagram on the board')}: ${d.label}` : t('Show this diagram on the board')}
          />
        ))}
        {moves.map((m) =>
          hiddenMoveIds.has(m.id) ? (
            <span key={m.id} className="hit covered" style={place(m.box)} />
          ) : (
          <button
            key={m.id}
            type="button"
            className={`hit move${m.isMainLine ? '' : ' side'}${m.id === currentMoveId ? ' current' : ''}${m.confidence === 'low' ? ' doubtful' : ''}${notedMoveIds.has(m.id) ? ' noted' : ''}`}
            style={place(m.box)}
            onClick={() => onMove(m.id)}
            title={m.confidence === 'low' ? t('The app is unsure of this move. Show it on the board') : t('Show this move on the board')}
            aria-label={notedMoveIds.has(m.id) ? `${t('Play {san}', { san: m.san })}. ${t('You have a note on this move.')}` : t('Play {san}', { san: m.san })}
          />
          ),
        )}
        {markedBox && <span className="review-mark" style={place(markedBox)} />}
        {masks.map((box, index) => (
          <span key={index} className="page-mask" style={place(box)} />
        ))}
        {diagrams
          .filter((d) => d.id === solvableDiagramId)
          .map((d) => (
            <button key={d.id} type="button" className="solve-button" style={{ left: place(d.box)?.left, top: (place(d.box)?.top ?? 0) + (place(d.box)?.height ?? 0) + 4 }} onClick={onSolve}>
              {t('Solve')}
            </button>
          ))}
        {selection && !isTextHidden && (
          <div
            className="selection-menu"
            style={{ left: selection.left, top: selection.top }}
            // Pressing a button here must not clear the selection it acts on.
            onPointerDown={(event) => event.preventDefault()}
            onPointerUp={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                onSelectionExplain(selection.text, selection.boxes);
                closeSelection();
              }}
            >
              {t('Explain')}
            </button>
            <button
              type="button"
              onClick={() => {
                onSelectionNote(selection.text, selection.boxes);
                closeSelection();
              }}
            >
              {t('Take note')}
            </button>
          </div>
        )}
        {isCovered && (
          <div className="page-cover">
            <span>{t('The page stays covered until you have answered.')}</span>
          </div>
        )}
      </div>
    </div>
  );
}
