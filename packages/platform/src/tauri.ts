// Import Tauri APIs directly within this module
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';

// Import types for the capabilities interface
import type { FileSystem } from '@paynless/types';

// Utility function remains the same
function parseAcceptToFilters(accept?: string): { name: string; extensions: string[] }[] | undefined {
  if (!accept) return undefined;
  const extensions = accept
    .split(',')
    .map(ext => ext.trim().replace(/^\./, '')) // Remove leading dot
    .filter(ext => ext.length > 0);
  if (extensions.length === 0) return undefined;
  return [{ name: 'File', extensions }];
}

// Factory function no longer accepts dependencies
export function createTauriFileSystemCapabilities(): FileSystem {
  return {
    isAvailable: true,

    async readFile(path: string): Promise<Uint8Array> {
      try {
        // Use directly imported invoke
        const data = await invoke<number[]>('plugin:capabilities|read_file', { path });
        return new Uint8Array(data);
      } catch (error) {
        console.error('Error reading file via Tauri:', error);
        throw new Error(`Failed to read file: ${error}`);
      }
    },

    async writeFile(path: string, data: Uint8Array): Promise<void> {
      try {
        const dataArray = Array.from(data);
        // Use directly imported invoke
        await invoke('plugin:capabilities|write_file', { path, data: dataArray });
      } catch (error) {
        console.error('Error writing file via Tauri:', error);
        throw new Error(`Failed to write file: ${error}`);
      }
    },

    async pickFile(options?: { accept?: string }): Promise<string | null> {
      try {
        const filters = parseAcceptToFilters(options?.accept);
        // Use directly imported open
        const result = await open({ multiple: false, filters });
        if (Array.isArray(result)) {
          return result[0] ?? null;
        }
        return result;
      } catch (error) {
        console.error('Error picking file:', error);
        return null;
      }
    },

    async pickSaveFile(options?: { defaultPath?: string, accept?: string }): Promise<string | null> {
      try {
        const filters = parseAcceptToFilters(options?.accept);
        // Use directly imported save
        const result = await save({ defaultPath: options?.defaultPath, filters });
        return result;
      } catch (error) {
        console.error('Error picking save file:', error);
        return null;
      }
    },

  };
}

// Ensure old direct export is removed or commented out
// export const tauriFileSystemCapabilities: FileSystem = { ... }; 