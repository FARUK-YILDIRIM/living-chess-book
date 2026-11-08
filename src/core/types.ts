/** A rectangle in PDF page points, with the origin at the top left. */
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A word from a PDF text layer. Held in memory during analysis, never persisted. */
export interface Word {
  text: string;
  page: number;
  box: Box;
  /** Share of dark pixels in the word's box, used to tell bold text from regular. */
  ink: number;
  /** True when a piece symbol seems to have been lost before this word's square. */
  glyphLost?: boolean;
}

/** A move as read from text, before it is matched against a position. */
export interface MoveToken {
  moveNumber: number | null;
  dots: number;
  /** The text in front of the square, which identifies the piece in this book. */
  key: string;
  fromFile: string | null;
  capture: boolean;
  to: string | null;
  promotion: boolean;
  castle: 'k' | 'q' | null;
}

export type Color = 'w' | 'b';

export interface Diagram {
  id: string;
  page: number;
  box: Box;
  /** The piece placement field of a FEN. */
  placement: string;
  sideToMove: Color | null;
  /** The caption or heading of the diagram, such as `problem 17`. */
  label: string | null;
  /** Reasons the position cannot be right. Empty when it passes all checks. */
  issues: string[];
  /** The lowest square confidence on the board, from 0 to 1. */
  confidence: number;
}

/** One move in a book's move tree. */
export interface MoveNode {
  id: string;
  parentId: string | null;
  /** The diagram the line starts from, or null for the initial position. */
  diagramId: string | null;
  san: string;
  /** The position after this move. */
  fen: string;
  page: number;
  box: Box;
  isMainLine: boolean;
  confidence: Confidence;
  /** Added to the position's move number to get the number printed in the book. */
  numberOffset?: number;
  /** Set when a reader corrected this move, or a model read it. See ADR-0010. */
  source?: MoveSource;
}

export type MoveSource = 'reader' | 'llm';

export type Confidence = 'high' | 'low';

export type ReviewReason =
  | 'invalid-diagram'
  | 'low-confidence-diagram'
  | 'low-confidence-move'
  | 'unresolved-move';

/** Something the app could not settle, and asks the reader to check. */
export interface ReviewItem {
  id: string;
  reason: ReviewReason;
  page: number;
  box: Box;
  targetId: string | null;
}

/**
 * What the app stores about a book. It deliberately has no field for book text
 * or page images: see ADR-0006.
 */
export interface BookOverlay {
  schemaVersion: 1;
  /** SHA-256 of the PDF bytes. */
  bookHash: string;
  pageCount: number;
  diagrams: Diagram[];
  moves: MoveNode[];
  review: ReviewItem[];
}
