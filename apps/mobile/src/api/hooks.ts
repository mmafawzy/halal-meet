/**
 * React Query hooks over the HalalMeetApi. Screens should use these instead of calling `api` directly.
 */
import type {
  Answer,
  AnswerTopicBody,
  CloseMatchBody,
  DevGrantBody,
  FeedPage,
  Guardian,
  GuardianApprovalBody,
  GuardianInviteBody,
  GuardianOpinionBody,
  GuardianUpdateBody,
  InterestBody,
  MatchPreferencesInput,
  PassBody,
  PassportDestinationInput,
  ProfileCard,
  ReportBody,
  SendMessageBody,
} from '@halal-meet/core';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import { router } from 'expo-router';

import { tNow } from '../i18n';
import { useLocal } from '../state/local';
import { useSession } from '../state/session';
import { useUi } from '../state/ui';
import { api } from './index';
import { ApiError, isLimitReached, LimitReachedError, type ProfileUpdateBody } from './types';
import { chatPollInterval } from '../components/notifications/realtime';

export const qk = {
  me: ['me'] as const,
  answers: ['answers'] as const,
  feed: ['feed'] as const,
  topPicks: ['topPicks'] as const,
  profile: (id: string) => ['profile', id] as const,
  incoming: ['incoming'] as const,
  matches: ['matches'] as const,
  messages: (matchId: string) => ['messages', matchId] as const,
  passport: ['passport'] as const,
  countries: ['countries'] as const,
  entitlements: ['entitlements'] as const,
};

// ───────── queries ─────────

export function useMe(enabled = true) {
  const token = useSession((s) => s.token);
  return useQuery({ queryKey: qk.me, queryFn: () => api.me(), enabled: enabled && !!token, staleTime: 15_000 });
}

export function useAnswers() {
  return useQuery({ queryKey: qk.answers, queryFn: () => api.getAnswers(), staleTime: 60_000 });
}

export function useFeed() {
  return useInfiniteQuery({
    queryKey: qk.feed,
    queryFn: ({ pageParam }) => api.feed(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last: FeedPage) => last.nextCursor,
    staleTime: 60_000,
  });
}

export function useTopPicks() {
  return useQuery({ queryKey: qk.topPicks, queryFn: () => api.topPicks(), staleTime: 5 * 60_000 });
}

export function useProfile(id: string | undefined) {
  return useQuery({
    queryKey: qk.profile(id ?? ''),
    queryFn: () => api.profile(id!),
    enabled: !!id,
  });
}

export function useIncoming() {
  return useQuery({ queryKey: qk.incoming, queryFn: () => api.incoming() });
}

export function useMatches(opts: { poll?: boolean } = {}) {
  return useQuery({ queryKey: qk.matches, queryFn: () => api.matches(), refetchInterval: opts.poll ? 5000 : false });
}

export function useMessages(matchId: string | undefined) {
  return useQuery({
    queryKey: qk.messages(matchId ?? ''),
    queryFn: () => api.messages(matchId!),
    enabled: !!matchId,
    refetchInterval: chatPollInterval, // 2 s, or a slow safety net while the realtime stream (GET /events) is open
  });
}

export function usePassport() {
  return useQuery({ queryKey: qk.passport, queryFn: () => api.passport() });
}

export function useCountries() {
  return useQuery({ queryKey: qk.countries, queryFn: () => api.countries(), staleTime: 10 * 60_000 });
}

// ───────── helpers ─────────

export function removeFromFeed(qc: QueryClient, id: string) {
  qc.setQueryData<InfiniteData<FeedPage, string | null>>(qk.feed, (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((p) => ({
            ...p,
            items: p.items.filter((it) => !(it.type === 'profile' && it.card.id === id)),
          })),
        }
      : data,
  );
}

function invalidateAfterInteraction(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: qk.me });
  void qc.invalidateQueries({ queryKey: qk.incoming });
  void qc.invalidateQueries({ queryKey: qk.matches });
  void qc.invalidateQueries({ queryKey: qk.topPicks });
}

