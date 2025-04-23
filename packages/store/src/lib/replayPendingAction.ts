import { logger } from '@paynless/utils';
import { type ApiClient } from '@paynless/api-client';
import { type ApiResponse, type PendingAction } from '@paynless/types';
import { type NavigateFunction } from '@paynless/types';

/**
 * Checks for and replays a pending action stored in localStorage.
 * This is typically called after a user successfully authenticates.
 *
 * @param api - The initialized ApiClient instance.
 * @param navigate - The navigation function from the router.
 * @returns {Promise<boolean>} - True if navigation occurred based on returnPath, false otherwise.
 */
export async function replayPendingAction(
  api: ApiClient,
  navigate: NavigateFunction | null
): Promise<boolean> {
  let navigated = false;
  const pendingActionJson = localStorage.getItem('pendingAction');

  if (!pendingActionJson) {
    logger.debug('[replayPendingAction] No pending action found.');
    return false; // No action to replay
  }

  logger.info('[replayPendingAction] Found pending action. Attempting replay...');

  try {
    const pendingAction: PendingAction = JSON.parse(pendingActionJson);
    localStorage.removeItem('pendingAction'); // Clear immediately after successful parse

    const { endpoint, method, body, returnPath } = pendingAction;
    const session = await api.getSupabaseClient().auth.getSession();
    const token = session.data.session?.access_token;

    if (!endpoint || !method || !token) {
      logger.error('[replayPendingAction] Invalid pending action data or missing token:', {
        pendingAction,
        hasToken: !!token,
      });
      // Potentially keep the invalid item in localStorage? Or clear it?
      // Let's clear it for now to prevent loops.
      return false; // Cannot replay
    }

    logger.info(`[replayPendingAction] Replaying action: ${method} ${endpoint}`, { body });
    let replayResponse: ApiResponse<unknown>; // Use unknown for generic replay

    // --- Replay Logic (Moved from authStore.ts) ---
    switch (method.toUpperCase()) {
      case 'POST':
        replayResponse = await api.post(endpoint, body ?? {}, {
          token: token,
        });
        break;
      case 'PUT':
        replayResponse = await api.put(endpoint, body ?? {}, {
          token: token,
        });
        break;
      case 'DELETE':
        replayResponse = await api.delete(endpoint, {
          token: token,
        });
        break;
      case 'GET':
        replayResponse = await api.get(endpoint, {
          token: token,
        });
        break;
      default:
        logger.error(
          '[replayPendingAction] Unsupported method in pending action replay:',
          { method }
        );
        replayResponse = {
          status: 0,
          error: {
            code: 'UNSUPPORTED_METHOD',
            message: 'Unsupported replay method',
          },
        };
    }
    // --- End Replay Logic ---

    if (replayResponse.error) {
      logger.error('[replayPendingAction] Error replaying pending action:', {
        status: replayResponse.status,
        error: replayResponse.error,
      });
    } else {
      logger.info(
        '[replayPendingAction] Successfully replayed pending action.',
        { status: replayResponse.status }
      );

      // --- Special Chat Handling (Moved from authStore.ts) ---
       if (
         endpoint === 'chat' &&
         method.toUpperCase() === 'POST' &&
         replayResponse.data &&
         typeof (replayResponse.data as any).chat_id === 'string'
       ) {
          const chatId = (replayResponse.data as any).chat_id;
          logger.info(
            `[replayPendingAction] Chat action replayed, storing chatId ${chatId} for redirect.`
          );
          try {
            localStorage.setItem('loadChatIdOnRedirect', chatId);
          } catch (e: unknown) {
             logger.error(
                '[replayPendingAction] Failed to set loadChatIdOnRedirect:',
                { error: e instanceof Error ? e.message : String(e) }
             );
          }
       }
      // --- End Special Chat Handling ---

    }

    // --- Navigation Logic (To be moved from authStore.ts) ---
    if (navigate && returnPath) {
      logger.info(
        `[replayPendingAction] Replay complete, navigating to original path: ${returnPath}`
      );
      navigate(returnPath);
      navigated = true;
    } else {
      logger.warn(
        '[replayPendingAction] Could not navigate to returnPath after replay.',
        { hasNavigate: !!navigate, returnPath }
      );
    }
    // --- End Navigation Logic ---

  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    logger.error('[replayPendingAction] Error processing pending action:', {
      error: errorMsg,
    });
    // Attempt to clear localStorage even if parsing failed, to prevent loops
    try {
        localStorage.removeItem('pendingAction');
    } catch (removeError) {
        logger.error('[replayPendingAction] Failed to remove pendingAction after error:', { removeError });
    }
  }

  return navigated;
} 