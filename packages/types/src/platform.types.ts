// Represents the *absence* of a specific capability group
export interface CapabilityUnavailable {
  readonly isAvailable: false;
}

// Define explicit platform and OS types for clarity
export type PlatformType = 'web' | 'tauri' | 'react-native' | 'unknown';
export type OperatingSystem = 'windows' | 'macos' | 'linux' | 'ios' | 'android' | 'unknown';

// Define the capabilities for file system access
export interface FileSystemCapabilities {
  readonly isAvailable: true; // Mark explicitly that the FS capability object exists and is functional
  readFile: (path: string) => Promise<Uint8Array>; // Returns file content as byte array
  writeFile: (path: string, data: Uint8Array) => Promise<void>; // Writes byte array to file
  pickFile: (options?: { accept?: string; multiple?: boolean }) => Promise<string[] | null>; // Returns array of paths or null if cancelled
  pickDirectory: (options?: { multiple?: boolean }) => Promise<string[] | null>; // Returns array of directory paths or null if cancelled
  pickSaveFile: (options?: { defaultPath?: string, accept?: string }) => Promise<string | null>; // Returns single path or null
  // Add other relevant FS operations as needed (e.g., readDir, exists, deleteFile)
}

// Define the main interface aggregating all platform capabilities
export interface PlatformCapabilities {
  readonly platform: PlatformType;
  readonly os: OperatingSystem; // Determined OS (required)
  readonly fileSystem: FileSystemCapabilities | CapabilityUnavailable; // Union type for presence/absence
  // Add other future capability groups here using the same pattern:
  // Example: readonly windowManagement: WindowManagementCapabilities | CapabilityUnavailable;
  // Example: readonly notifications: NotificationCapabilities | CapabilityUnavailable;
} 