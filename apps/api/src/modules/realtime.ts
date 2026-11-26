import { Injectable } from '@nestjs/common';
import type { RealtimeEvent } from '@halal-meet/core';

type Listener = (event: RealtimeEvent) => void;

/**
 * In-process pub/sub for the `GET /events` Server-Sent Events stream. One process only: when the API runs on
 * several instances this becomes Redis pub/sub (spec 05 lists Redis), with the same `publish` signature.
 */
@Injectable()
export class RealtimeHub {
  private readonly listeners = new Map<string, Set<Listener>>();

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
}
