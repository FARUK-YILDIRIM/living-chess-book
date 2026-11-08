import { useCallback, useEffect, useRef, useState } from 'react';
import { addEntry, editEntry, removeEntry, restoreEntry, type Anchor, type EntryKind, type Notebook, type NotebookEntry } from '../core/notebook';
import { findSavedPosition } from '../core/notebook';
import { firstReview, soonReview, type ReviewState } from '../core/repetition';
import type { Box } from '../core/types';
import { isKnownMessage, type MessageKey } from './i18n';
import { readSetting, removeSetting, writeSetting } from './I18nContext';
import { changeNotebook, loadNotebook } from './store';
import { mergeNotebook, type ImportedNotebook } from '../core/sharing';

export type NotebookFilter = 'all' | 'page' | 'positions';

// Kept from the working name, so that windows of builds before and after the rename keep in step.
const CHANNEL = 'chess-coach.notebook';
const NOT_SAVED: MessageKey = 'What you wrote could not be saved, so it is still here.';
const NOT_CHANGED: MessageKey = 'This change could not be saved.';

const draftKey = (hash: string) => `chess-coach.note-draft.${hash}`;
const editKey = (hash: string) => `chess-coach.note-edit.${hash}`;

/** Called when a book is removed, so that nothing of it stays behind. */
export function forgetDraft(hash: string): void {
  removeSetting(draftKey(hash));
  removeSetting(editKey(hash));
}

/** Asks the panel to bring an entry into view. A new object each time, so that repeats count. */
export interface Reveal {
  entryId: string;
}

/** What the reader selected on the page. The words stay in memory, and only the places are saved. */
export interface PendingSelection {
  /** The page it is on. Turning away from it drops the selection. */
  page: number;
  text: string;
  boxes: Box[];
}

export interface EditInProgress {
  entryId: string;
  text: string;
}

function readEdit(hash: string): EditInProgress | null {
  try {
    const stored = JSON.parse(readSetting(editKey(hash)) ?? 'null') as Partial<EditInProgress> | null;
    return typeof stored?.entryId === 'string' && typeof stored.text === 'string' ? { entryId: stored.entryId, text: stored.text } : null;
  } catch {
    return null;
  }
}

/** A message from the store that tells the reader what to do beats a general one. */
function messageFor(cause: unknown, general: MessageKey): MessageKey {
  return cause instanceof Error && isKnownMessage(cause.message) ? (cause.message as MessageKey) : general;
}

/**
 * Everything the reader keeps in a book's notebook, including what they are still typing. It lives
 * here rather than in the panel, which the reader opens and closes.
 */
