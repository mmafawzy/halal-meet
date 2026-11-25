import type {
  Answer,
  Gender,
  HalalMode,
  Intention,
  Locale,
  MaritalStatus,
  MatchPreferencesInput,
  PhotoVisibility,
} from '@halal-meet/core';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { persistStorage } from './storage';

export type OnboardingStep =
  | 'language'
  | 'welcome'
  | 'phone'
  | 'otp'
  | 'intention'
  | 'halal-mode'
  | 'basics'
  | 'photo'
  | 'religion'
  | 'questions'
  | 'dealbreakers'
  | 'notifications'
  | 'ready';

export type ChildrenStatus = 'none' | 'with_me' | 'not_with_me';

/** Everything collected during onboarding; persisted locally so the flow can resume after a restart. */
export interface OnboardingDraft {
  phone: string;
  intention: Intention | null;
  halalMode: HalalMode | null;
  acceptedModes: HalalMode[];
  firstName: string;
  gender: Gender | null;
  birthDate: string; // YYYY-MM-DD
  nationality: string[];
  country: string | null;
  city: string;
  languages: string[];
  maritalStatus: MaritalStatus | null;
  children: ChildrenStatus | null;
  photoUri: string | null;
  photoVisibility: PhotoVisibility;
  /** Answers keyed by question key. */
  answers: Record<string, Answer>;
  topPicksTime: 'after_maghrib' | 'morning' | 'evening' | 'custom';
  customTime: string;
  notifications: boolean;
}

export const EMPTY_DRAFT: OnboardingDraft = {
  phone: '',
  intention: null,
  halalMode: null,
  acceptedModes: ['private', 'guided', 'wali'],
  firstName: '',
  gender: null,
  birthDate: '',
  nationality: [],
  country: null,
  city: '',
  languages: [],
  maritalStatus: null,
  children: null,
  photoUri: null,
  photoVisibility: 'request',
  answers: {},
  topPicksTime: 'after_maghrib',
  customTime: '21:00',
  notifications: true,
};

interface SessionState {
  /** UI language; null until chosen on the language screen. */
  locale: Locale | null;
  /** Viewer gender used for gendered Arabic copy. */
  gender: Gender | null;
  /** In-memory copy of the bearer token (source of truth is tokenStorage). */
  token: string | null;
  accountId: string | null;
  onboardingDone: boolean;
  onboardingStep: OnboardingStep;
  draft: OnboardingDraft;
  /** Last saved match preferences (the API has no GET for them). */
  preferences: MatchPreferencesInput | null;
  /** Guards against reload loops when the native RTL flag refuses to flip. */
  rtlReloadAt: number | null;
  /** Guardian invitation code being accepted; the phone/OTP screens return to it instead of member onboarding. */
  pendingGuardianCode: string | null;
  /** Signed in only as a guardian (no member profile): the splash gate opens the guardian area. */
  guardianOnly: boolean;

  setLocale: (l: Locale) => void;
  setGender: (g: Gender | null) => void;
  setToken: (token: string | null, accountId?: string | null) => void;
  setStep: (s: OnboardingStep) => void;
  updateDraft: (patch: Partial<OnboardingDraft>) => void;
  setAnswer: (a: Answer) => void;
  completeOnboarding: () => void;
  setPreferences: (p: MatchPreferencesInput) => void;
  setRtlReloadAt: (t: number | null) => void;
  setPendingGuardianCode: (code: string | null) => void;
  setGuardianOnly: (v: boolean) => void;
  signOut: () => void;
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      locale: null,
      gender: null,
      token: null,
      accountId: null,
      onboardingDone: false,
      onboardingStep: 'language',
      draft: EMPTY_DRAFT,
      preferences: null,
      rtlReloadAt: null,
      pendingGuardianCode: null,
      guardianOnly: false,

      setLocale: (locale) => set({ locale }),
      setGender: (gender) => set({ gender }),
      setToken: (token, accountId = null) => set({ token, accountId }),
      setStep: (onboardingStep) => set({ onboardingStep }),
      updateDraft: (patch) =>
        set((s) => ({
          draft: { ...s.draft, ...patch },
          gender: patch.gender !== undefined ? patch.gender : s.gender,
        })),
      setAnswer: (a) => set((s) => ({ draft: { ...s.draft, answers: { ...s.draft.answers, [a.questionKey]: a } } })),
      completeOnboarding: () => set({ onboardingDone: true, onboardingStep: 'ready' }),
      setPreferences: (preferences) => set({ preferences }),
      setRtlReloadAt: (rtlReloadAt) => set({ rtlReloadAt }),
      setPendingGuardianCode: (pendingGuardianCode) => set({ pendingGuardianCode }),
      setGuardianOnly: (guardianOnly) => set({ guardianOnly }),
      signOut: () =>
        set((s) => ({
          token: null,
          accountId: null,
          onboardingDone: false,
          onboardingStep: 'welcome',
          draft: EMPTY_DRAFT,
          preferences: null,
          gender: null,
          pendingGuardianCode: null,
          guardianOnly: false,
          locale: s.locale,
        })),
    }),
    {
      name: 'hm.session.v1',
      storage: persistStorage,
      partialize: ({ token: _token, ...rest }) => rest,
    },
  ),
);

/** Resolves once the persisted session has been rehydrated from storage. */
export function sessionHydrated(): Promise<void> {
  if (useSession.persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const unsub = useSession.persist.onFinishHydration(() => {
      unsub();
      resolve();
    });
  });
}
