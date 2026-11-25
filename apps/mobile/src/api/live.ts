import { GUARDIAN_ROUTES, ROUTES, type Usage } from '@halal-meet/core';

import { ApiError, LimitReachedError, type HalalMeetApi } from './types';

type RouteKey = keyof typeof ROUTES | keyof typeof GUARDIAN_ROUTES;

const ALL_ROUTES: Record<RouteKey, string> = { ...ROUTES, ...GUARDIAN_ROUTES };

/**
 * Turns a ROUTES / GUARDIAN_ROUTES entry (`'GET /matches/:matchId/messages?before='`) into method +
 * concrete path. Trailing notes such as `(public)` are ignored.
 */
export function buildRequest(
  route: RouteKey,
  params: Record<string, string> = {},
  query: Record<string, string | null | undefined> = {},
): { method: string; path: string } {
  const [method, rawPath] = ALL_ROUTES[route].split(' ') as [string, string];
  const [pathTemplate] = rawPath.split('?') as [string];
  const path = pathTemplate.replace(/:([A-Za-z]+)/g, (_, name: string) => {
    const v = params[name];
    if (v == null) throw new Error(`Missing route param ${name} for ${route}`);
    return encodeURIComponent(v);
  });
  const qs = Object.entries(query)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return { method, path: qs ? `${path}?${qs}` : path };
}

/** Accepts either a bare array or `{ [key]: array }` (server envelope not pinned down in the contract). */
function unwrapList<T>(data: unknown, key: string): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>)[key])) {
    return (data as Record<string, T[]>)[key]!;
  }
  return [];
}

export interface LiveApiOptions {
  baseUrl: string;
  getToken: () => string | null;
  onUnauthorized?: () => void;
}

export function createLiveApi({ baseUrl, getToken, onUnauthorized }: LiveApiOptions): HalalMeetApi {
  const base = baseUrl.replace(/\/+$/, '');

  async function call<T>(
    route: RouteKey,
    opts: {
      params?: Record<string, string>;
      query?: Record<string, string | null | undefined>;
      body?: unknown;
      /** Public routes (invitation preview) are sent without the bearer token. */
      anonymous?: boolean;
    } = {},
  ): Promise<T> {
    const { method, path } = buildRequest(route, opts.params, opts.query);
    const headers: Record<string, string> = { Accept: 'application/json' };
    const token = opts.anonymous ? null : getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

    const res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    if (!res.ok) {
      const obj = (data && typeof data === 'object' ? data : {}) as { error?: string; usage?: Usage; limit?: string };
      if (res.status === 402) throw new LimitReachedError(obj.usage ?? null, obj.limit ?? 'interests', data);
      if (res.status === 401 && !opts.anonymous) onUnauthorized?.();
      throw new ApiError(res.status, obj.error ?? `http_${res.status}`, data);
    }
    return data as T;
  }

  return {
    mode: 'live',
    otpRequest: async (body) => {
      await call('otpRequest', { body });
    },
    otpVerify: (body) => call('otpVerify', { body }),
    me: () => call('me'),
    updateProfile: async (body) => {
      await call('updateProfile', { body });
    },
    getAnswers: async () => unwrapList(await call('getAnswers'), 'answers'),
    putAnswers: async (answers) => {
      await call('putAnswers', { body: { answers } });
    },
    putPreferences: async (body) => {
      await call('putPreferences', { body });
    },
    entitlements: () => call('entitlements'),
    feed: (cursor) => call('feed', { query: { cursor: cursor ?? undefined } }),
    topPicks: () => call('topPicks'),
    profile: (id) => call('profile', { params: { id } }),
    interest: (body) => call('interest', { body }),
    pass: async (body) => {
      await call('pass', { body });
    },
    incoming: () => call('incoming'),
    matches: async () => unwrapList(await call('matches'), 'matches'),
    messages: async (matchId, before) =>
      unwrapList(await call('messages', { params: { matchId }, query: { before: before ?? undefined } }), 'messages'),
    sendMessage: async (matchId, body) => {
      const data = await call<unknown>('sendMessage', { params: { matchId }, body });
      return ((data as { message?: unknown })?.message ?? data) as never;
    },
    answerTopic: async (matchId, messageId, body) => {
      const data = await call<unknown>('answerTopic', { params: { matchId, messageId }, body });
      return ((data as { message?: unknown })?.message ?? data) as never;
    },
    stageReady: async (matchId, body) => {
      await call('stageReady', { params: { matchId }, body });
    },
    closeMatch: async (matchId, body) => {
      await call('closeMatch', { params: { matchId }, body });
    },
    passport: () => call('passport'),
    addPassport: async (body) => {
      await call('addPassport', { body });
    },
    removePassport: async (id) => {
      await call('removePassport', { params: { id } });
    },
    devGrant: async (body) => {
      await call('devGrant', { body });
    },
    report: async (body) => {
      await call('report', { body });
    },
    block: async (body) => {
      await call('block', { body });
    },
    countries: async () => unwrapList(await call('countries'), 'countries'),

    guardians: async () => unwrapList(await call('listGuardians'), 'guardians'),
    inviteGuardian: (body) => call('inviteGuardian', { body }),
    updateGuardian: (id, body) => call('updateGuardian', { params: { id }, body }),
    reissueGuardianInvite: (id) => call('reissueInvite', { params: { id } }),
    removeGuardian: async (id) => {
      await call('removeGuardian', { params: { id } });
    },
    guardianOpinions: async () => unwrapList(await call('guardianOpinions'), 'opinions'),
    shareWithGuardians: async (subjectId) => {
      await call('shareWithGuardians', { body: { subjectId } });
    },
    unshareWithGuardians: async (subjectId) => {
      await call('unshareWithGuardians', { params: { subjectId } });
    },
    guardianInvitePreview: (code) => call('invitePreview', { params: { code }, anonymous: true }),
    acceptGuardianInvite: (code) => call('acceptInvite', { params: { code } }),
    guardianLinks: async () => unwrapList(await call('guardianLinks'), 'members'),
    guardianDashboard: (memberId) => call('guardianDashboard', { params: { memberId } }),
    putGuardianOpinion: async (memberId, subjectId, body) => {
      await call('guardianOpinion', { params: { memberId, subjectId }, body });
    },
    putGuardianApproval: async (memberId, matchId, body) => {
      await call('guardianApproval', { params: { memberId, matchId }, body });
    },
    leaveGuardianship: async (memberId) => {
      await call('leaveGuardianship', { params: { memberId } });
    },
  };
}
