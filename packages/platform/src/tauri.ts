// Import Tauri APIs and plugin functions
// Removed unused invoke import
import { open, save } from '@tauri-apps/plugin-dialog';
// Correct FS plugin function imports
import { readFile, writeFile } from '@tauri-apps/plugin-fs'; 

// Import types for the capabilities interface
import type { FileSystemCapabilities } from '@paynless/types';

// No longer need RUST_COMMANDS constant for these standard ops
// const RUST_COMMANDS = { ... };

// Utility function to parse accept string into Tauri filters
function parseAcceptToFilters(accept?: string): { name: string; extensions: string[] }[] | undefined {
  if (!accept) return undefined;
  const extensions = accept
    .split(',')
    .map(ext => ext.trim().replace(/^\./, '')) // Remove leading dot
    .filter(ext => ext.length > 0);
  if (extensions.length === 0) return undefined;
  return [{ name: 'File', extensions }]; 
}

// Factory function to create the Tauri FileSystemCapabilities object
export function createTauriFileSystemCapabilities(): FileSystemCapabilities {
  return {
    isAvailable: true,

    async readFile(path: string): Promise<Uint8Array> {
      try {
        // Use FS plugin's readFile (expects only path for binary reading)
        // Signature confirms it returns Promise<Uint8Array>
        const data = await readFile(path); 
        // No type check needed here due to return signature
        return data;
      } catch (error) {
        console.error('Tauri readFile (fs plugin) Error:', error);
        throw new Error(`Failed to read file via Tauri FS plugin: ${error}`);
      }
    },

    async writeFile(path: string, data: Uint8Array): Promise<void> {
      try {
        // Use FS plugin's writeFile (pass path and data as separate arguments)
        await writeFile(path, data); 
      } catch (error) {
        console.error('Tauri writeFile (fs plugin) Error:', error);
        throw new Error(`Failed to write file via Tauri FS plugin: ${error}`);
      }
    },

    async pickFile(options?: { accept?: string; multiple?: boolean }): Promise<string[] | null> {
      try {
        const filters = parseAcceptToFilters(options?.accept);
        const multiple = options?.multiple ?? false;
        // Use Dialog plugin's open
        const result = await open({ multiple, filters, directory: false }); 
        
        if (result === null) {
          return null;
        }
        // Ensure result is always an array of strings
        return Array.isArray(result) ? result : [result];
      } catch (error) {
        console.log('Tauri pickFile Dialog cancelled or errored:', error);
        return null;
      }
    },

    async pickDirectory(options?: { multiple?: boolean }): Promise<string[] | null> {
      try {
        const multiple = options?.multiple ?? false;
        // Use Dialog plugin's open with directory: true
        const result = await open({ multiple, directory: true }); 

        if (result === null) {
          return null;
        }
        // Ensure result is always an array of strings
        return Array.isArray(result) ? result : [result];
      } catch (error) {
        console.error('Tauri pickDirectory (dialog plugin) Error:', error);
        // Check for cancellation-like errors vs actual errors if needed
        return null; // Treat errors/cancellations as null return for now
      }
    },

    async pickSaveFile(options?: { defaultPath?: string; accept?: string }): Promise<string | null> {
      try {
        const filters = parseAcceptToFilters(options?.accept);
        // Use Dialog plugin's save
        const result = await save({ defaultPath: options?.defaultPath, filters }); 
        return result;
      } catch (error) {
        console.log('Tauri pickSaveFile Dialog cancelled or errored:', error);
        return null;
      }
    },
  };
}

// Ensure old direct export is removed or commented out
// export const tauriFileSystemCapabilities: FileSystem = { ... }; 