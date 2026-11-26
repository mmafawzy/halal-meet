/**
 * In-memory moderation backend for mock mode (mirrors apps/api ModerationService).
 * Seeds a small fictional case load (reports with evidence, photos, an earlier action) and also imports
 * the reports you file in the demo app, so "report someone → review it in the console" works end to end.
 * The demo account's role is switched from Profile → Demo tools (`api.admin.dev.setDemoRole`).
 */
import {
  isStaffRole,
  reportPriority,
  type AdminAccountDetail,
  type AdminAccountStatus,
  type AdminAccountSummary,
  type AdminAuditPage,
  type AdminEvidenceMessage,
  type AdminPhotoItem,
  type AdminPhotoStatus,
  type AdminReportBrief,
  type AdminReportCategory,
  type AdminReportDetail,
  type AdminReportListItem,
  type AdminReportPriority,
  type AdminReportStatus,
  type AdminRiskFlag,
  type AdminStats,
  type Locale,
  type Message,
  type ModerationActionEntry,
  type ModerationActionKind,
  type ReportBody,
} from '@halal-meet/core';

import type { AdminApi, DemoRole } from '../admin';
import { ApiError } from '../types';
import type { KeyValueStorage } from './index';

const STORAGE_KEY = 'hm.mockadmin.v1';
const DAY = 86_400_000;
const HOUR = 3_600_000;

interface MockPerson extends AdminAccountSummary {
  names: [string, string];
  phoneMasked: string;
  locale: string;
  lastActiveAt: string | null;
  profile: AdminAccountDetail['profile'];
  verifications: AdminAccountDetail['verifications'];
}