// ───────── mutations ─────────

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ProfileUpdateBody) => api.updateProfile(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.me });
      void qc.invalidateQueries({ queryKey: qk.feed });
    },
  });
}

/** Upserts answers. Sends the merged full set so it works whether the server replaces or upserts. */
export function useSaveAnswers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (answers: Answer[]) => {
      const current = qc.getQueryData<Answer[]>(qk.answers) ?? (await api.getAnswers().catch(() => [] as Answer[]));
      const map = new Map(current.map((a) => [a.questionKey, a]));
      answers.forEach((a) => map.set(a.questionKey, a));
      const merged = [...map.values()];
      await api.putAnswers(merged);
      return merged;
    },
    onSuccess: (merged) => {
      qc.setQueryData(qk.answers, merged);
      void qc.invalidateQueries({ queryKey: qk.me });
      void qc.invalidateQueries({ queryKey: qk.feed });
    },
  });
}

export function usePutPreferences() {
  const qc = useQueryClient();
  const setPreferences = useSession((s) => s.setPreferences);
  return useMutation({
    mutationFn: async (body: MatchPreferencesInput) => {
      await api.putPreferences(body);
      return body;
    },
    onSuccess: (body) => {
      setPreferences(body);
      void qc.invalidateQueries({ queryKey: qk.feed });
      void qc.invalidateQueries({ queryKey: qk.topPicks });
    },
  });
}

export interface InterestVars {
  body: InterestBody;
  card?: ProfileCard | null;
}

/**
 * Sends an interest. On a mutual match opens the celebration modal; on HTTP 402 opens the limit sheet.
 */
export function useSendInterest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ body }: InterestVars) => api.interest(body),
    onSuccess: (res, { body }) => {
      removeFromFeed(qc, body.toId);
      qc.setQueryData(qk.me, (me: unknown) => (me && typeof me === 'object' ? { ...me, usage: res.usage } : me));
      invalidateAfterInteraction(qc);
      if (res.matched && res.matchId) {
        router.push({ pathname: '/match/[matchId]', params: { matchId: res.matchId } });
      } else {
        useUi.getState().showToast({ message: tNow('common.undo.interestSent'), tone: 'success', durationMs: 2200 });
      }
    },
    onError: (e, { body, card }) => {
      useUi.getState().unhide(body.toId);
      if (isLimitReached(e)) {
        const usage = e instanceof LimitReachedError ? e.usage : null;
        if (body.level === 'interest') useUi.getState().openLimitSheet(card ?? null, usage);
        else router.push({ pathname: '/paywall', params: { trigger: 'serious' } });
        return;
      }
      useUi.getState().showToast({ message: tNow('common.states.error'), tone: 'danger' });
    },
  });
}

export function usePass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PassBody) => api.pass(body),
    onSuccess: (_r, body) => {
      removeFromFeed(qc, body.toId);
      void qc.invalidateQueries({ queryKey: qk.incoming });
    },
  });
}

export function useSendMessage(matchId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SendMessageBody) => api.sendMessage(matchId, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.messages(matchId) });
      void qc.invalidateQueries({ queryKey: qk.matches });
    },
  });
}

export function useAnswerTopic(matchId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ messageId, body }: { messageId: string; body: AnswerTopicBody }) => api.answerTopic(matchId, messageId, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.messages(matchId) });
      void qc.invalidateQueries({ queryKey: qk.matches });
    },
  });
}

export function useStageReady(matchId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (stage: 1 | 2 | 3 | 4 | 5 | 6) => api.stageReady(matchId, { stage }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.messages(matchId) });
      void qc.invalidateQueries({ queryKey: qk.matches });
      // Pending approvals on guardians' dashboards (mock preview) depend on "ready".
      void qc.invalidateQueries({ queryKey: ['guardians', 'previewFor'] });
    },
  });
}