export function useNotebook(bookHash: string | null) {
  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [problem, setProblem] = useState<MessageKey | null>(null);
  const [removed, setRemoved] = useState<NotebookEntry | null>(null);
  const [draft, setDraftState] = useState('');
  const [editing, setEditingState] = useState<EditInProgress | null>(null);
  const [filter, setFilter] = useState<NotebookFilter>('all');
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [pendingSelection, setPendingSelection] = useState<PendingSelection | null>(null);
  const [composerFocus, setComposerFocus] = useState(0);
  const currentHash = useRef(bookHash);
  currentHash.current = bookHash;
  const latestDraft = useRef(draft);
  latestDraft.current = draft;
  const latestEditing = useRef(editing);
  latestEditing.current = editing;
  const latestSelection = useRef(pendingSelection);
  latestSelection.current = pendingSelection;
  const isAdding = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    setNotebook(null);
    setProblem(null);
    setRemoved(null);
    setReveal(null);
    setFilter('all');
    setPendingSelection(null);
    setDraftState(bookHash ? (readSetting(draftKey(bookHash)) ?? '') : '');
    setEditingState(bookHash ? readEdit(bookHash) : null);
    if (!bookHash) return;

    let isCurrent = true;
    const reload = () =>
      loadNotebook(bookHash).then(
        (loaded) => {
          if (isCurrent) setNotebook(loaded);
        },
        (cause: unknown) => {
          if (isCurrent) setProblem(messageFor(cause, 'Your notebook could not be read.'));
        },
      );
    void reload();

    // Another window on this book has changed the notebook, so what is shown here is out of date.
    const listening = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL);
    channel.current = listening;
    if (listening) {
      listening.onmessage = (event: MessageEvent) => {
        if (event.data === bookHash) void reload();
      };
    }
    return () => {
      isCurrent = false;
      listening?.close();
      channel.current = null;
    };
  }, [bookHash]);

  const change = useCallback(
    async (mutate: (notebook: Notebook) => Notebook, failure: MessageKey): Promise<boolean> => {
      if (!bookHash) return false;
      try {
        const next = await changeNotebook(bookHash, mutate);
        if (currentHash.current === bookHash) {
          setNotebook(next);
          setProblem(null);
          channel.current?.postMessage(bookHash);
        }
        return true;
      } catch (cause) {
        if (currentHash.current === bookHash) setProblem(messageFor(cause, failure));
        return false;
      }
    },
    [bookHash],
  );

  /** A write can outlast the book it was for, and must then leave the book now open alone. */
  const isStillOpen = useCallback(() => currentHash.current === bookHash, [bookHash]);

  const setDraft = useCallback(
    (text: string) => {
      setDraftState(text);
      if (!bookHash) return;
      if (text) writeSetting(draftKey(bookHash), text);
      else removeSetting(draftKey(bookHash));
    },
    [bookHash],
  );

  const setEditing = useCallback(
    (next: EditInProgress | null) => {
      setEditingState(next);
      if (!bookHash) return;
      if (next) writeSetting(editKey(bookHash), JSON.stringify(next));
      else removeSetting(editKey(bookHash));
    },
    [bookHash],
  );

  const add = useCallback(
    async (kind: EntryKind, text: string, anchor: Anchor, extra: Partial<NotebookEntry> = {}): Promise<boolean> => {
      const now = Date.now();
      const entry: NotebookEntry = { id: crypto.randomUUID(), kind, text, createdAt: now, updatedAt: now, anchor, ...extra };
      const isSaved = await change((current) => addEntry(current, entry), kind === 'note' ? NOT_SAVED : NOT_CHANGED);
      if (isSaved && isStillOpen()) setReveal({ entryId: entry.id });
      return isSaved;
    },
    [change, isStillOpen],
  );

  const addNote = useCallback(
    async (anchor: Anchor) => {
      const written = latestDraft.current;
      const text = written.trim();
      // Anything typed while this was saving is new, and stays.
      // Pressing Enter twice must not write the note twice.
      if (!text || isAdding.current) return;
      isAdding.current = true;
      const selection = latestSelection.current;
      const isSaved = await add('note', text, anchor, selection ? { highlight: selection.boxes } : {});
      isAdding.current = false;
      if (!isSaved || !isStillOpen()) return;
      if (latestSelection.current === selection) setPendingSelection(null);
      if (latestDraft.current === written) setDraft('');
    },
    [add, isStillOpen, setDraft],
  );

  const savePosition = useCallback(
    async (anchor: Anchor) => {
      // Clicking twice must not save it twice.
      if (isAdding.current) return false;
      isAdding.current = true;
      const isSaved = await add('position', '', anchor, { review: firstReview(Date.now()) });
      isAdding.current = false;
      return isSaved;
    },
    [add],
  );

  const addAnswer = useCallback(
    async (question: string, answer: string, anchor: Anchor, model: string, usage: NotebookEntry['usage'], selection: PendingSelection | null) => {
      const extra: Partial<NotebookEntry> = { question, model, usage: usage ?? null, ...(selection ? { highlight: selection.boxes } : {}) };
      const isSaved = await add('coach', answer, anchor, extra);
      if (isSaved && isStillOpen() && latestSelection.current === selection) setPendingSelection(null);
      return isSaved;
    },
    [add, isStillOpen],
  );

  /** Brings a position back soon, because the reader missed the move there. Quietly, in the background. */
  const addMissed = useCallback(
    (anchor: Anchor) => {
      const { fen } = anchor;
      if (!fen) return Promise.resolve(false);
      const now = Date.now();
      return change((current) => {
        const known = findSavedPosition(current.entries, fen);
        if (known) return { ...current, entries: current.entries.map((e) => (e.id === known.id ? { ...e, review: soonReview(now) } : e)) };
        return addEntry(current, { id: crypto.randomUUID(), kind: 'position', text: '', createdAt: now, updatedAt: now, anchor, review: soonReview(now), wasMissed: true });
      }, NOT_CHANGED);
    },
    [change],
  );

  const markSolved = useCallback(
    (key: string) => {
      void change((current) => (current.solved?.includes(key) ? current : { ...current, solved: [...(current.solved ?? []), key] }), NOT_CHANGED);
    },
    [change],
  );

  const saveReview = useCallback(
    (entry: NotebookEntry, review: ReviewState) =>
      change((current) => ({ ...current, entries: current.entries.map((e) => (e.id === entry.id ? { ...e, review } : e)) }), NOT_CHANGED),
    [change],
  );

  /** Adds the entries of a notebook file that this one lacks. The number added, or null if it failed. */
  const importEntries = useCallback(
    async (imported: ImportedNotebook): Promise<number | null> => {
      let added = 0;
      const isSaved = await change((current) => {
        const merged = mergeNotebook(current, imported);
        added = merged.added;
        return merged.notebook;
      }, NOT_CHANGED);
      return isSaved ? added : null;
    },
    [change],
  );

  const startEdit = useCallback(
    (entry: NotebookEntry) => {
      // One at a time, and what is open is not thrown away for the next one.
      const open = latestEditing.current;
      if (open && open.entryId !== entry.id) setReveal({ entryId: open.entryId });
      else if (!open) setEditing({ entryId: entry.id, text: entry.text });
    },
    [setEditing],
  );

  const setEditText = useCallback(
    (text: string) => {
      const open = latestEditing.current;
      if (open) setEditing({ ...open, text });
    },
    [setEditing],
  );

  const cancelEdit = useCallback(() => setEditing(null), [setEditing]);

  const saveEdit = useCallback(async () => {
    const open = latestEditing.current;
    if (!open) return;
    let wasFound = false;
    const isSaved = await change((current) => {
      wasFound = current.entries.some((e) => e.id === open.entryId);
      return editEntry(current, open.entryId, open.text.trim(), Date.now());
    }, NOT_SAVED);
    // A note that has gone is dealt with below, and anything typed while saving is new, and stays.
    if (isSaved && wasFound && isStillOpen() && latestEditing.current?.text === open.text) setEditing(null);
  }, [change, isStillOpen, setEditing]);

  const remove = useCallback(
    async (entry: NotebookEntry) => {
      if ((await change((current) => removeEntry(current, entry.id), NOT_CHANGED)) && isStillOpen()) setRemoved(entry);
    },
    [change, isStillOpen],
  );

  const undoRemove = useCallback(async () => {
    if (!removed) return;
    if ((await change((current) => restoreEntry(current, removed), NOT_CHANGED)) && isStillOpen()) {
      setRemoved(null);
      setReveal({ entryId: removed.id });
    }
  }, [change, isStillOpen, removed]);

  const entries = notebook?.entries ?? [];

  // The note being edited can go, in another window. The panel has nowhere to show the words then,
  // so they move to the box for new notes.
  const orphanedEdit = notebook && editing && !entries.some((e) => e.id === editing.entryId) ? editing : null;
  useEffect(() => {
    if (!orphanedEdit) return;
    setDraft([latestDraft.current, orphanedEdit.text.trim()].filter(Boolean).join('\n'));
    setEditing(null);
    setProblem('That note was deleted in another window, so what you wrote is now in the box below.');
  }, [orphanedEdit, setDraft, setEditing]);

  return {
    entries,
    solved: notebook?.solved,
    problem,
    removed,
    draft,
    pendingSelection,
    composerFocus,
    editing,
    filter,
    reveal,
    setFilter,
    setDraft,
    setPendingSelection,
    focusComposer: useCallback(() => setComposerFocus((count) => count + 1), []),
    /** The panel can open later, and must not take the keyboard then for a request long past. */
    clearComposerFocus: useCallback(() => setComposerFocus(0), []),
    addNote,
    savePosition,
    addAnswer,
    addMissed,
    markSolved,
    saveReview,
    importEntries,
    startEdit,
    setEditText,
    cancelEdit,
    saveEdit,
    remove,
    undoRemove,
    dismissRemoved: useCallback(() => setRemoved(null), []),
    showEntry: useCallback((entryId: string) => setReveal({ entryId }), []),
    clearReveal: useCallback(() => setReveal(null), []),
  };
}

export type NotebookState = ReturnType<typeof useNotebook>;
