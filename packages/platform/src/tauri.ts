// Import Tauri APIs directly within this module
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';

// Import types for the capabilities interface
import type { FileSystemCapabilities } from '@paynless/types';

// Command names (ensure consistency with Rust)
const RUST_COMMANDS = {
  READ_FILE: 'plugin:capabilities|read_file',
  WRITE_FILE: 'plugin:capabilities|write_file',
  PICK_DIRECTORY: 'plugin:capabilities|pick_directory', // New command
};

// Utility function to parse accept string into Tauri filters
function parseAcceptToFilters(accept?: string): { name: string; extensions: string[] }[] | undefined {
  if (!accept) return undefined;
  const extensions = accept
    .split(',')
    .map(ext => ext.trim().replace(/^\./, '')) // Remove leading dot
    .filter(ext => ext.length > 0);
  if (extensions.length === 0) return undefined;
  // Defaulting name to 'File' but could be parameterized if needed
  return [{ name: 'File', extensions }]; 
}

// Factory function to create the Tauri FileSystemCapabilities object
export function createTauriFileSystemCapabilities(): FileSystemCapabilities {
  return {
    isAvailable: true,

    async readFile(path: string): Promise<Uint8Array> {
      try {
        const data = await invoke<number[]>(RUST_COMMANDS.READ_FILE, { path });
        return new Uint8Array(data);
      } catch (error) {
        console.error('Tauri readFile Error:', error);
        // Consider specific error types or messages
        throw new Error(`Failed to read file via Tauri: ${error}`);
      }
    },

    async writeFile(path: string, data: Uint8Array): Promise<void> {
      try {
        // Convert Uint8Array to number[] for invoke
        const dataArray = Array.from(data);
        await invoke(RUST_COMMANDS.WRITE_FILE, { path, data: dataArray });
      } catch (error) {
        console.error('Tauri writeFile Error:', error);
        throw new Error(`Failed to write file via Tauri: ${error}`);
      }
    },

    async pickFile(options?: { accept?: string; multiple?: boolean }): Promise<string[] | null> {
      try {
        const filters = parseAcceptToFilters(options?.accept);
        const multiple = options?.multiple ?? false; // Default to false if undefined
        
        const result = await open({ multiple, filters });
        
        if (result === null) {
          return null; // User cancelled
        }
        // Ensure result is always an array
        return Array.isArray(result) ? result : [result];
      } catch (error) {
        // Tauri dialogs usually reject with an error message if cancelled by user/system
        console.log('Tauri pickFile Dialog cancelled or errored:', error);
        return null; // Treat errors/cancellations as null return
      }
    },

    async pickDirectory(options?: { multiple?: boolean }): Promise<string[] | null> {
      try {
        const multiple = options?.multiple ?? false;
        // Note: Tauri's standard API doesn't have a direct `pickFolders` in `@tauri-apps/plugin-dialog` yet.
        // We rely on a custom Rust command.
        const result = await invoke<string | string[] | null>(RUST_COMMANDS.PICK_DIRECTORY, { multiple });

        if (result === null) {
          return null; // User cancelled or error in Rust command
        }
        // Ensure result is always an array of strings
        return Array.isArray(result) ? result : [result];
      } catch (error) {
        console.error('Tauri pickDirectory Error:', error);
        throw new Error(`Failed to pick directory via Tauri: ${error}`);
      }
    },

    async pickSaveFile(options?: { defaultPath?: string; accept?: string }): Promise<string | null> {
      try {
        const filters = parseAcceptToFilters(options?.accept);
        const result = await save({ defaultPath: options?.defaultPath, filters });
        return result; // `save` directly returns string | null
      } catch (error) {
        console.log('Tauri pickSaveFile Dialog cancelled or errored:', error);
        return null; // Treat errors/cancellations as null return
      }
    },
  };
}

// Ensure old direct export is removed or commented out
// export const tauriFileSystemCapabilities: FileSystem = { ... }; 