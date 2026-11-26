import type { Message, ReportBody } from '@halal-meet/core';
import { describe, expect, it } from 'vitest';

import { ApiError } from '../types';
import { createMockAdmin } from './admin';

/** The admin mock over a stub of the main mock backend (one seeded member and a short conversation). */
function setupAdmin() {
  const reports: ReportBody[] = [];
  const convo: Message[] = [
    { id: 'msg_1', matchId: 'match_1', senderId: 'seed_1', kind: 'text', body: 'Send me money', topicKey: null, topicAnswers: null, sentAt: '2026-11-19T10:00:00Z', risk: { warning: 'money' } },
  ];
  const admin = createMockAdmin({
    latencyMs: 0,
    now: () => new Date('2026-11-20T10:00:00Z'),
    getLocale: () => 'en',
    accountId: () => 'acc_demo',
    me: () => ({ firstName: 'Sara', gender: 'female', country: 'EG', city: 'Cairo' }),
    userReports: () => reports,
    member: (id) => (id === 'seed_1' ? { names: ['Tariq', 'طارق'], gender: 'male', age: 31, country: 'EG', city: 'Giza', verified: false } : null),
    conversationWith: (id) => (id === 'seed_1' ? convo : []),
  });
  return { admin, api: admin.api, reports };
}

describe('mock moderation console', () => {
  it('is staff only until the demo role is switched on, and reports the role on /me', async () => {
    const { admin, api } = setupAdmin();
    expect(admin.role()).toBe('member');
    await expect(api.reports()).rejects.toMatchObject({ status: 403, code: 'forbidden' });
    await api.dev!.setDemoRole('moderator');
    expect(admin.role()).toBe('moderator');
    const queue = await api.reports();
    expect(queue.length).toBeGreaterThan(3);
    expect(queue[0]!.priority).toBe('p0');
  });

  it('resolves reports with their effects, reinstates, decides photos and logs everything', async () => {
    const { api } = setupAdmin();
    await api.dev!.setDemoRole('moderator');
    const before = await api.stats();
    const scam = (await api.reports({ category: 'scam' }))[0]!;
    const detail = await api.report(scam.id);
    expect(detail.evidence.some((m) => m.reported && m.author === 'subject')).toBe(true);
    expect(detail.riskFlags).toContain('money');

    const hidden = detail.evidence.find((m) => m.reported)!;
    const other = (await api.reports({ category: 'inappropriate' }))[0]!;
    await expect(api.resolveReport(other.id, { action: 'hide_message', reason: 'x' })).rejects.toBeInstanceOf(ApiError);
    const afterHide = await api.resolveReport(scam.id, { action: 'hide_message', reason: 'Money request', messageId: hidden.id });
    expect(afterHide.status).toBe('actioned');
    expect(afterHide.evidence.find((m) => m.id === hidden.id)!.hidden).toBe(true);

    const banned = await api.resolveReport(other.id, { action: 'ban', reason: 'Repeat offender' });
    expect(banned.subject.status).toBe('banned');
    await expect(api.resolveReport(other.id, { action: 'warn', reason: 'again' })).rejects.toMatchObject({ code: 'report_closed' });

    const account = await api.reinstate(banned.subject.id, { reason: 'Appeal accepted' });
    expect(account.account.status).toBe('active');
    expect(account.actions.map((a) => a.action).slice(0, 2)).toEqual(['reinstate', 'ban']);

    const [photo] = await api.photos('pending');
    await expect(api.decidePhoto(photo!.id, { decision: 'reject' })).rejects.toMatchObject({ code: 'reason_required' });
    await api.decidePhoto(photo!.id, { decision: 'reject', reason: 'Not a clear photo' });

    const audit = await api.audit();
    expect(audit.entries.slice(0, 4).map((e) => e.action)).toEqual(['reject_photo', 'reinstate', 'ban', 'hide_message']);
    const after = await api.stats();
    expect(after.openReports).toBe(before.openReports - 2);
    expect(after.pendingPhotos).toBe(before.pendingPhotos - 1);
    expect(after.actionsLast7Days).toBe(before.actionsLast7Days + 4);
  });

  it('imports reports filed in the demo app, with the cited conversation', async () => {
    const { api, reports } = setupAdmin();
    reports.push({ subjectId: 'seed_1', category: 'scam', details: 'Asked for money', messageIds: ['msg_1'] });
    await api.dev!.setDemoRole('admin');
    const mine = (await api.reports({ category: 'scam' })).find((r) => r.subject.id === 'seed_1')!;
    expect(mine).toMatchObject({ details: 'Asked for money', reporter: { firstName: 'Sara' }, subject: { firstName: 'Tariq' }, riskFlags: ['money'] });
    const detail = await api.report(mine.id);
    expect(detail.evidence).toEqual([expect.objectContaining({ id: 'msg_1', author: 'subject', reported: true })]);
    // Imported once only.
    expect((await api.reports({ category: 'scam' })).filter((r) => r.subject.id === 'seed_1')).toHaveLength(1);
  });
});
