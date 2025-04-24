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
 * @param token - The user's current access token.
 * @returns {Promise<boolean>} - True if navigation occurred based on returnPath, false otherwise.
 */
export async function replayPendingAction(
  api: ApiClient,
  navigate: NavigateFunction | null,
  token: string | undefined | null
): Promise<boolean> {
  let navigated = false;
  const pendingActionJson = localStorage.getItem('pendingAction');

  if (!pendingActionJson) {
    logger.debug('[replayPendingAction] No pending action found.');
    return false; // No action to replay
  }

  logger.info('[replayPendingAction] Found pending action. Attempting replay...');
  let pendingAction: PendingAction | null = null; // Declare outside for potential later use

  try {
    pendingAction = JSON.parse(pendingActionJson);
    // --- Add check for null after parse --- 
    if (!pendingAction) {
        // This case should ideally not happen if JSON.parse succeeds with non-empty JSON
        // but good to handle defensively.
        logger.error('[replayPendingAction] Parsed pending action is null or undefined.');
        // Attempt to remove potentially corrupt item?
        try { localStorage.removeItem('pendingAction'); } catch(e){}
        return false;
    }

    // --- DO NOT remove item here --- 
    // localStorage.removeItem('pendingAction'); 

    const { endpoint, method, body, returnPath } = pendingAction;

    // --- Add temporary log for token ---
    console.log('[DEBUG replayPendingAction] Checking token:', token);

    if (!endpoint || !method || !token) {
      logger.error('[replayPendingAction] Invalid pending action data or missing token:', {
        pendingAction,
        hasToken: !!token,
      });
      // Keep the item in localStorage since replay failed early
      return false; 
    }

    logger.info(`[replayPendingAction] Replaying action: ${method} ${endpoint}`, { body });
    let replayResponse: ApiResponse<unknown>;

    // --- Replay Logic ---
    switch (method.toUpperCase()) {
      case 'POST':
        replayResponse = await api.post(endpoint, body ?? {}, { token });
        break;
      case 'PUT':
        replayResponse = await api.put(endpoint, body ?? {}, { token });
        break;
      case 'DELETE':
        replayResponse = await api.delete(endpoint, { token });
        break;
      case 'GET':
        replayResponse = await api.get(endpoint, { token });
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
      // --- Keep item on error --- 
    } else {
      logger.info(
        '[replayPendingAction] Successfully replayed pending action.',
        { status: replayResponse.status }
      );
      // --- Remove item ONLY on SUCCESS --- 
      try {
          localStorage.removeItem('pendingAction');
          logger.debug('[replayPendingAction] Cleared pending action from localStorage after successful replay.')
      } catch (removeError) {
          logger.error('[replayPendingAction] Failed to remove pendingAction after success:', { removeError });
      }

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

    // --- Add temporary log for navigation check ---
    console.log('[DEBUG replayPendingAction] Checking navigation:', { hasNavigate: !!navigate, returnPath });

    if (navigate && returnPath) {
      logger.info(
        `[replayPendingAction] Replay processing complete, navigating to original path: ${returnPath}`
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
    // Keep item if error occurred during parsing/processing
    // logger.error('[replayPendingAction] Error processing pending action:', ...);
    // try { localStorage.removeItem('pendingAction'); } ... // Remove this attempt
  }

  return navigated;
} 