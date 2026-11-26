import { describe, expect, it } from 'vitest';
import type { RealtimeEvent } from '@halal-meet/core';
import { LocalBus, RealtimeHub, createRealtimeBus, type RealtimeBus } from '../src/modules/realtime';

/** A broker every "instance" connects to — what Redis pub/sub does across API servers. */
function sharedBroker() {
  const handlers: Array<(accountId: string, event: RealtimeEvent) => void> = [];
  const bus = (): RealtimeBus => ({
    kind: 'redis',
    publish: (accountId, event) => handlers.forEach((h) => h(accountId, event)),
    onMessage: (h) => void handlers.push(h),
    close: async () => {},
  });
  return { bus };
}

const event = { type: 'notification', unread: 1 } as unknown as RealtimeEvent;

describe('realtime hub', () => {
  it('delivers an event raised on one instance to a connection on another', () => {
    const broker = sharedBroker();
    const a = new RealtimeHub(broker.bus());
    const b = new RealtimeHub(broker.bus());
    const gotOnB: RealtimeEvent[] = [];
    const gotOnA: RealtimeEvent[] = [];
    b.subscribe('sara', (e) => gotOnB.push(e));
    a.subscribe('ahmed', (e) => gotOnA.push(e));

    a.publish('sara', event);
    expect(gotOnB).toEqual([event]);
    expect(gotOnA).toEqual([]); // only the addressed account
  });

  it('works in one process with the local bus, and unsubscribes cleanly', () => {
    const hub = new RealtimeHub(new LocalBus());
    const got: RealtimeEvent[] = [];
    const off = hub.subscribe('sara', (e) => got.push(e));
    expect(hub.connections('sara')).toBe(1);
    hub.publish('sara', event);
    off();
    hub.publish('sara', event);
    expect(got).toHaveLength(1);
    expect(hub.connections('sara')).toBe(0);
  });

  it('isolates a broken connection from the others', () => {
    const hub = new RealtimeHub();
    const got: RealtimeEvent[] = [];
    hub.subscribe('sara', () => {
      throw new Error('socket closed');
    });
    hub.subscribe('sara', (e) => got.push(e));
    expect(() => hub.publish('sara', event)).not.toThrow();
    expect(got).toEqual([event]);
  });

  it('uses Redis only when REDIS_URL is set', () => {
    expect(createRealtimeBus({}).kind).toBe('local');
  });
});
