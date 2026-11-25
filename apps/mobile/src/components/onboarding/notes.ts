/**
 * Free-text notes written during onboarding have nowhere to go yet: answers are shared as
 * `questionKey → option value` (core `Answer`) only. They are kept on the device and shown back to
 * the user (the "your note" line on a question card, the reason under a dealbreaker).
 * TODO: send them with the answer once the API contract has a note field (spec 01 §15–16).
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { persistStorage } from '@/state/storage';

interface NotesState {
  /** Optional free-text note per question key. */
  notes: Record<string, string>;
  setNote: (questionKey: string, text: string) => void;
}

function notesStore(name: string) {
  return create<NotesState>()(
    persist(
      (set) => ({
        notes: {},
        setNote: (questionKey, text) =>
          set((s) => {
            const notes = { ...s.notes };
            const trimmed = text.trim();
            if (trimmed) notes[questionKey] = trimmed;
            else delete notes[questionKey];
            return { notes };
          }),
      }),
      { name, storage: persistStorage },
    ),
  );
}

/** Free-text note attached to a starter question answer. */
export const useQuestionNotes = notesStore('hm.question-notes.v1');

/** Why the user made something a dealbreaker (private, shown on the review card). */
export const useDealbreakerReasons = notesStore('hm.dealbreaker-notes.v1');
