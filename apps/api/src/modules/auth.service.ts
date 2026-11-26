import { Inject, Injectable } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import { CONFIG, type AppConfig } from '../config';
import { OTP_PROVIDER, type OtpChannel, type OtpProvider } from './otp';

export { DEV_OTP_CODE } from './otp';

@Injectable()
export class AuthService {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(OTP_PROVIDER) private readonly otp: OtpProvider,
  ) {}

  /** Sends a sign-in code through the configured provider (dev: fixed code, logged). */
  async issueCode(phone: string, channel: OtpChannel = 'sms'): Promise<void> {
    await this.otp.send(phone, channel);
  }

  async verifyCode(phone: string, code: string): Promise<boolean> {
    return this.otp.check(phone, code);
  }

  sign(accountId: string): string {
    return jwt.sign({ sub: accountId }, this.config.jwtSecret, { algorithm: 'HS256', expiresIn: '180d' });
  }

  verify(token: string): string | null {
    try {
      const payload = jwt.verify(token, this.config.jwtSecret, { algorithms: ['HS256'] });
      if (typeof payload === 'string' || !payload.sub) return null;
      return String(payload.sub);
    } catch {
      return null;
    }
  }
}
