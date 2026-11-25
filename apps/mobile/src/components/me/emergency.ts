/**
 * Primary emergency number for each launch country (core `COUNTRIES`).
 * Police/general emergency line; where a unified number exists (112 / 911 / 999) it is used.
 */
export const EMERGENCY_NUMBERS: Record<string, string> = {
  EG: '122',
  JO: '911',
  SA: '911',
  AE: '999',
  QA: '999',
  KW: '112',
  BH: '999',
  OM: '9999',
  MA: '19',
  DZ: '17',
  TN: '197',
  GB: '999',
  IE: '112',
  DE: '112',
  FR: '112',
  NL: '112',
  BE: '112',
  US: '911',
  CA: '911',
};

export function emergencyNumber(country: string | null | undefined): string {
  return (country && EMERGENCY_NUMBERS[country]) || '112';
}
