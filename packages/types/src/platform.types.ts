export interface FileSystemCapabilities {
  isAvailable: true; // Mark explicitly that the FS capability object exists
  readFile: (path: string) => Promise<Uint8Array>;
  writeFile: (path: string, data: Uint8Array) => Promise<void>;
  pickFile: (options?: { accept?: string }) => Promise<string | null>; // Path or null
  pickSaveFile: (options?: { defaultPath?: string, accept?: string }) => Promise<string | null>; // Path or null
  // Add other relevant FS operations as needed
}

export interface PlatformCapabilities {
  platform: 'web' | 'tauri' | 'react-native' | 'unknown';
  os?: 'windows' | 'macos' | 'linux' | 'ios' | 'android'; // Optional, if needed for finer control
  fileSystem: FileSystemCapabilities | { isAvailable: false }; // Use a flag object for unavailable
  // Add other future capability groups here (e.g., notifications, registry)
  // Example: windowsRegistry: WindowsRegistryCapabilities | { isAvailable: false };
} 