// Store de Zustand — ejercicios (cached from DB)

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Exercise } from '../types';
import { getDb } from '../database/init';
import { setExerciseFavorite } from '../database/mutations';

interface ExerciseState {
  exercises: Exercise[];
  favorites: string[];
  setExercises: (exercises: Exercise[]) => void;
  toggleFavorite: (id: string) => void;
  addCustomExercise: (exercise: Exercise) => void;
}

export const useExerciseStore = create<ExerciseState>()(
  persist(
    (set, get) => ({
      exercises: [],
      favorites: [],

      setExercises: (exercises) => set({ exercises }),

      toggleFavorite: (id) => {
        const { favorites } = get();
        const isFavorite = favorites.includes(id);
        const newFavs = isFavorite
          ? favorites.filter(f => f !== id)
          : [...favorites, id];
        set({ favorites: newFavs });
        // Persist to DB (F17)
        const db = getDb();
        if (db) setExerciseFavorite(db, id, !isFavorite);
      },

      addCustomExercise: (exercise) => {
        set(state => ({ exercises: [...state.exercises, exercise] }));
      },
    }),
    { name: 'hevy-exercises' }
  )
);
