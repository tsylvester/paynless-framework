import type { FileSystemCapabilities } from '@paynless/types';
// Import types for Tauri APIs to define dependencies
import type { open as DialogOpenFn, save as DialogSaveFn } from '@tauri-apps/api/dialog';
import type { invoke as TauriInvokeFn } from '@tauri-apps/api/tauri';

// Define the dependencies needed by the Tauri File System implementation
interface TauriFsDeps {
  invoke: typeof TauriInvokeFn;
  open: typeof DialogOpenFn;
  save: typeof DialogSaveFn;
}

// Utility to parse accept string into Tauri filters
function parseAcceptToFilters(accept?: string): { name: string; extensions: string[] }[] | undefined {
  if (!accept) return undefined;
  const extensions = accept
    .split(',')
    .map(ext => ext.trim().replace(/^\./, '')) // Remove leading dot
    .filter(ext => ext.length > 0);
  if (extensions.length === 0) return undefined;
  return [{ name: 'File', extensions }];
}

// Factory function to create the capabilities object
export function createTauriFileSystemCapabilities(deps: TauriFsDeps): FileSystemCapabilities {
  return {
    isAvailable: true,

    async readFile(path: string): Promise<Uint8Array> {
      try {
        const data = await deps.invoke<number[]>('plugin:capabilities|read_file', { path });
        return new Uint8Array(data);
      } catch (error) {
        console.error('Error reading file via Tauri:', error);
        throw new Error(`Failed to read file: ${error}`);
      }
    },

    async writeFile(path: string, data: Uint8Array): Promise<void> {
      try {
        // Convert Uint8Array to a regular array for Tauri invoke
        const dataArray = Array.from(data);
        await deps.invoke('plugin:capabilities|write_file', { path, data: dataArray });
      } catch (error) {
        console.error('Error writing file via Tauri:', error);
        throw new Error(`Failed to write file: ${error}`);
      }
    },

    async pickFile(options?: { accept?: string }): Promise<string | null> {
      try {
        const filters = parseAcceptToFilters(options?.accept);
        const result = await deps.open({ multiple: false, filters });
        // Tauri's open dialog returns string[], string, or null
        if (Array.isArray(result)) {
          return result[0] ?? null; // Should not happen with multiple: false
        }
        return result; // Returns string or null
      } catch (error) {
        console.error('Error picking file:', error);
        return null;
      }
    },

    async pickSaveFile(options?: { defaultPath?: string, accept?: string }): Promise<string | null> {
      try {
        const filters = parseAcceptToFilters(options?.accept);
        const result = await deps.save({ defaultPath: options?.defaultPath, filters });
        return result; // Returns string or null
      } catch (error) {
        console.error('Error picking save file:', error);
        return null;
      }
    },

  };
}

// Remove the old direct export
// export const tauriFileSystemCapabilities: FileSystemCapabilities = { ... }; 