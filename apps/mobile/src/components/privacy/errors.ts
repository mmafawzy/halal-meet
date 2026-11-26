import { ApiError } from '@/api/types';

/** True for an ApiError with the given `error` code (e.g. 'plan_required', 'grace_period_over'). */
export function isApiError(e: unknown, code: string): boolean {
  return e instanceof ApiError && e.code === code;
}

/** Account-restriction answers from the auth guard (403). */
export function isAccountRestricted(e: unknown): boolean {
  return isApiError(e, 'account_suspended') || isApiError(e, 'account_banned') || isApiError(e, 'deletion_pending');
}
