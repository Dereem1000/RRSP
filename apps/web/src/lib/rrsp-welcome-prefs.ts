/** User preference: show the RRMS shop-owner welcome guide after sign-in (default true). */
export const RRSP_WELCOME_PREF_KEY = 'showRrspWelcomeOnLogin';

export function readShowRrspWelcomeOnLogin(preferences: Record<string, unknown> | null | undefined): boolean {
  if (!preferences || typeof preferences !== 'object') return true;
  return preferences[RRSP_WELCOME_PREF_KEY] !== false;
}

export function mergeShowRrspWelcomeOnLogin(
  preferences: Record<string, unknown> | null | undefined,
  show: boolean
): Record<string, unknown> {
  return { ...(preferences && typeof preferences === 'object' ? preferences : {}), [RRSP_WELCOME_PREF_KEY]: show };
}