interface MockReport {
  id: string;
  reporterId: string;
  subjectId: string;
  category: AdminReportCategory;
  details: string | null;
  evidenceMessageIds: string[];
  status: AdminReportStatus;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

interface MockMsg {
  id: string;
  matchId: string;
  senderId: string | null;
  kind: string;
  body: string;
  risk: AdminRiskFlag | null;
  hidden: boolean;
  sentAt: string;
}

interface MockPhoto {
  id: string;
  accountId: string;
  status: AdminPhotoStatus;
  createdAt: string;
  position: number;
}

interface MockAction {
  id: string;
  moderatorId: string;
  subjectId: string;
  reportId: string | null;
  action: ModerationActionKind;
  reason: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
}

interface MockNotice {
  accountId: string;
  payload: Record<string, unknown>;
  at: string;
}

interface AdminState {
  version: 1;
  role: DemoRole;
  people: Record<string, MockPerson>;
  matches: Array<{ id: string; aId: string; bId: string; status: 'active' | 'closed' }>;
  messages: MockMsg[];
  reports: MockReport[];
  photos: MockPhoto[];
  actions: MockAction[];
  notices: MockNotice[];
  importedUserReports: number;
  seq: number;
}

/** What the admin mock needs from the main mock backend. */
export interface MockAdminBridge {
  storage?: KeyValueStorage;
  latencyMs: number;
  now: () => Date;
  getLocale: () => Locale;
  /** The signed-in demo account. */
  accountId: () => string;
  me: () => { firstName: string; gender: 'male' | 'female'; country: string; city: string } | null;
  /** Reports filed in the demo app (POST /reports). */
  userReports: () => ReportBody[];
  /** A seeded member as a console summary (null if unknown). */
  member: (id: string) => { names: [string, string]; gender: 'male' | 'female'; age: number; country: string; city: string; verified: boolean } | null;
  /** The demo conversation with a seeded member (empty if none). */
  conversationWith: (id: string) => Message[];
}

export interface MockAdmin {
  api: AdminApi;
  /** Role reported by the mock GET /me. */
  role: () => DemoRole;
  reset: () => Promise<void>;
}

// ───────── Seed ─────────

function seedState(now: Date): AdminState {
  const at = (msAgo: number) => new Date(now.getTime() - msAgo).toISOString();
  const person = (
    id: string,
    names: [string, string],
    gender: 'male' | 'female',
    age: number,
    country: string,
    city: string,
    extra: Partial<MockPerson> = {},
  ): MockPerson => ({
    id,
    names,
    firstName: names[0],
    gender,
    age,
    country,
    city,
    role: 'member',
    status: 'active',
    suspendedUntil: null,
    identityVerified: false,
    photoUrl: null,
    createdAt: at(40 * DAY),
    phoneMasked: '+201•••••••' + id.slice(-2).padStart(2, '0'),
    locale: 'ar',
    lastActiveAt: at(2 * HOUR),
    profile: { about: null, profession: null, maritalStatus: 'never_married', intention: 'within_1y', halalMode: 'guided', languages: ['ar', 'en'] },
    verifications: [{ kind: 'phone', status: 'approved', decidedAt: at(40 * DAY) }],
    ...extra,
  });
  const verified = (d: number) => ({
    identityVerified: true,
    verifications: [
      { kind: 'phone', status: 'approved', decidedAt: at(d) },
      { kind: 'identity', status: 'approved', decidedAt: at(d - DAY) },
    ],
  });

  const people: Record<string, MockPerson> = {};
  const add = (p: MockPerson) => (people[p.id] = p);
  add(person('mod_aisha', ['Aisha (T&S)', 'عائشة (الأمان)'], 'female', 34, 'AE', 'Dubai', { role: 'moderator', profile: null, ...verified(300 * DAY) }));
  add(person('m_mariam', ['Mariam', 'مريم'], 'female', 27, 'EG', 'Cairo', verified(60 * DAY)));
  add(person('m_khalid', ['Khalid', 'خالد'], 'male', 36, 'GB', 'London', { createdAt: at(4 * DAY), profile: { about: 'Engineer working offshore, looking for a wife.', profession: 'Oil rig engineer', maritalStatus: 'divorced', intention: 'within_6m', halalMode: 'private', languages: ['en'] } }));
  add(person('m_fatima', ['Fatima', 'فاطمة'], 'female', 29, 'SA', 'Riyadh', verified(90 * DAY)));
  add(person('m_yusuf', ['Yusuf', 'يوسف'], 'male', 31, 'SA', 'Jeddah', verified(120 * DAY)));
  add(person('m_huda', ['Huda', 'هدى'], 'female', 25, 'JO', 'Amman', verified(30 * DAY)));
  add(person('m_bilal', ['Bilal', 'بلال'], 'male', 19, 'EG', 'Alexandria', { createdAt: at(2 * DAY) }));
  add(person('m_omar', ['Omar', 'عمر'], 'male', 33, 'AE', 'Abu Dhabi', verified(200 * DAY)));
  add(person('m_lina', ['Lina', 'لينا'], 'female', 24, 'MA', 'Casablanca', { createdAt: at(1 * DAY) }));
  add(person('m_noor', ['Noor', 'نور'], 'female', 30, 'GB', 'Birmingham', { ...verified(70 * DAY), locale: 'en' }));
  add(person('m_sami', ['Sami', 'سامي'], 'male', 28, 'DE', 'Berlin', verified(15 * DAY)));
  add(person('m_reem', ['Reem', 'ريم'], 'female', 26, 'QA', 'Doha'));

  const matches: AdminState['matches'] = [
    { id: 'mt_1', aId: 'm_mariam', bId: 'm_khalid', status: 'active' },
    { id: 'mt_2', aId: 'm_fatima', bId: 'm_yusuf', status: 'active' },
    { id: 'mt_3', aId: 'm_huda', bId: 'm_bilal', status: 'active' },
    { id: 'mt_4', aId: 'm_noor', bId: 'm_khalid', status: 'active' },
  ];
  const messages: MockMsg[] = [];
  const convo = (matchId: string, start: number, lines: Array<[string, string, AdminRiskFlag | null]>) =>
    lines.forEach(([senderId, body, risk], i) =>
      messages.push({ id: `${matchId}_m${i}`, matchId, senderId, kind: 'text', body, risk, hidden: false, sentAt: at(start - i * 25 * 60_000) }),
    );
  convo('mt_1', 3 * DAY, [
    ['m_mariam', 'Assalamu alaikum Khalid, how are you?', null],
    ['m_khalid', 'Wa alaikum assalam. I am on the rig until next month, signal is bad.', null],
    ['m_mariam', 'May Allah make it easy. What do you do there?', null],
    ['m_khalid', 'Engineer. Can we talk on WhatsApp? It is easier for me.', 'off_platform'],
    ['m_mariam', 'I prefer to talk here for now.', null],
    ['m_khalid', 'My account is frozen and I need to pay the customs fee. Can you send me money with Western Union? I will return it.', 'money'],
    ['m_mariam', 'No, I am not comfortable with that.', null],
    ['m_khalid', 'Just $300, please, it is urgent', 'money'],
    ['m_mariam', 'I am going to stop here.', null],
  ]);
  convo('mt_2', 2 * DAY, [
    ['m_fatima', 'I think our views on living abroad are too different.', null],
    ['m_yusuf', 'You will regret this. Women like you never get married.', 'aggression'],
    ['m_fatima', 'Please be respectful.', null],
    ['m_yusuf', 'I know where your family lives.', 'aggression'],
  ]);
  convo('mt_3', 20 * HOUR, [
    ['m_bilal', 'Salam! Where do you study?', null],
    ['m_huda', 'I finished university last year. And you?', null],
    ['m_bilal', 'I am still in secondary school, I am 17 but my profile says 19 haha', null],
    ['m_huda', 'You need to be 18 to use this app.', null],
  ]);
  convo('mt_4', 30 * HOUR, [
    ['m_noor', 'Salam, nice to meet you.', null],
    ['m_khalid', 'You are very beautiful, send me more photos', 'explicit'],
    ['m_noor', 'That is not appropriate.', null],
  ]);

  const reports: MockReport[] = [
    { id: 'rp_1', reporterId: 'm_mariam', subjectId: 'm_khalid', category: 'scam', details: 'He asked me to send money with Western Union for a customs fee.', evidenceMessageIds: ['mt_1_m5', 'mt_1_m7'], status: 'open', createdAt: at(2 * DAY), resolvedAt: null, resolvedBy: null },
    { id: 'rp_2', reporterId: 'm_fatima', subjectId: 'm_yusuf', category: 'harassment', details: 'Threatening messages after I ended the conversation.', evidenceMessageIds: ['mt_2_m1', 'mt_2_m3'], status: 'open', createdAt: at(30 * HOUR), resolvedAt: null, resolvedBy: null },
    { id: 'rp_3', reporterId: 'm_huda', subjectId: 'm_bilal', category: 'underage', details: 'He told me he is 17.', evidenceMessageIds: ['mt_3_m2'], status: 'open', createdAt: at(5 * HOUR), resolvedAt: null, resolvedBy: null },
    { id: 'rp_4', reporterId: 'm_omar', subjectId: 'm_lina', category: 'fake_profile', details: 'The photos look like a model from Instagram.', evidenceMessageIds: [], status: 'open', createdAt: at(10 * HOUR), resolvedAt: null, resolvedBy: null },
    { id: 'rp_5', reporterId: 'm_noor', subjectId: 'm_khalid', category: 'inappropriate', details: null, evidenceMessageIds: ['mt_4_m1'], status: 'open', createdAt: at(26 * HOUR), resolvedAt: null, resolvedBy: null },
    { id: 'rp_6', reporterId: 'm_reem', subjectId: 'm_sami', category: 'other', details: 'He did not reply for a week.', evidenceMessageIds: [], status: 'dismissed', createdAt: at(9 * DAY), resolvedAt: at(8 * DAY), resolvedBy: 'mod_aisha' },
    { id: 'rp_7', reporterId: 'm_reem', subjectId: 'm_yusuf', category: 'harassment', details: 'Rude after I passed.', evidenceMessageIds: [], status: 'actioned', createdAt: at(20 * DAY), resolvedAt: at(19 * DAY), resolvedBy: 'mod_aisha' },
  ];
  const actions: MockAction[] = [
    { id: 'ac_1', moderatorId: 'mod_aisha', subjectId: 'm_sami', reportId: 'rp_6', action: 'dismiss', reason: 'Slow replies are not a violation.', meta: { category: 'other' }, createdAt: at(8 * DAY) },
    { id: 'ac_2', moderatorId: 'mod_aisha', subjectId: 'm_yusuf', reportId: 'rp_7', action: 'warn', reason: 'Rude language after a pass.', meta: { category: 'harassment' }, createdAt: at(19 * DAY) },
  ];
  const photos: MockPhoto[] = [
    { id: 'ph_1', accountId: 'm_lina', status: 'pending', createdAt: at(20 * HOUR), position: 0 },
    { id: 'ph_2', accountId: 'm_lina', status: 'pending', createdAt: at(19 * HOUR), position: 1 },
    { id: 'ph_3', accountId: 'm_sami', status: 'pending', createdAt: at(6 * HOUR), position: 0 },
    { id: 'ph_4', accountId: 'm_reem', status: 'pending', createdAt: at(3 * HOUR), position: 0 },
    { id: 'ph_5', accountId: 'm_bilal', status: 'pending', createdAt: at(40 * HOUR), position: 0 },
    { id: 'ph_6', accountId: 'm_omar', status: 'approved', createdAt: at(30 * DAY), position: 0 },
  ];
  return { version: 1, role: 'member', people, matches, messages, reports, photos, actions, notices: [], importedUserReports: 0, seq: 1 };
}

// ───────── Implementation ─────────

export function createMockAdmin(bridge: MockAdminBridge): MockAdmin {
  const { storage, now } = bridge;
  let state: AdminState = seedState(now());
  let persistTimer: ReturnType<typeof setTimeout> | null = null;

  const ready: Promise<void> = (async () => {
    if (!storage) return;
    try {
      const raw = await storage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AdminState;
        if (parsed.version === 1) state = parsed;
      }
    } catch {
      state = seedState(now());
    }
  })();

