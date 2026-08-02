/**
 * Shared keys/events for parts catalog wake-and-burst sync.
 * Full data polls only after a mutation (button) or when the shared activity version changes.
 */
export const PARTS_DATA_CHANGED_KEY = 'cd-parts-catalog-data-changed';
export const PARTS_DATA_REFRESH_EVENT = 'cd-parts-data-refresh';
export const PARTS_REFRESH_BURST_DELAYS_MS = [1500, 3500, 6000] as const;
/** Tiny activity check while idle — discovers another user's button click without loading full catalog. */
export const PARTS_ACTIVITY_IDLE_CHECK_MS = 8000;
