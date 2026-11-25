import type { CountryStatus } from '@halal-meet/core';

export interface AppConfig {
  nodeEnv: string;
  isProduction: boolean;
  port: number;
  jwtSecret: string;
  databaseUrl: string | null;
  /** PGlite data directory; null = in-memory. */
  pgliteDir: string | null;
  countryStatusOverrides: Record<string, CountryStatus>;
}

/** Parses "EG:open,SA:open,JO:growing". */
export function parseCountryOverrides(raw: string | undefined): Record<string, CountryStatus> {
  const out: Record<string, CountryStatus> = {};
  for (const part of (raw ?? '').split(',')) {
    const [code, status] = part.split(':').map((s) => s.trim());
    if (code && (status === 'open' || status === 'growing')) out[code.toUpperCase()] = status;
  }
  return out;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = env.NODE_ENV ?? 'development';
  const isProduction = nodeEnv === 'production';
  if (isProduction && !env.JWT_SECRET) throw new Error('JWT_SECRET must be set in production');
  return {
    nodeEnv,
    isProduction,
    port: Number(env.PORT ?? 3000),
    jwtSecret: env.JWT_SECRET ?? 'halal-meet-dev-secret-change-me',
    databaseUrl: env.DATABASE_URL || null,
    pgliteDir: env.PGLITE_DIR === 'memory' ? null : (env.PGLITE_DIR ?? '.data/pglite'),
    countryStatusOverrides: parseCountryOverrides(env.COUNTRY_STATUS_OVERRIDES),
  };
}

export const CONFIG = 'CONFIG';
