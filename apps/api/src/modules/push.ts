/**
 * Push delivery drivers. `NotificationsService` decides *whether* to push (preferences, quiet hours); a driver
 * only delivers. The Expo driver is used when `EXPO_ACCESS_TOKEN` is set (or `PUSH_DRIVER=expo`) outside tests;
 * otherwise the log driver records messages in memory (tests read `sent`) and logs them in development.
 */

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  /** Deep link + ids; the app routes taps with `data.url`. */
  data: Record<string, unknown>;
  /** Collapses pushes for one conversation on the device. */
  threadId?: string;
}

export interface PushTicket {
  token: string;
  ok: boolean;
  /** The token is no longer valid and should be forgotten. */
  unregistered?: boolean;
  error?: string;
}

export interface PushDriver {
  readonly name: string;
  /** When true the caller awaits delivery (deterministic in tests); remote drivers run in the background. */
  readonly inline: boolean;
  send(messages: PushMessage[]): Promise<PushTicket[]>;
}

export const PUSH_DRIVER = 'PUSH_DRIVER';

export class LogPushDriver implements PushDriver {
  readonly name = 'log';
  readonly inline = true;
  readonly sent: PushMessage[] = [];
  constructor(private readonly quiet = false) {}

  async send(messages: PushMessage[]): Promise<PushTicket[]> {
    this.sent.push(...messages);
    if (!this.quiet) {
      for (const m of messages) {
        // eslint-disable-next-line no-console
        console.log(`[push:log] → ${m.to.slice(0, 24)}… ${m.title} — ${m.body} ${String(m.data.url ?? '')}`);
      }
    }
    return messages.map((m) => ({ token: m.to, ok: true }));
  }
}

/** Expo Push API (https://docs.expo.dev/push-notifications/sending-notifications/). */
export class ExpoPushDriver implements PushDriver {
  readonly name = 'expo';
  readonly inline = false;
  constructor(
    private readonly accessToken: string | null,
    private readonly endpoint = 'https://exp.host/--/api/v2/push/send',
  ) {}

  async send(messages: PushMessage[]): Promise<PushTicket[]> {
    const out: PushTicket[] = [];
    // Expo accepts up to 100 messages per request.
    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100);
      try {
        const res = await fetch(this.endpoint, {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            ...(this.accessToken ? { authorization: `Bearer ${this.accessToken}` } : {}),
          },
          body: JSON.stringify(
            chunk.map((m) => ({
              to: m.to,
              title: m.title,
              body: m.body,
              data: m.data,
              sound: 'default',
              channelId: 'default',
              ...(m.threadId ? { threadId: m.threadId, collapseId: m.threadId } : {}),
            })),
          ),
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) {
          chunk.forEach((m) => out.push({ token: m.to, ok: false, error: `http_${res.status}` }));
          continue;
        }
        const json = (await res.json()) as { data?: Array<{ status: 'ok' | 'error'; message?: string; details?: { error?: string } }> };
        chunk.forEach((m, j) => {
          const ticket = json.data?.[j];
          if (ticket?.status === 'ok') out.push({ token: m.to, ok: true });
          else
            out.push({
              token: m.to,
              ok: false,
              unregistered: ticket?.details?.error === 'DeviceNotRegistered',
              error: ticket?.details?.error ?? ticket?.message ?? 'unknown',
            });
        });
      } catch (e) {
        chunk.forEach((m) => out.push({ token: m.to, ok: false, error: (e as Error).message }));
      }
    }
    return out;
  }
}

export function createPushDriver(env: NodeJS.ProcessEnv = process.env): PushDriver {
  const isTest = env.NODE_ENV === 'test' || !!env.VITEST;
  const wantsExpo = env.PUSH_DRIVER === 'expo' || (!!env.EXPO_ACCESS_TOKEN && env.PUSH_DRIVER !== 'log');
  if (!isTest && wantsExpo) return new ExpoPushDriver(env.EXPO_ACCESS_TOKEN || null);
  return new LogPushDriver(isTest);
}
