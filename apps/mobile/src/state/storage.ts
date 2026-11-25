import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage } from 'zustand/middleware';

/** AsyncStorage-backed JSON storage for zustand `persist` (uses localStorage on web). */
export const persistStorage = createJSONStorage(() => AsyncStorage);
