import { db } from "@/config/firebase";
import { type Note } from "@/types/Note";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { create } from "zustand";

export interface NotesState {
  notes: Note[];
  loading: boolean;
  error: string | null;
  createNote: (
    note: Omit<Note, "id" | "createdAt" | "updatedAt">
  ) => Promise<string>;
  updateNote: (id: string, updates: Partial<Note>) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  subscribeToNotes: (userId: string) => () => void;
}

export const useNotesStore = create<NotesState>((set, get) => ({
  notes: [],
  loading: false,
  error: null,

  createNote: async (
    noteData: Omit<Note, "id" | "createdAt" | "updatedAt">
  ) => {
    try {
      set({ loading: true });
      const docRef = await addDoc(collection(db, "notes"), {
        ...noteData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return docRef.id;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("Error creating note:", error);
      set({ error: errorMessage });
      throw error;
    } finally {
      set({ loading: false });
    }
  },
  updateNote: async (id: string, updates: Partial<Note>) => {
    try {
      set({ loading: true });
      await updateDoc(doc(db, "notes", id), {
        ...updates,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("Error updating note:", error);
      set({ error: errorMessage });
      throw error;
    } finally {
      set({ loading: false });
    }
  },
  deleteNote: async (id: string) => {
    try {
      set({ loading: true });
      await deleteDoc(doc(db, "notes", id));

      set({ notes: get().notes.filter((note) => note.id !== id) });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("Error deleting notes:", error);
      set({ error: errorMessage });
      throw error;
    } finally {
      set({ loading: false });
    }
  },
  subscribeToNotes: (userId: string) => {
    set({ loading: true });
    const q = query(
      collection(db, "notes"),
      where("userId", "==", userId),
      orderBy("updatedAt", "desc")
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const notes = snapshot.docs
          .map((doc) => {
            const data = doc.data() as Note;

            // validate data
            if (!data.createdAt || !data.updatedAt) {
              console.error("Invalid note data:", data);
              return null;
            }

            return {
              ...data,
              id: doc.id,
              createdAt: data.createdAt.toDate(),
              updatedAt: data.updatedAt.toDate(),
            };
          })
          .filter(Boolean) as Note[];

        set({ notes, loading: false });
      },
      (error) => {
        console.error("Error subscribing to notes:", error);
        set({ error: error.message, loading: false });
      }
    );

    return unsubscribe;
  },
}));