  function persist() {
    if (!storage) return;
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      storage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => undefined);
    }, 200);
  }

  async function op<T>(fn: () => T, opts: { staff?: boolean } = { staff: true }): Promise<T> {
    await ready;
    if (bridge.latencyMs > 0) await new Promise((r) => setTimeout(r, bridge.latencyMs * (0.6 + Math.random() * 0.8)));
    if (opts.staff !== false && !isStaffRole(state.role)) throw new ApiError(403, 'forbidden', { error: 'forbidden' });
    importUserReports();
    const out = fn();
    persist();
    return out === undefined ? out : (JSON.parse(JSON.stringify(out)) as T);
  }

  /** Zero-padded so ids created in the same millisecond still sort in creation order. */
  const nextId = (prefix: string) => `${prefix}_n${String(state.seq++).padStart(6, '0')}`;
  const nowIso = () => now().toISOString();
  const localName = (p: MockPerson) => (bridge.getLocale() === 'ar' ? p.names[1] : p.names[0]);
  const me = () => bridge.accountId();

  /** Copies reports filed in the demo app (and the conversation they cite) into the console. */
  function importUserReports() {
    const filed = bridge.userReports();
    for (let i = state.importedUserReports; i < filed.length; i++) {
      const r = filed[i]!;
      const myId = me();
      if (!state.people[myId]) {
        const p = bridge.me();
        state.people[myId] = {
          id: myId,
          names: [p?.firstName ?? 'You', p?.firstName ?? 'أنت'],
          firstName: p?.firstName ?? 'You',
          gender: p?.gender ?? null,
          age: null,
          country: p?.country ?? null,
          city: p?.city ?? null,
          role: state.role,
          status: 'active',
          suspendedUntil: null,
          identityVerified: false,
          photoUrl: null,
          createdAt: nowIso(),
          phoneMasked: '+20••••••••••',
          locale: bridge.getLocale(),
          lastActiveAt: nowIso(),
          profile: null,
          verifications: [{ kind: 'phone', status: 'approved', decidedAt: nowIso() }],
        };
      }
      if (!state.people[r.subjectId]) {
        const m = bridge.member(r.subjectId);
        state.people[r.subjectId] = {
          id: r.subjectId,
          names: m?.names ?? ['Member', 'عضو'],
          firstName: m?.names[0] ?? 'Member',
          gender: m?.gender ?? null,
          age: m?.age ?? null,
          country: m?.country ?? null,
          city: m?.city ?? null,
          role: 'member',
          status: 'active',
          suspendedUntil: null,
          identityVerified: m?.verified ?? false,
          photoUrl: null,
          createdAt: new Date(now().getTime() - 30 * DAY).toISOString(),
          phoneMasked: '+20••••••••••',
          locale: 'ar',
          lastActiveAt: nowIso(),
          profile: null,
          verifications: [{ kind: 'phone', status: 'approved', decidedAt: nowIso() }],
        };
      }
      const convo = bridge.conversationWith(r.subjectId);
      if (convo.length > 0) {
        const matchId = convo[0]!.matchId;
        if (!state.matches.some((m) => m.id === matchId)) state.matches.push({ id: matchId, aId: myId, bId: r.subjectId, status: 'active' });
        for (const msg of convo) {
          if (state.messages.some((x) => x.id === msg.id)) continue;
          state.messages.push({
            id: msg.id,
            matchId,
            senderId: msg.senderId === null ? null : msg.senderId === r.subjectId ? r.subjectId : myId,
            kind: msg.kind,
            body: msg.body,
            risk: msg.risk?.warning ?? null,
            hidden: false,
            sentAt: msg.sentAt,
          });
        }
      }
      state.reports.push({
        id: nextId('rp_you'),
        reporterId: myId,
        subjectId: r.subjectId,
        category: r.category,
        details: r.details ?? null,
        evidenceMessageIds: r.messageIds ?? [],
        status: 'open',
        createdAt: nowIso(),
        resolvedAt: null,
        resolvedBy: null,
      });
    }
    state.importedUserReports = filed.length;
  }

  function summary(id: string): AdminAccountSummary {
    const p = state.people[id];
    if (!p) {
      return { id, firstName: null, gender: null, age: null, country: null, city: null, role: 'member', status: 'deleted', suspendedUntil: null, identityVerified: false, photoUrl: null, createdAt: new Date(0).toISOString() };
    }
    // Suspensions end on their own.
    if (p.status === 'suspended' && p.suspendedUntil && new Date(p.suspendedUntil) <= now()) {
      p.status = 'active';
      p.suspendedUntil = null;
    }
    const role = id === me() ? state.role : p.role;
    return {
      id,
      firstName: localName(p),
      gender: p.gender,
      age: p.age,
      country: p.country,
      city: p.city,
      role,
      status: p.status,
      suspendedUntil: p.suspendedUntil,
      identityVerified: p.identityVerified,
      photoUrl: p.photoUrl,
      createdAt: p.createdAt,
    };
  }

  const brief = (r: MockReport): AdminReportBrief => ({ id: r.id, category: r.category, status: r.status, createdAt: r.createdAt, resolvedAt: r.resolvedAt });

  function actionEntry(a: MockAction): ModerationActionEntry {
    const mod = summary(a.moderatorId);
    const sub = summary(a.subjectId);
    return {
      id: a.id,
      action: a.action,
      reason: a.reason,
      meta: a.meta,
      reportId: a.reportId,
      createdAt: a.createdAt,
      moderator: { id: mod.id, firstName: mod.firstName ?? (a.moderatorId === me() ? 'You' : null), role: mod.role },
      subject: { id: sub.id, firstName: sub.firstName, status: sub.status },
    };
  }

  const byNewest = <T extends { createdAt: string; id: string }>(a: T, b: T) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);

  function listItem(r: MockReport): AdminReportListItem {
    const flags = [...new Set(state.messages.filter((m) => m.senderId === r.subjectId && m.risk).map((m) => m.risk!))].sort();
    return {
      id: r.id,
      status: r.status,
      category: r.category,
      priority: reportPriority(r.category),
      details: r.details,
      createdAt: r.createdAt,
      resolvedAt: r.resolvedAt,
      resolvedBy: r.resolvedBy,
      reporter: summary(r.reporterId),
      subject: summary(r.subjectId),
      evidenceCount: r.evidenceMessageIds.length,
      riskFlags: flags,
      priorReportCount: state.reports.filter((x) => x.subjectId === r.subjectId && x.id !== r.id).length,
      priorActionCount: state.actions.filter((a) => a.subjectId === r.subjectId).length,
    };
  }

  function evidence(r: MockReport): AdminEvidenceMessage[] {
    const author = (s: string | null): AdminEvidenceMessage['author'] => (s === null ? 'system' : s === r.subjectId ? 'subject' : s === r.reporterId ? 'reporter' : 'other');
    const toEv = (m: MockMsg, reported: boolean): AdminEvidenceMessage => ({ id: m.id, matchId: m.matchId, author: author(m.senderId), kind: m.kind, body: m.body, risk: m.risk, hidden: m.hidden, sentAt: m.sentAt, reported });
    const allowed = new Set(state.matches.filter((m) => m.aId === r.reporterId || m.bId === r.reporterId).map((m) => m.id));
    const cited = new Set(r.evidenceMessageIds);
    const citedMsgs = state.messages.filter((m) => cited.has(m.id) && allowed.has(m.matchId));
    const out: AdminEvidenceMessage[] = [];
    for (const matchId of [...new Set(citedMsgs.map((m) => m.matchId))]) {
      const convo = state.messages.filter((m) => m.matchId === matchId).sort((a, b) => a.sentAt.localeCompare(b.sentAt));
      const keep = new Set<number>();
      convo.forEach((m, i) => {
        if (!cited.has(m.id)) return;
        for (let j = Math.max(0, i - 3); j <= Math.min(convo.length - 1, i + 3); j++) keep.add(j);
      });
      [...keep].sort((a, b) => a - b).forEach((i) => out.push(toEv(convo[i]!, cited.has(convo[i]!.id))));
    }
    if (out.length > 0) return out;
    const shared = state.matches.find((m) => allowed.has(m.id) && (m.aId === r.subjectId || m.bId === r.subjectId));
    if (!shared) return [];
    return state.messages
      .filter((m) => m.matchId === shared.id)
      .sort((a, b) => a.sentAt.localeCompare(b.sentAt))
      .slice(-8)
      .map((m) => toEv(m, false));
  }

  function detail(r: MockReport): AdminReportDetail {
    return {
      ...listItem(r),
      evidence: evidence(r),
      subjectReports: state.reports.filter((x) => x.subjectId === r.subjectId && x.id !== r.id).sort(byNewest).map(brief),
      subjectActions: state.actions.filter((a) => a.subjectId === r.subjectId).sort(byNewest).map(actionEntry),
    };
  }

  function requireReport(id: string): MockReport {
    const r = state.reports.find((x) => x.id === id);
    if (!r) throw new ApiError(404, 'report_not_found', { error: 'report_not_found' });
    return r;
  }

  function assertCanAct(subjectId: string): MockPerson {
    if (subjectId === me()) throw new ApiError(400, 'cannot_moderate_self', { error: 'cannot_moderate_self' });
    const p = state.people[subjectId];
    if (!p) throw new ApiError(404, 'account_not_found', { error: 'account_not_found' });
    if (isStaffRole(p.role) && state.role !== 'admin') throw new ApiError(403, 'staff_account', { error: 'staff_account' });
    return p;
  }

  function record(a: Omit<MockAction, 'id' | 'createdAt' | 'moderatorId'>) {
    state.actions.push({ ...a, id: nextId('ac'), moderatorId: me(), createdAt: nowIso() });
  }

  const notify = (accountId: string, payload: Record<string, unknown>) => state.notices.push({ accountId, payload, at: nowIso() });

  function accountDetail(id: string): AdminAccountDetail {
    const p = state.people[id];
    if (!p) throw new ApiError(404, 'account_not_found', { error: 'account_not_found' });
    return {
      account: { ...summary(id), phoneMasked: p.phoneMasked, locale: p.locale, lastActiveAt: p.lastActiveAt },
      profile: p.profile,
      verifications: p.verifications,
      reportsAgainst: state.reports.filter((r) => r.subjectId === id).sort(byNewest).map(brief),
      reportsBy: state.reports.filter((r) => r.reporterId === id).sort(byNewest).map(brief),
      actions: state.actions.filter((a) => a.subjectId === id).sort(byNewest).map(actionEntry),
      photos: state.photos.filter((ph) => ph.accountId === id).map((ph) => ({ id: ph.id, status: ph.status, url: null, createdAt: ph.createdAt })),
      activeMatches: state.matches.filter((m) => m.status === 'active' && (m.aId === id || m.bId === id)).length,
    };
  }

  const photoItem = (ph: MockPhoto): AdminPhotoItem => ({
    id: ph.id,
    status: ph.status,
    url: null,
    mime: 'image/jpeg',
    width: 1080,
    height: 1350,
    position: ph.position,
    createdAt: ph.createdAt,
    owner: summary(ph.accountId),
  });

  const api: AdminApi = {
    reports: (q = {}) =>
      op(() => {
        const status = q.status ?? 'open';
        const rows = state.reports.filter((r) => r.status === status && (!q.category || r.category === q.category));
        const items = rows.map(listItem);
        if (status === 'open') {
          const rank: Record<AdminReportPriority, number> = { p0: 0, p1: 1, p2: 2 };
          items.sort((a, b) => rank[a.priority] - rank[b.priority] || a.createdAt.localeCompare(b.createdAt));
        } else {
          items.sort((a, b) => (b.resolvedAt ?? '').localeCompare(a.resolvedAt ?? ''));
        }
        return items;
      }),

    report: (id) => op(() => detail(requireReport(id))),

    resolveReport: (id, body) =>
      op(() => {
        const r = requireReport(id);
        if (r.status !== 'open') throw new ApiError(409, 'report_closed', { error: 'report_closed' });
        const reason = body.reason?.trim() ?? '';
        if (reason.length < 3) throw new ApiError(400, 'reason_required', { error: 'reason_required' });
        const subject = body.action === 'dismiss' ? state.people[r.subjectId] : assertCanAct(r.subjectId);
        if (body.action === 'dismiss' && r.subjectId === me()) throw new ApiError(400, 'cannot_moderate_self', { error: 'cannot_moderate_self' });
        const meta: Record<string, unknown> = { category: r.category };
        let notice: Record<string, unknown> | null = null;
        switch (body.action) {
          case 'warn':
            notice = { type: 'warning' };
            break;
          case 'hide_message': {
            if (!body.messageId) throw new ApiError(400, 'message_required', { error: 'message_required' });
            const msg = state.messages.find((m) => m.id === body.messageId);
            if (!msg || msg.senderId !== r.subjectId) throw new ApiError(400, 'message_not_from_subject', { error: 'message_not_from_subject' });
            msg.hidden = true;
            Object.assign(meta, { messageId: msg.id, matchId: msg.matchId });
            notice = { type: 'message_removed', messageId: msg.id };
            break;
          }
          case 'suspend': {
            if (!body.days || body.days < 1 || body.days > 365) throw new ApiError(400, 'days_required', { error: 'days_required' });
            const until = new Date(now().getTime() + body.days * DAY).toISOString();
            subject!.status = 'suspended';
            subject!.suspendedUntil = until;
            Object.assign(meta, { days: body.days, until });
            notice = { type: 'suspended', until };
            break;
          }
          case 'ban': {
            subject!.status = 'banned';
            subject!.suspendedUntil = null;
            const open = state.matches.filter((m) => m.status === 'active' && (m.aId === r.subjectId || m.bId === r.subjectId));
            open.forEach((m) => (m.status = 'closed'));
            meta.closedMatches = open.length;
            notice = { type: 'banned' };
            break;
          }
          case 'dismiss':
            break;
        }
        r.status = body.action === 'dismiss' ? 'dismissed' : 'actioned';
        r.resolvedAt = nowIso();
        r.resolvedBy = me();
        record({ subjectId: r.subjectId, reportId: r.id, action: body.action, reason, meta });
        if (notice) notify(r.subjectId, notice);
        notify(r.reporterId, { type: 'report_reviewed', reportId: r.id });
        return detail(r);
      }),

    account: (id) => op(() => accountDetail(id)),

    reinstate: (id, body) =>
      op(() => {
        const p = assertCanAct(id);
        summary(id); // lets an expired suspension lapse first
        if (p.status !== 'suspended' && p.status !== 'banned') throw new ApiError(409, 'not_restricted', { error: 'not_restricted' });
        const reason = body.reason?.trim() ?? '';
        if (reason.length < 3) throw new ApiError(400, 'reason_required', { error: 'reason_required' });
        const from: AdminAccountStatus = p.status;
        p.status = 'active';
        p.suspendedUntil = null;
        record({ subjectId: id, reportId: null, action: 'reinstate', reason, meta: { from } });
        notify(id, { type: 'reinstated' });
        return accountDetail(id);
      }),

    photos: (status = 'pending') =>
      op(() =>
        state.photos
          .filter((ph) => ph.status === status)
          .sort((a, b) => (status === 'pending' ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt)))
          .map(photoItem),
      ),

    decidePhoto: (id, body) =>
      op(() => {
        const ph = state.photos.find((x) => x.id === id);
        if (!ph) throw new ApiError(404, 'photo_not_found', { error: 'photo_not_found' });
        const reason = body.reason?.trim() || null;
        if (body.decision === 'reject' && !reason) throw new ApiError(400, 'reason_required', { error: 'reason_required' });
        const previous = ph.status;
        ph.status = body.decision === 'approve' ? 'approved' : 'rejected';
        record({ subjectId: ph.accountId, reportId: null, action: body.decision === 'approve' ? 'approve_photo' : 'reject_photo', reason, meta: { photoId: id, previous } });
        if (ph.status === 'rejected') notify(ph.accountId, { type: 'photo_not_approved', photoId: id });
        return photoItem(ph);
      }),

    audit: (q = {}) =>
      op((): AdminAuditPage => {
        const limit = Math.min(200, Math.max(1, q.limit ?? 50));
        const rows = state.actions
          .filter(
            (a) =>
              (!q.moderatorId || a.moderatorId === q.moderatorId) &&
              (!q.subjectId || a.subjectId === q.subjectId) &&
              (!q.action || a.action === q.action) &&
              (!q.before || a.createdAt < q.before),
          )
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
        const page = rows.slice(0, limit);
        return { entries: page.map(actionEntry), nextCursor: rows.length > limit ? page[page.length - 1]!.createdAt : null };
      }),

    stats: () =>
      op((): AdminStats => {
        const open = state.reports.filter((r) => r.status === 'open');
        const openByPriority: Record<AdminReportPriority, number> = { p0: 0, p1: 0, p2: 0 };
        open.forEach((r) => openByPriority[reportPriority(r.category)]++);
        const since = now().getTime() - 7 * DAY;
        const recent = state.actions.filter((a) => new Date(a.createdAt).getTime() >= since);
        const actionsByKind: AdminStats['actionsByKind'] = {};
        recent.forEach((a) => (actionsByKind[a.action] = (actionsByKind[a.action] ?? 0) + 1));
        const statuses = Object.keys(state.people).map((id) => summary(id).status);
        return {
          openReports: open.length,
          openByPriority,
          pendingPhotos: state.photos.filter((p) => p.status === 'pending').length,
          actionsLast7Days: recent.length,
          actionsByKind,
          suspendedAccounts: statuses.filter((s) => s === 'suspended').length,
          bannedAccounts: statuses.filter((s) => s === 'banned').length,
        };
      }),

    dev: {
      setDemoRole: (role) =>
        op(
          () => {
            state.role = role;
          },
          { staff: false },
        ),
    },
  };

  return {
    api,
    role: () => state.role,
    reset: async () => {
      await ready;
      state = seedState(now());
      if (storage) await storage.removeItem(STORAGE_KEY);
    },
  };
}
