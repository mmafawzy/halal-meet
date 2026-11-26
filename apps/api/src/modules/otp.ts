/**
 * One-time sign-in codes. The provider owns code generation, storage, expiry and delivery, so the API stays
 * stateless and works the same on any number of instances.
 *
 * Env `OTP_PROVIDER`:
 * - `dev` (default outside production): fixed code 000000, logged. Refused in production.
 * - `twilio`: Twilio Verify — TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID. Supports SMS and
 *   WhatsApp (WhatsApp needs a sender configured on the Verify service). Twilio applies per-number rate limits and
 *   fraud protection (enable Fraud Guard / Geo permissions on the service).
 */
export type OtpChannel = 'sms' | 'whatsapp';

export interface OtpProvider {
  readonly name: string;
  send(phone: string, channel: OtpChannel): Promise<void>;
  /** True only for a correct, unexpired code. */
  check(phone: string, code: string): Promise<boolean>;
}

export const OTP_PROVIDER = 'OTP_PROVIDER';
export const DEV_OTP_CODE = '000000';

export class OtpUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OtpUnavailableError';
  }
}

export class DevOtpProvider implements OtpProvider {
  readonly name = 'dev';
  async send(phone: string, channel: OtpChannel): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`[otp] ${channel} code for ${phone}: ${DEV_OTP_CODE}`);
  }
  async check(_phone: string, code: string): Promise<boolean> {
    return code === DEV_OTP_CODE;
  }
}

/** Used in production when no provider is configured: sign-in fails clearly instead of accepting the dev code. */
export class UnconfiguredOtpProvider implements OtpProvider {
  readonly name = 'none';
  async send(): Promise<void> {
    throw new OtpUnavailableError('No OTP provider configured: set OTP_PROVIDER=twilio and the TWILIO_* variables.');
  }
  async check(): Promise<boolean> {
    return false;
  }
}

type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ status: number; json(): Promise<unknown> }>;

export class TwilioVerifyProvider implements OtpProvider {
  readonly name = 'twilio';
  private readonly base: string;
  private readonly auth: string;

  constructor(
    accountSid: string,
    authToken: string,
    serviceSid: string,
    private readonly fetchImpl: Fetch = fetch as unknown as Fetch,
  ) {
    this.base = `https://verify.twilio.com/v2/Services/${encodeURIComponent(serviceSid)}`;
    this.auth = `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`;
  }

  private post(path: string, form: Record<string, string>) {
    return this.fetchImpl(`${this.base}${path}`, {
      method: 'POST',
      headers: { Authorization: this.auth, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
    });
  }

  async send(phone: string, channel: OtpChannel): Promise<void> {
    const res = await this.post('/Verifications', { To: phone, Channel: channel });
    if (res.status >= 400) {
      const body = (await res.json().catch(() => ({}))) as { code?: number; message?: string };
      // 60203 = max send attempts reached for this number.
      if (body.code === 60203 || res.status === 429) throw new OtpRateLimitedError();
      throw new OtpUnavailableError(`Twilio Verify send failed (${res.status} ${body.code ?? ''} ${body.message ?? ''})`.trim());
    }
  }

  async check(phone: string, code: string): Promise<boolean> {
    const res = await this.post('/VerificationCheck', { To: phone, Code: code });
    // 404 = no pending verification (expired, already used or never sent).
    if (res.status === 404) return false;
    if (res.status >= 400) {
      const body = (await res.json().catch(() => ({}))) as { code?: number };
      if (body.code === 60202) return false; // max check attempts reached
      throw new OtpUnavailableError(`Twilio Verify check failed (${res.status})`);
    }
    const body = (await res.json()) as { status?: string };
    return body.status === 'approved';
  }
}

export class OtpRateLimitedError extends Error {
  constructor() {
    super('Too many codes requested for this number');
    this.name = 'OtpRateLimitedError';
  }
}

export function createOtpProvider(env: NodeJS.ProcessEnv = process.env): OtpProvider {
  const isProduction = (env.NODE_ENV ?? 'development') === 'production';
  const name = (env.OTP_PROVIDER ?? (isProduction ? '' : 'dev')).toLowerCase();
  if (name === 'twilio') {
    const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_VERIFY_SERVICE_SID: service } = env;
    if (!sid || !token || !service) throw new Error('OTP_PROVIDER=twilio needs TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_VERIFY_SERVICE_SID');
    return new TwilioVerifyProvider(sid, token, service);
  }
  if (name === 'dev') {
    if (isProduction) throw new Error('OTP_PROVIDER=dev is not allowed in production');
    return new DevOtpProvider();
  }
  if (name === '') return new UnconfiguredOtpProvider();
  throw new Error(`Unknown OTP_PROVIDER: ${name}`);
}
