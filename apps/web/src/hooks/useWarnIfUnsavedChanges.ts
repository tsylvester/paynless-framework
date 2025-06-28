import { useEffect, useCallback } from 'react';

/**
 * Custom hook to warn the user about unsaved changes before they navigate away.
 * @param isUnsaved Boolean flag indicating whether there are unsaved changes.
 * @param message The message to display in the confirmation dialog (some browsers may show a generic message).
 */
export const useWarnIfUnsavedChanges = (isUnsaved: boolean, message: string = 'You have unsaved changes. Are you sure you want to leave?') => {
  const handleBeforeUnload = useCallback((event: BeforeUnloadEvent) => {
    // No need to check isUnsaved here as the listener is only added when isUnsaved is true
    event.preventDefault();
    // Standard for most browsers requires returnValue to be set.
    event.returnValue = message;
    return message; // For older browsers
  }, [message]); // Only depends on message, as isUnsaved is handled by add/remove logic

  useEffect(() => {
    if (isUnsaved) {
      window.addEventListener('beforeunload', handleBeforeUnload);
      // Cleanup function specific to when the listener was added
      return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
      };
    }
    // If isUnsaved is false, no listener is added, and thus no specific cleanup is needed here for this case.
    // The return from the `if (isUnsaved)` block handles cleanup if it was previously true.
  }, [isUnsaved, handleBeforeUnload]); // Re-run the effect if isUnsaved or the memoized handler changes.
}; 