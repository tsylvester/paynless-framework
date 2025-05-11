/**
 * Checks if the code is running in a Tauri environment.
 * Relies on the presence of the __TAURI__ property on the window object.
 */
export function isTauri(): boolean {
  // Check for window object first to avoid errors in non-browser environments
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

/**
 * Determines the current platform based on the environment.
 * 
 * @returns {'web' | 'tauri'} The detected platform.
 */
export function getPlatform(): 'web' | 'tauri' {
  // Always check for Tauri first, as it might also have typical web properties
  return isTauri() ? 'tauri' : 'web';
} 