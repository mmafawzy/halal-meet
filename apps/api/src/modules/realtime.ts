import { Inject, Injectable, Logger, Optional, type OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';
import type { RealtimeEvent } from '@halal-meet/core';

type Listener = (event: RealtimeEvent) => void;

/** Carries events between API instances. Every instance receives every message and keeps the ones for its own connections. */
export interface RealtimeBus {
  readonly kind: 'local' | 'redis';
  publish(accountId: string, event: RealtimeEvent): void;
  /** Registers the single handler (the hub) that delivers incoming messages to local connections. */
  onMessage(handler: (accountId: string, event: RealtimeEvent) => void): void;
  close(): Promise<void>;
}

export const REALTIME_BUS = 'REALTIME_BUS';
const CHANNEL = 'halal-meet:realtime';

/** One process: deliver straight to the local handler. */
export class LocalBus implements RealtimeBus {
  readonly kind = 'local' as const;
  private handler: ((accountId: string, event: RealtimeEvent) => void) | null = null;
  publish(accountId: string, event: RealtimeEvent): void {
    this.handler?.(accountId, event);
  }
  onMessage(handler: (accountId: string, event: RealtimeEvent) => void): void {
    this.handler = handler;
  }
  async close(): Promise<void> {}
}

/** Several instances: Redis pub/sub on one channel (a subscribing connection cannot publish, hence two). */
export class RedisBus implements RealtimeBus {
  readonly kind = 'redis' as const;
  private readonly log = new Logger('RealtimeRedis');
  private readonly pub: Redis;
  private readonly sub: Redis;

  constructor(url: string) {
    this.pub = new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: false });
    this.sub = new Redis(url, { maxRetriesPerRequest: null, lazyConnect: false });
    for (const c of [this.pub, this.sub]) c.on('error', (e: Error) => this.log.warn(`redis: ${e.message}`));
  }

  publish(accountId: string, event: RealtimeEvent): void {
    void this.pub.publish(CHANNEL, JSON.stringify({ accountId, event })).catch((e: Error) => this.log.warn(`publish failed: ${e.message}`));
  }

  onMessage(handler: (accountId: string, event: RealtimeEvent) => void): void {
    void this.sub.subscribe(CHANNEL).catch((e: Error) => this.log.error(`subscribe failed: ${e.message}`));
    this.sub.on('message', (channel: string, raw: string) => {
      if (channel !== CHANNEL) return;
      try {
        const msg = JSON.parse(raw) as { accountId?: unknown; event?: RealtimeEvent };
        if (typeof msg.accountId === 'string' && msg.event) handler(msg.accountId, msg.event);
      } catch {
        // Ignore malformed messages; they cannot come from this app.
      }
    });
  }

  async close(): Promise<void> {
    await Promise.allSettled([this.sub.quit(), this.pub.quit()]);
  }
}

/** `REDIS_URL` set → Redis pub/sub (needed with more than one API instance); otherwise in-process. */
export function createRealtimeBus(env: NodeJS.ProcessEnv = process.env): RealtimeBus {
  return env.REDIS_URL ? new RedisBus(env.REDIS_URL) : new LocalBus();
}

/**
 * Pub/sub for the `GET /events` Server-Sent Events stream. Connections subscribe on the instance they are
 * connected to; `publish` goes through the bus so an event raised on any instance reaches the right connection.
 */
@Injectable()
export class RealtimeHub implements OnApplicationShutdown {
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly bus: RealtimeBus;

  constructor(@Optional() @Inject(REALTIME_BUS) bus?: RealtimeBus) {
    this.bus = bus ?? new LocalBus();
    this.bus.onMessage((accountId, event) => this.dispatch(accountId, event));
  }

  get transport(): RealtimeBus['kind'] {
    return this.bus.kind;
  }

  subscribe(accountId: string, listener: Listener): () => void {
    let set = this.listeners.get(accountId);
    if (!set) {
      set = new Set();
      this.listeners.set(accountId, set);
    }
    set.add(listener);
    return () => {
      const s = this.listeners.get(accountId);
      if (!s) return;
      s.delete(listener);
      if (s.size === 0) this.listeners.delete(accountId);
    };
  }

  publish(accountId: string, event: RealtimeEvent): void {
    this.bus.publish(accountId, event);
  }

  /** Delivers to this instance's connections only. */
  private dispatch(accountId: string, event: RealtimeEvent): void {
    for (const l of this.listeners.get(accountId) ?? []) {
      try {
        l(event);
      } catch {
        // A broken connection must never affect the caller.
      }
    }
  }

  connections(accountId: string): number {
    return this.listeners.get(accountId)?.size ?? 0;
  }

  async onApplicationShutdown(): Promise<void> {
    await this.bus.close();
  }
}