export function useCloseMatch(matchId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CloseMatchBody) => api.closeMatch(matchId, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.messages(matchId) });
      void qc.invalidateQueries({ queryKey: qk.matches });
    },
  });
}

export function useAddPassport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PassportDestinationInput) => api.addPassport(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.passport });
      void qc.invalidateQueries({ queryKey: qk.feed });
      void qc.invalidateQueries({ queryKey: qk.topPicks });
      void qc.invalidateQueries({ queryKey: qk.me });
    },
  });
}

export function useRemovePassport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.removePassport(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.passport });
      void qc.invalidateQueries({ queryKey: qk.feed });
      void qc.invalidateQueries({ queryKey: qk.topPicks });
    },
  });
}

/** Dev / mock purchase (POST /billing/dev/grant). Real IAP goes through `src/billing`. */
export function useDevGrant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DevGrantBody) => api.devGrant(body),
    onSuccess: () => {
      void qc.invalidateQueries();
    },
  });
}

/** GET /me/billing — current subscriptions, renewal dates, store and management link (BILLING_ROUTES). */
export function useMyBilling(enabled = true) {
  const token = useSession((s) => s.token);
  return useQuery({ queryKey: ['billing'] as const, queryFn: () => api.myBilling(), enabled: enabled && !!token, staleTime: 15_000 });
}

export function useVerifyIdentityDemo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!api.dev) throw new Error('not_available');
      await api.dev.verifyIdentity();
    },
    onSuccess: () => {
      void qc.invalidateQueries();
    },
  });
}

export function useReport() {
  return useMutation({ mutationFn: (body: ReportBody) => api.report(body) });
}

export function useBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (subjectId: string) => api.block({ subjectId }),
    onSuccess: (_r, id) => {
      removeFromFeed(qc, id);
      invalidateAfterInteraction(qc);
    },
  });
}

// ───────── guardians ─────────

export const guardianKeys = {
  all: ['guardians'] as const,
  list: ['guardians', 'list'] as const,
  opinions: ['guardians', 'opinions'] as const,
  invite: (code: string) => ['guardianInvite', code] as const,
  links: ['guardianSide', 'links'] as const,
  dashboard: (memberId: string) => ['guardianSide', 'dashboard', memberId] as const,
  /** Mock-only: the member's own preview of what one guardian sees. */
  previewFor: (guardianId: string) => ['guardians', 'previewFor', guardianId] as const,
};

/** The member's guardians (GET /guardians). */
export function useGuardians(enabled = true) {
  const token = useSession((s) => s.token);
  return useQuery({ queryKey: guardianKeys.list, queryFn: () => api.guardians(), enabled: enabled && !!token });
}

/** Opinions the member's guardians left on their introductions (GET /guardians/opinions). */
export function useGuardianOpinions(enabled = true) {
  const token = useSession((s) => s.token);
  return useQuery({ queryKey: guardianKeys.opinions, queryFn: () => api.guardianOpinions(), enabled: enabled && !!token });
}

function invalidateGuardians(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: guardianKeys.all });
  // Guardian presence and pending approvals in chats come from GET /matches.
  void qc.invalidateQueries({ queryKey: qk.matches });
}

export function useInviteGuardian() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: GuardianInviteBody) => api.inviteGuardian(body),
    onSuccess: () => invalidateGuardians(qc),
  });
}

export function useUpdateGuardian() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: GuardianUpdateBody }) => api.updateGuardian(id, body),
    onSuccess: (g) => {
      qc.setQueryData<Guardian[]>(guardianKeys.list, (list) => list?.map((x) => (x.id === g.id ? g : x)));
      invalidateGuardians(qc);
    },
  });
}

/** "Send the invitation again": issues a new code (the previous one stops working). */
export function useReissueGuardianInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.reissueGuardianInvite(id),
    onSuccess: () => invalidateGuardians(qc),
  });
}

export function useRemoveGuardian() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.removeGuardian(id),
    onSuccess: (_r, id) => {
      qc.setQueryData<Guardian[]>(guardianKeys.list, (list) => list?.filter((x) => x.id !== id));
      invalidateGuardians(qc);
    },
  });
}

