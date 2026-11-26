import { describe, expect, it } from 'vitest';
import {
  DevOtpProvider,
  OtpRateLimitedError,
  OtpUnavailableError,
  TwilioVerifyProvider,
  UnconfiguredOtpProvider,
  createOtpProvider,
} from '../src/modules/otp';

type Call = { url: string; body: URLSearchParams; auth: string };

/** Fake fetch answering like Twilio Verify. */
function fakeTwilio(respond: (url: string, body: URLSearchParams) => { status: number; json?: unknown }) {
  const calls: Call[] = [];
  const fetchImpl = async (url: string, init: { headers: Record<string, string>; body: string }) => {
    const body = new URLSearchParams(init.body);
    calls.push({ url, body, auth: init.headers.Authorization! });
    const r = respond(url, body);
    return { status: r.status, json: async () => r.json ?? {} };
  };
  return { calls, provider: new TwilioVerifyProvider('AC123', 'secret', 'VA456', fetchImpl) };
}

describe('Twilio Verify OTP provider', () => {
  it('sends a verification on the requested channel with basic auth', async () => {
    const t = fakeTwilio(() => ({ status: 201, json: { status: 'pending' } }));
    await t.provider.send('+201000000002', 'whatsapp');
    expect(t.calls[0]!.url).toBe('https://verify.twilio.com/v2/Services/VA456/Verifications');
    expect(t.calls[0]!.body.get('To')).toBe('+201000000002');
    expect(t.calls[0]!.body.get('Channel')).toBe('whatsapp');
    expect(t.calls[0]!.auth).toBe(`Basic ${Buffer.from('AC123:secret').toString('base64')}`);
  });

  it('approves only an approved check; expired or wrong codes are false', async () => {
    const t = fakeTwilio((_url, body) =>
      body.get('Code') === '123456' ? { status: 200, json: { status: 'approved' } } : body.get('Code') === '000000' ? { status: 404 } : { status: 200, json: { status: 'pending' } },
    );
    expect(await t.provider.check('+20100', '123456')).toBe(true);
    expect(await t.provider.check('+20100', '999999')).toBe(false); // wrong code → still pending
    expect(await t.provider.check('+20100', '000000')).toBe(false); // no pending verification
    expect(t.calls[0]!.url).toMatch(/\/VerificationCheck$/);
  });

  it('maps Twilio rate limits and outages to clear errors', async () => {
    const limited = fakeTwilio(() => ({ status: 429, json: { code: 60203, message: 'Max send attempts reached' } }));
    await expect(limited.provider.send('+20100', 'sms')).rejects.toBeInstanceOf(OtpRateLimitedError);
    const down = fakeTwilio(() => ({ status: 500, json: {} }));
    await expect(down.provider.send('+20100', 'sms')).rejects.toBeInstanceOf(OtpUnavailableError);
    await expect(down.provider.check('+20100', '1')).rejects.toBeInstanceOf(OtpUnavailableError);
  });
});

describe('OTP provider selection', () => {
  it('uses the dev code outside production', async () => {
    const p = createOtpProvider({ NODE_ENV: 'development' });
    expect(p).toBeInstanceOf(DevOtpProvider);
    expect(await p.check('+20100', '000000')).toBe(true);
    expect(await p.check('+20100', '111111')).toBe(false);
  });

  it('never accepts the dev code in production', async () => {
    expect(() => createOtpProvider({ NODE_ENV: 'production', OTP_PROVIDER: 'dev' })).toThrow(/not allowed in production/);
    const p = createOtpProvider({ NODE_ENV: 'production' });
    expect(p).toBeInstanceOf(UnconfiguredOtpProvider);
    expect(await p.check('+20100', '000000')).toBe(false);
    await expect(p.send('+20100', 'sms')).rejects.toBeInstanceOf(OtpUnavailableError);
  });

  it('requires all Twilio settings', () => {
    expect(() => createOtpProvider({ NODE_ENV: 'production', OTP_PROVIDER: 'twilio', TWILIO_ACCOUNT_SID: 'AC' })).toThrow(/TWILIO_AUTH_TOKEN/);
    const p = createOtpProvider({ NODE_ENV: 'production', OTP_PROVIDER: 'twilio', TWILIO_ACCOUNT_SID: 'AC', TWILIO_AUTH_TOKEN: 't', TWILIO_VERIFY_SERVICE_SID: 'VA' });
    expect(p.name).toBe('twilio');
  });
});
