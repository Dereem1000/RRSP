/** Shared activity-monitor thresholds (worker + reconcile). */
export const ACTIVITY_WINDOW_MS = 5 * 60 * 1000;
/** Failed logins from same actor within the window → suspicious_activity. */
export const FAILED_LOGIN_THRESHOLD = 3;
/** Non-suspicious security events from same actor within the window → suspicious_activity. */
export const EVENT_BURST_THRESHOLD = 10;
