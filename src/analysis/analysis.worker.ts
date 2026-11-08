import type { Calibration } from '../vision/classifySquares';
import { analyzeBook, type RawBook } from './analyzeBook';

export interface AnalysisRequest {
  raw: RawBook;
  calibration?: Calibration;
}

export type AnalysisMessage =
  | { type: 'progress'; stage: 'diagrams' | 'moves'; done: number; total: number }
  | { type: 'done'; result: ReturnType<typeof analyzeBook> }
  | { type: 'error'; message: string };

const post = (message: AnalysisMessage) => self.postMessage(message);

self.onmessage = (event: MessageEvent<AnalysisRequest>) => {
  try {
    const { raw, calibration } = event.data;
    const result = analyzeBook(raw, calibration, (stage, done, total) => post({ type: 'progress', stage, done, total }));
    post({ type: 'done', result });
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
