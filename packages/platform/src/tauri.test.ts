import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// REMOVE mockIPC and clearMocks imports
// import { mockIPC, clearMocks } from '@tauri-apps/api/mocks';
// Import the FACTORY function now
import { createTauriFileSystemCapabilities } from './tauri';
import type { FileSystemCapabilities } from '@paynless/types';

// Mock the necessary Tauri API modules
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
  save: vi.fn(),
}));

// Import the mocked functions AFTER the mocks are defined
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';

describe('createTauriFileSystemCapabilities', () => {
  let capabilities: FileSystemCapabilities;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Create a fresh instance before each test
    capabilities = createTauriFileSystemCapabilities();
    // Reset mocks before each test
    vi.resetAllMocks();
    // Spy on console methods
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore console spies
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('should report isAvailable as true', () => {
    expect(capabilities.isAvailable).toBe(true);
  });

  // --- readFile Tests ---
  it('readFile should call invoke and return Uint8Array', async () => {
    const mockPath = 'test/read.txt';
    const mockResponse = [1, 2, 3];
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

    const result = await capabilities.readFile(mockPath);

    expect(invoke).toHaveBeenCalledWith('plugin:capabilities|read_file', { path: mockPath });
    expect(result).toBeInstanceOf(Uint8Array);
    expect(Array.from(result)).toEqual(mockResponse);
  });

  it('readFile should throw and log error on invoke failure', async () => {
    const mockError = 'Read failed';
    (invoke as ReturnType<typeof vi.fn>).mockRejectedValue(mockError);

    await expect(capabilities.readFile('fail.txt')).rejects.toThrow(`Failed to read file via Tauri: ${mockError}`);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  // --- writeFile Tests ---
  it('writeFile should call invoke with converted data array', async () => {
    const mockPath = 'test/write.dat';
    const mockData = new Uint8Array([10, 20]);
    const expectedInvokeData = [10, 20]; // number[]
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    await capabilities.writeFile(mockPath, mockData);

    expect(invoke).toHaveBeenCalledWith('plugin:capabilities|write_file', { path: mockPath, data: expectedInvokeData });
  });

  it('writeFile should throw and log error on invoke failure', async () => {
    const mockError = 'Write failed';
    (invoke as ReturnType<typeof vi.fn>).mockRejectedValue(mockError);

    await expect(capabilities.writeFile('fail.dat', new Uint8Array())).rejects.toThrow(`Failed to write file via Tauri: ${mockError}`);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  // --- pickFile Tests ---
  it('pickFile (single) should call open and return string array', async () => {
    const mockPath = '/selected/file.txt';
    (open as ReturnType<typeof vi.fn>).mockResolvedValue(mockPath);

    const result = await capabilities.pickFile({ accept: '.txt' });

    expect(open).toHaveBeenCalledWith({ multiple: false, filters: [{ name: 'File', extensions: ['txt'] }] });
    expect(result).toEqual([mockPath]);
  });

  it('pickFile (multiple) should call open and return string array', async () => {
    const mockPaths = ['/selected/file1.png', '/selected/file2.png'];
    (open as ReturnType<typeof vi.fn>).mockResolvedValue(mockPaths);

    const result = await capabilities.pickFile({ accept: '.png', multiple: true });

    expect(open).toHaveBeenCalledWith({ multiple: true, filters: [{ name: 'File', extensions: ['png'] }] });
    expect(result).toEqual(mockPaths);
  });

  it('pickFile should return null if open returns null', async () => {
    (open as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const result = await capabilities.pickFile();
    expect(result).toBeNull();
  });
  
   it('pickFile should return null and log on open failure', async () => {
    const mockError = 'Dialog closed';
    (open as ReturnType<typeof vi.fn>).mockRejectedValue(mockError);

    const result = await capabilities.pickFile();
    expect(result).toBeNull();
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('pickFile Dialog cancelled or errored'), mockError);
  });

  // --- pickDirectory Tests ---
  it('pickDirectory (single) should call invoke and return string array', async () => {
    const mockPath = '/selected/dir';
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(mockPath);

    const result = await capabilities.pickDirectory({ multiple: false });

    expect(invoke).toHaveBeenCalledWith('plugin:capabilities|pick_directory', { multiple: false });
    expect(result).toEqual([mockPath]);
  });

  it('pickDirectory (multiple) should call invoke and return string array', async () => {
    const mockPaths = ['/selected/dir1', '/selected/dir2'];
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(mockPaths);

    const result = await capabilities.pickDirectory({ multiple: true });

    expect(invoke).toHaveBeenCalledWith('plugin:capabilities|pick_directory', { multiple: true });
    expect(result).toEqual(mockPaths);
  });

  it('pickDirectory should return null if invoke returns null', async () => {
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const result = await capabilities.pickDirectory();
    expect(result).toBeNull();
  });
  
   it('pickDirectory should throw and log error on invoke failure', async () => {
    const mockError = 'Failed to pick';
    (invoke as ReturnType<typeof vi.fn>).mockRejectedValue(mockError);

    await expect(capabilities.pickDirectory()).rejects.toThrow(`Failed to pick directory via Tauri: ${mockError}`);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  // --- pickSaveFile Tests ---
  it('pickSaveFile should call save and return path', async () => {
    const mockPath = '/save/here.json';
    (save as ReturnType<typeof vi.fn>).mockResolvedValue(mockPath);

    const result = await capabilities.pickSaveFile({ defaultPath: '/save/here.json', accept: '.json' });

    expect(save).toHaveBeenCalledWith({ defaultPath: '/save/here.json', filters: [{ name: 'File', extensions: ['json'] }] });
    expect(result).toBe(mockPath);
  });

  it('pickSaveFile should return null if save returns null', async () => {
    (save as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const result = await capabilities.pickSaveFile();
    expect(result).toBeNull();
  });

   it('pickSaveFile should return null and log on save failure', async () => {
    const mockError = 'Save cancelled';
    (save as ReturnType<typeof vi.fn>).mockRejectedValue(mockError);

    const result = await capabilities.pickSaveFile();
    expect(result).toBeNull();
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('pickSaveFile Dialog cancelled or errored'), mockError);
  });
}); 