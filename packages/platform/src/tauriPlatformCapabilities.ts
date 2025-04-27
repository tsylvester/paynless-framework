// Import types for Tauri APIs to define dependencies
import type { open as DialogOpenFn, save as DialogSaveFn } from '@tauri-apps/api/dialog';
import type { invoke as TauriInvokeFn } from '@tauri-apps/api/tauri';

// Import types for the capabilities interface
import type { FileSystemCapabilities } from '@paynless/types';

// Re-introduce the dependency injection interface
interface TauriFsDeps {
  invoke: typeof TauriInvokeFn;
  open: typeof DialogOpenFn;
  save: typeof DialogSaveFn;
}

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

// Factory function accepts dependencies again
export function createTauriFileSystemCapabilities(deps: TauriFsDeps): FileSystemCapabilities {
  return {
    isAvailable: true,

    async readFile(path: string): Promise<Uint8Array> {
      try {
        // Use injected deps.invoke
        const data = await deps.invoke<number[]>('plugin:capabilities|read_file', { path });
        return new Uint8Array(data);
      } catch (error) {
        console.error('Error reading file via Tauri:', error);
        throw new Error(`Failed to read file: ${error}`);
      }
    },

    async writeFile(path: string, data: Uint8Array): Promise<void> {
      try {
        const dataArray = Array.from(data);
        // Use injected deps.invoke
        await deps.invoke('plugin:capabilities|write_file', { path, data: dataArray });
      } catch (error) {
        console.error('Error writing file via Tauri:', error);
        throw new Error(`Failed to write file: ${error}`);
      }
    },

    async pickFile(options?: { accept?: string }): Promise<string | null> {
      try {
        const filters = parseAcceptToFilters(options?.accept);
        // Use injected deps.open
        const result = await deps.open({ multiple: false, filters });
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
        // Use injected deps.save
        const result = await deps.save({ defaultPath: options?.defaultPath, filters });
        return result;
      } catch (error) {
        console.error('Error picking save file:', error);
        return null;
      }
    },

  };
}

// Ensure old direct export is removed or commented out
// export const tauriFileSystemCapabilities: FileSystemCapabilities = { ... }; 