/** Mock-only: pretend the guardian accepted on their own phone. */
export function useSimulateGuardianAccept() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!api.dev) throw new Error('not_available');
      return api.dev.simulateGuardianAccept(id);
    },
    onSuccess: () => invalidateGuardians(qc),
  });
}

/**
 * Share a profile with all of the member's guardians for an opinion (POST /guardians/shares), or stop
 * sharing it (DELETE /guardians/shares/:subjectId). The contract has no GET for shares, so the ids are
 * also remembered on the device to offer "Stop sharing".
 */
export function useShareWithGuardians() {
  const qc = useQueryClient();
  const markShared = useLocal((s) => s.markShared);
  return useMutation({
    mutationFn: ({ subjectId, share }: { subjectId: string; share: boolean }) =>
      share ? api.shareWithGuardians(subjectId) : api.unshareWithGuardians(subjectId),
    onSuccess: (_r, { subjectId, share }) => {
      markShared(subjectId, share);
      invalidateGuardians(qc);
    },
  });
}

/** Mock-only: one of your approving guardians approves the stage this match is waiting on. */
export function useSimulateGuardianApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (matchId: string) => {
      if (!api.dev) throw new Error('not_available');
      await api.dev.simulateGuardianApproval(matchId);
    },
    onSuccess: (_r, matchId) => {
      void qc.invalidateQueries({ queryKey: qk.matches });
      void qc.invalidateQueries({ queryKey: qk.messages(matchId) });
      invalidateGuardians(qc);
    },
  });
}

/** Public invitation preview (works signed out). */
export function useGuardianInvitePreview(code: string | undefined) {
  return useQuery({
    queryKey: guardianKeys.invite(code ?? ''),
    queryFn: () => api.guardianInvitePreview(code!),
    enabled: !!code,
    retry: false,
  });
}

export function useAcceptGuardianInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => api.acceptGuardianInvite(code),
    onSuccess: (_link, code) => {
      void qc.invalidateQueries({ queryKey: ['guardianSide'] });
      void qc.invalidateQueries({ queryKey: guardianKeys.invite(code) });
    },
  });
}

/** Members this account is a guardian for (GET /guardian/members). */
export function useGuardianLinks(enabled = true) {
  const token = useSession((s) => s.token);
  return useQuery({ queryKey: guardianKeys.links, queryFn: () => api.guardianLinks(), enabled: enabled && !!token });
}

export function useGuardianDashboard(memberId: string | undefined) {
  return useQuery({
    queryKey: guardianKeys.dashboard(memberId ?? ''),
    queryFn: () => api.guardianDashboard(memberId!),
    enabled: !!memberId,
    retry: (count, e) => !(e instanceof ApiError && e.status < 500) && count < 1,
  });
}

export function usePutGuardianOpinion(memberId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ subjectId, body }: { subjectId: string; body: GuardianOpinionBody }) => api.putGuardianOpinion(memberId, subjectId, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: guardianKeys.dashboard(memberId) });
    },
  });
}

/** A guardian approves the next stage, or asks to discuss it first (PUT …/approvals/:matchId). */
export function usePutGuardianApproval(memberId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ matchId, body }: { matchId: string; body: GuardianApprovalBody }) => api.putGuardianApproval(memberId, matchId, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: guardianKeys.dashboard(memberId) });
      void qc.invalidateQueries({ queryKey: guardianKeys.links });
      // The same account may also be a member whose matches changed (rare, but cheap to refresh).
      void qc.invalidateQueries({ queryKey: qk.matches });
    },
  });
}

export function useLeaveGuardianship() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) => api.leaveGuardianship(memberId),
    onSuccess: (_r, memberId) => {
      qc.removeQueries({ queryKey: guardianKeys.dashboard(memberId) });
      void qc.invalidateQueries({ queryKey: guardianKeys.links });
    },
  });
}
