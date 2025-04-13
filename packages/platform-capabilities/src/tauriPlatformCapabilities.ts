import { invoke } from '@tauri-apps/api/tauri';
import { open, save } from '@tauri-apps/api/dialog';
import type { FileSystemCapabilities } from '@paynless/types';

// This file will implement the FileSystemCapabilities using Tauri APIs 

// Helper to convert Uint8Array to Base64 for Tauri invoke, as JSON transport might mangle binary data
// Alternatively, Tauri > 1.6 might have better Buffer support.
// function uint8ArrayToBase64(bytes: Uint8Array): string {
//   let binary = '';
//   const len = bytes.byteLength;
//   for (let i = 0; i < len; i++) {
//     binary += String.fromCharCode(bytes[i]);
//   }
//   return window.btoa(binary);
// }

// Helper to convert Base64 back to Uint8Array
// function base64ToUint8Array(base64: string): Uint8Array {
//   const binary_string = window.atob(base64);
//   const len = binary_string.length;
//   const bytes = new Uint8Array(len);
//   for (let i = 0; i < len; i++) {
//     bytes[i] = binary_string.charCodeAt(i);
//   }
//   return bytes;
// }

export const tauriFileSystemCapabilities: FileSystemCapabilities = {
  isAvailable: true,

  pickFile: async (options) => {
    try {
      const result = await open({
        multiple: false,
        filters: options?.accept ? [{ name: 'File', extensions: options.accept.split(',').map(ext => ext.trim().replace('.', '')) }] : undefined,
      });
      return typeof result === 'string' ? result : null; // open() returns string | string[] | null
    } catch (error) {
      console.error('Error picking file:', error);
      return null;
    }
  },

  pickSaveFile: async (options) => {
    try {
      const result = await save({
        defaultPath: options?.defaultPath,
        filters: options?.accept ? [{ name: 'File', extensions: options.accept.split(',').map(ext => ext.trim().replace('.', '')) }] : undefined,
      });
      return result; // save() returns string | null
    } catch (error) {
      console.error('Error picking save file:', error);
      return null;
    }
  },

  readFile: async (path: string): Promise<Uint8Array> => {
    try {
      // Directly use Tauri's fs API for reading binary files if possible
      // Requires granting fs scope access in tauri.conf.json
      // import { readBinaryFile } from '@tauri-apps/api/fs';
      // return readBinaryFile(path);

      // --- OR --- Use invoke for custom Rust command (more flexible)
      // Assumes the Rust command 'plugin:capabilities|read_file' returns Vec<u8>
      const result = await invoke<number[]>('plugin:capabilities|read_file', { path });
      return new Uint8Array(result);
    } catch (error) {
      console.error(`Error reading file "${path}":`, error);
      throw new Error(`Failed to read file: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  writeFile: async (path: string, data: Uint8Array): Promise<void> => {
    try {
      // Directly use Tauri's fs API for writing binary files if possible
      // Requires granting fs scope access in tauri.conf.json
      // import { writeBinaryFile } from '@tauri-apps/api/fs';
      // await writeBinaryFile(path, data);

      // --- OR --- Use invoke for custom Rust command (more flexible)
      // Convert Uint8Array to regular array of numbers for JSON serialization
      const dataArray = Array.from(data);
      // Assumes the Rust command 'plugin:capabilities|write_file' accepts Vec<u8>
      await invoke('plugin:capabilities|write_file', { path, data: dataArray });
    } catch (error) {
      console.error(`Error writing file "${path}":`, error);
      throw new Error(`Failed to write file: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
}; 