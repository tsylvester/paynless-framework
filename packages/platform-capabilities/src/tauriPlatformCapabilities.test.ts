import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tauriFileSystemCapabilities } from './tauriPlatformCapabilities';
import type { FileSystemCapabilities } from '@paynless/types';

// Mock the Tauri API modules
vi.mock('@tauri-apps/api/dialog', () => ({
  open: vi.fn(),
  save: vi.fn(),
}));
vi.mock('@tauri-apps/api/tauri', () => ({
  invoke: vi.fn(),
}));

// Import mocks after mocking
import { open, save } from '@tauri-apps/api/dialog';
import { invoke } from '@tauri-apps/api/tauri';

describe('tauriFileSystemCapabilities', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
  });

  it('should report isAvailable as true', () => {
    expect(tauriFileSystemCapabilities.isAvailable).toBe(true);
  });

  // --- pickFile Tests ---
  it('pickFile should call Tauri open dialog and return path', async () => {
    const mockPath = '/path/to/selected/file.txt';
    (open as vi.Mock).mockResolvedValue(mockPath);

    const result = await tauriFileSystemCapabilities.pickFile();

    expect(open).toHaveBeenCalledOnce();
    expect(open).toHaveBeenCalledWith({ multiple: false, filters: undefined });
    expect(result).toBe(mockPath);
  });

  it('pickFile should handle dialog cancellation', async () => {
    (open as vi.Mock).mockResolvedValue(null);
    const result = await tauriFileSystemCapabilities.pickFile();
    expect(result).toBeNull();
  });

  it('pickFile should handle dialog error', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (open as vi.Mock).mockRejectedValue(new Error('Dialog error'));
    const result = await tauriFileSystemCapabilities.pickFile();
    expect(result).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('pickFile should pass accept options as filters', async () => {
    await tauriFileSystemCapabilities.pickFile({ accept: '.txt,.csv' });
    expect(open).toHaveBeenCalledWith({ multiple: false, filters: [{ name: 'File', extensions: ['txt', 'csv'] }] });
  });

  // --- pickSaveFile Tests ---
  it('pickSaveFile should call Tauri save dialog and return path', async () => {
    const mockPath = '/path/to/save/file.txt';
    (save as vi.Mock).mockResolvedValue(mockPath);

    const result = await tauriFileSystemCapabilities.pickSaveFile();

    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith({ defaultPath: undefined, filters: undefined });
    expect(result).toBe(mockPath);
  });

  it('pickSaveFile should handle dialog cancellation', async () => {
    (save as vi.Mock).mockResolvedValue(null);
    const result = await tauriFileSystemCapabilities.pickSaveFile();
    expect(result).toBeNull();
  });

  it('pickSaveFile should handle dialog error', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (save as vi.Mock).mockRejectedValue(new Error('Dialog error'));
    const result = await tauriFileSystemCapabilities.pickSaveFile();
    expect(result).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

   it('pickSaveFile should pass options', async () => {
    await tauriFileSystemCapabilities.pickSaveFile({ accept: '.json', defaultPath: '/tmp/default.json' });
    expect(save).toHaveBeenCalledWith({ defaultPath: '/tmp/default.json', filters: [{ name: 'File', extensions: ['json'] }] });
  });

  // --- readFile Tests ---
  it('readFile should call invoke with correct command and args', async () => {
    const mockPath = '/path/to/read.bin';
    const mockData = [1, 2, 3, 4]; // Mock binary data as number array
    (invoke as vi.Mock).mockResolvedValue(mockData);

    const result = await tauriFileSystemCapabilities.readFile(mockPath);

    expect(invoke).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledWith('plugin:capabilities|read_file', { path: mockPath });
    expect(result).toBeInstanceOf(Uint8Array);
    expect(Array.from(result)).toEqual(mockData);
  });

  it('readFile should throw on invoke error', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const mockError = new Error('Rust error');
    (invoke as vi.Mock).mockRejectedValue(mockError);

    await expect(tauriFileSystemCapabilities.readFile('/bad/path')).rejects.toThrow('Failed to read file: Rust error');
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  // --- writeFile Tests ---
  it('writeFile should call invoke with correct command and args', async () => {
    const mockPath = '/path/to/write.bin';
    const mockData = new Uint8Array([10, 20, 30]);
    (invoke as vi.Mock).mockResolvedValue(undefined); // Write file returns void/ok

    await tauriFileSystemCapabilities.writeFile(mockPath, mockData);

    expect(invoke).toHaveBeenCalledOnce();
    // Check that Uint8Array was converted to number array for invoke
    expect(invoke).toHaveBeenCalledWith('plugin:capabilities|write_file', { path: mockPath, data: [10, 20, 30] });
  });

   it('writeFile should throw on invoke error', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const mockError = new Error('Rust write error');
    (invoke as vi.Mock).mockRejectedValue(mockError);
    const mockData = new Uint8Array([5, 6]);

    await expect(tauriFileSystemCapabilities.writeFile('/bad/write', mockData)).rejects.toThrow('Failed to write file: Rust write error');
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

}); 