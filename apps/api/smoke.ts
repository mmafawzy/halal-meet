/** Manual end-to-end smoke check against a running dev server (not part of `pnpm test`). */
const B = process.env.API_BASE ?? 'http://localhost:3011';
const PHONE = process.env.SMOKE_PHONE ?? '+201000000001';

async function main(): Promise<void> {
  const j = async (m: string, p: string, b?: unknown, token?: string) => {
    const r = await fetch(B + p, {
      method: m,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: b === undefined ? undefined : JSON.stringify(b),
    });
    return { status: r.status, body: (await r.json().catch(() => null)) as any };
  };

  const verify = await j('POST', '/auth/otp/verify', { phone: PHONE, code: '000000' });
  console.log('otp/verify', verify.status, verify.body.isNew);
  const token: string = verify.body.token;

  const me = await j('GET', '/me', undefined, token);
  console.log('me', me.status, me.body.profile?.firstName, 'strength', me.body.profile?.profileStrength, 'onboarding', me.body.onboardingComplete, 'usage', me.body.usage);

  const p1 = await j('GET', '/feed', undefined, token);
  const ids1: string[] = p1.body.items.filter((i: any) => i.type === 'profile').map((i: any) => i.card.id);
  console.log('feed page1', p1.status, ids1.length, 'slots', [...new Set(p1.body.items.filter((i: any) => i.type === 'profile').map((i: any) => i.slot))], 'scope', p1.body.scope, 'newSince', p1.body.newSinceLastVisit);
  console.log('  inline', p1.body.items.filter((i: any) => i.type === 'inline').map((i: any) => i.kind));

  const cursor2 = p1.body.nextCursor as string | null;
  const p2 = cursor2
    ? await j('GET', `/feed?cursor=${encodeURIComponent(cursor2)}`, undefined, token)
    : { status: 200, body: { items: [], endOfPool: true, passportSuggestions: [], scope: p1.body.scope } };
  const ids2: string[] = p2.body.items.filter((i: any) => i.type === 'profile').map((i: any) => i.card.id);
  console.log('feed page2', p2.status, ids2.length, 'dupes', ids1.filter((x) => ids2.includes(x)).length, 'endOfPool', p2.body.endOfPool, 'suggestions', p2.body.passportSuggestions.slice(0, 3));

  const tp = await j('GET', '/top-picks', undefined, token);
  console.log('top-picks', tp.status, tp.body.cards.length, tp.body.cards.map((c: any) => `${c.firstName}:${c.compatibility.displayPct}`), tp.body.refreshesAt);

  const inb = await j('GET', '/interests/incoming', undefined, token);
  console.log('incoming', inb.status, 'count', inb.body.count, 'high', inb.body.highCompatCount, 'cards', inb.body.cards.length, inb.body.cards.map((c: any) => `${c.firstName}:${c.level}`));

  const ms = await j('GET', '/matches', undefined, token);
  console.log('matches', ms.status, ms.body.map((m: any) => `${m.other.firstName} stage${m.stage} topics${m.topicsCovered}/${m.topicsTotal} yourMove:${m.yourMove} ${m.status}`));
  const mid = ms.body[0]?.matchId;
  if (mid) {
    const msg = await j('GET', `/matches/${mid}/messages`, undefined, token);
    console.log('messages', msg.status, msg.body.map((m: any) => `${m.kind}${m.senderId ? '' : '(system)'}: ${m.body.slice(0, 40)} answers=${JSON.stringify(m.topicAnswers)}`));
    const sent = await j('POST', `/matches/${mid}/messages`, { kind: 'text', body: 'Please send money via Western Union, my friend.' }, token);
    console.log('send risky', sent.status, 'risk', sent.body.risk);
    const card = await j('POST', `/matches/${mid}/messages`, { kind: 'topic_card', topicKey: 'finances' }, token);
    console.log('send topic card', card.status, card.body.kind, card.body.topicKey, card.body.topicAnswers);
    const ans = await j('POST', `/matches/${mid}/messages/${card.body.id}/answer`, { value: 'joint' }, token);
    console.log('answer 1/2', ans.status, ans.body.topicAnswers);
  }

  const prof = await j('GET', `/profiles/${ids1[0]}`, undefined, token);
  console.log('profile', prof.status, prof.body.firstName, prof.body.compatibility.displayPct, 'keyFacts', prof.body.keyFacts.length, prof.body.keyFacts.slice(0, 2));

  const countries = await j('GET', '/countries', undefined, token);
  console.log('countries', countries.status, countries.body.map((c: any) => `${c.code}:${c.status}:${c.verifiedProfiles}`).join(' '));

  const pp = await j('GET', '/passport', undefined, token);
  console.log('passport(free)', pp.status, pp.body.entitlements, 'suggestions', pp.body.suggestions.slice(0, 3));

  const addPass = await j('POST', '/passport/destinations', { country: 'AE', purpose: 'relocate' }, token);
  console.log('passport add as free user (expect 403)', addPass.status, addPass.body);

  const report = await j('POST', '/reports', { subjectId: ids1[0], category: 'scam', details: 'test' }, token);
  const block = await j('POST', '/blocks', { subjectId: ids1[1] }, token);
  console.log('reports/blocks', report.status, block.status);

  const grant = await j('POST', '/billing/dev/grant', { sku: 'gold_monthly' }, token);
  console.log('dev grant gold', grant.status, grant.body.entitlements?.tier, grant.body.entitlements?.passport);
  const addPass2 = await j('POST', '/passport/destinations', { country: 'AE', purpose: 'relocate' }, token);
  console.log('passport add as gold', addPass2.status, addPass2.body);
  const feedAfter = await j('GET', '/feed', undefined, token);
  console.log('feed scope after passport', feedAfter.status, feedAfter.body.scope.kind, feedAfter.body.scope.countries.length);
  const passportFn = await j('GET', '/passport', undefined, token);
  console.log('passport destinations', passportFn.body.destinations.map((d: any) => `${d.country}/${d.purpose}/${d.status}`));
  const del = await j('DELETE', `/passport/destinations/${addPass2.body.id}`, undefined, token);
  console.log('delete destination', del.status);
  const revoke = await j('POST', '/billing/dev/grant', { sku: 'free' }, token);
  console.log('cancel', revoke.status, revoke.body.entitlements?.tier);
}

void main();
