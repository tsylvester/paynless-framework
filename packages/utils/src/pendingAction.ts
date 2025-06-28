import { logger } from './logger';
import type { PendingAction } from '@paynless/types';

const PENDING_ACTION_STORAGE_KEY = 'pendingActionDetails';

export type ReplayFunction = (body: unknown) => Promise<void>;

const actionRegistry = new Map<string, ReplayFunction>();

export function registerReplayAction(
  endpoint: string,
  replayFunction: ReplayFunction
): void {
  if (actionRegistry.has(endpoint)) {
    logger.warn(`[PendingAction] Overwriting replay action for ${endpoint}`);
  }
  actionRegistry.set(endpoint, replayFunction);
}

export function stashPendingAction<T>(action: PendingAction<T>): void {
  try {
    localStorage.setItem(
      PENDING_ACTION_STORAGE_KEY,
      JSON.stringify(action)
    );
    logger.info('[PendingAction] Action stashed.', {
      endpoint: action.endpoint,
    });
  } catch (error) {
    logger.error('[PendingAction] Failed to stash action.', { error });
  }
}

export async function checkAndReplayPendingAction(): Promise<string | null> {
  const pendingActionJSON = localStorage.getItem(PENDING_ACTION_STORAGE_KEY);
  if (!pendingActionJSON) {
    return null;
  }

  try {
    const parsedAction: unknown = JSON.parse(pendingActionJSON);

    // Type guard to validate the parsed action
    const isPendingAction = <T>(value: unknown): value is PendingAction<T> => {
      return (
        typeof value === 'object' &&
        value !== null &&
        'endpoint' in value &&
        typeof (value as { endpoint: unknown }).endpoint === 'string' &&
        'method' in value &&
        typeof (value as { method: unknown }).method === 'string' &&
        'body' in value
      );
    };

    if (!isPendingAction(parsedAction)) {
      logger.error('[PendingAction] Invalid pending action found in storage.');
      localStorage.removeItem(PENDING_ACTION_STORAGE_KEY);
      return null;
    }

    // After the type guard, parsedAction is now of type PendingAction<unknown>
    const pendingAction = parsedAction;

    const replayFunction = actionRegistry.get(pendingAction.endpoint);
    if (!replayFunction) {
      logger.error(
        `[PendingAction] No replay function registered for action endpoint: ${pendingAction.endpoint}`
      );
      localStorage.removeItem(PENDING_ACTION_STORAGE_KEY);
      return null;
    }

    logger.info('[PendingAction] Replaying pending action...', {
      endpoint: pendingAction.endpoint,
    });
    await replayFunction(pendingAction.body);
    logger.info('[PendingAction] Replay successful.', {
      endpoint: pendingAction.endpoint,
    });

    return pendingAction.returnPath || null;
  } catch (error) {
    logger.error('[PendingAction] Failed to replay pending action.', {
      error,
    });
    return null;
  } finally {
    localStorage.removeItem(PENDING_ACTION_STORAGE_KEY);
  }
} 