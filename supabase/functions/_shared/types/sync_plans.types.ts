/**
 * Request body for POST /sync-stripe-plans.
 */
export interface SyncStripePlansRequest {
  isTestMode?: boolean;
}

/**
 * Response shape for sync-stripe-plans edge function.
 */
export interface SyncStripePlansResult {
  success: boolean;
  synced: number;
  failed: number;
  errors: string[];
}
