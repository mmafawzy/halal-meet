import { Inject, Injectable } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import { CONFIG, type AppConfig } from '../config';

export const DEV_OTP_CODE = '000000';

@Injectable()
export class AuthService {
  constructor(@Inject(CONFIG) private readonly config: AppConfig) {}

  /** Non-production always uses the fixed dev code (logged). */
  issueCode(phone: string): string {
    if (this.config.isProduction) {
      throw new Error('A real SMS/WhatsApp OTP provider is not wired up yet (see README: deviations).');
    }
    // eslint-disable-next-line no-console
    console.log(`[otp] code for ${phone}: ${DEV_OTP_CODE}`);
    return DEV_OTP_CODE;
  }

  verifyCode(phone: string, code: string): boolean {
    if (this.config.isProduction) return false;
    void phone;
    return code === DEV_OTP_CODE;
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
