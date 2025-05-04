import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// REMOVE mockIPC and clearMocks imports
// import { mockIPC, clearMocks } from '@tauri-apps/api/mocks';
// Import the FACTORY function now
import { createTauriFileSystemCapabilities } from './tauri';
import type { FileSystemCapabilities } from '@paynless/types';

// Mock the necessary Tauri plugin modules

// Mock Dialog Plugin
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
  save: vi.fn(),
}));

// Mock FS Plugin
vi.mock('@tauri-apps/plugin-fs', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

// Import the mocked functions AFTER the mocks are defined
import { open, save } from '@tauri-apps/plugin-dialog';
import { readFile, writeFile } from '@tauri-apps/plugin-fs';

// Get typed mock functions
const mockedOpen = vi.mocked(open);
const mockedSave = vi.mocked(save);
const mockedReadFile = vi.mocked(readFile);
const mockedWriteFile = vi.mocked(writeFile);

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
  it('readFile should call readFile and return Uint8Array', async () => {
    const mockPath = 'test/read.txt';
    const mockResponseData = new Uint8Array([1, 2, 3]);
    mockedReadFile.mockResolvedValue(mockResponseData);

    const result = await capabilities.readFile(mockPath);

    expect(mockedReadFile).toHaveBeenCalledWith(mockPath);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result).toEqual(mockResponseData);
  });

  it('readFile should throw and log error on readFile failure', async () => {
    const mockError = 'Read failed';
    mockedReadFile.mockRejectedValue(mockError);

    await expect(capabilities.readFile('fail.txt')).rejects.toThrow(`Failed to read file via Tauri FS plugin: ${mockError}`);
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('(fs plugin) Error'), mockError);
  });

  // --- writeFile Tests ---
  it('writeFile should call writeFile with path and data', async () => {
    const mockPath = 'test/write.dat';
    const mockData = new Uint8Array([10, 20]);
    mockedWriteFile.mockResolvedValue(undefined);

    await capabilities.writeFile(mockPath, mockData);

    expect(mockedWriteFile).toHaveBeenCalledWith(mockPath, mockData);
  });

  it('writeFile should throw and log error on writeFile failure', async () => {
    const mockError = 'Write failed';
    mockedWriteFile.mockRejectedValue(mockError);

    await expect(capabilities.writeFile('fail.dat', new Uint8Array())).rejects.toThrow(`Failed to write file via Tauri FS plugin: ${mockError}`);
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('(fs plugin) Error'), mockError);
  });

  // --- pickFile Tests ---
  it('pickFile (single) should call open and return string array', async () => {
    const mockPath = '/selected/file.txt';
    mockedOpen.mockResolvedValue(mockPath);

    const result = await capabilities.pickFile({ accept: '.txt' });

    expect(mockedOpen).toHaveBeenCalledWith({ multiple: false, filters: [{ name: 'File', extensions: ['txt'] }], directory: false });
    expect(result).toEqual([mockPath]);
  });

  it('pickFile (multiple) should call open and return string array', async () => {
    const mockPaths = ['/selected/file1.png', '/selected/file2.png'];
    mockedOpen.mockResolvedValue(mockPaths);

    const result = await capabilities.pickFile({ accept: '.png', multiple: true });

    expect(mockedOpen).toHaveBeenCalledWith({ multiple: true, filters: [{ name: 'File', extensions: ['png'] }], directory: false });
    expect(result).toEqual(mockPaths);
  });

  it('pickFile should return null if open returns null', async () => {
    mockedOpen.mockResolvedValue(null);
    const result = await capabilities.pickFile();
    expect(result).toBeNull();
  });
  
   it('pickFile should return null and log on open failure', async () => {
    const mockError = 'Dialog closed';
    mockedOpen.mockRejectedValue(mockError);

    const result = await capabilities.pickFile();
    expect(result).toBeNull();
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('pickFile Dialog cancelled or errored'), mockError);
  });

  // --- pickDirectory Tests ---
  it('pickDirectory (single) should call open with directory:true and return string array', async () => {
    const mockPath = '/selected/dir';
    mockedOpen.mockResolvedValue(mockPath);

    const result = await capabilities.pickDirectory({ multiple: false });

    expect(mockedOpen).toHaveBeenCalledWith({ multiple: false, directory: true });
    expect(result).toEqual([mockPath]);
  });

  it('pickDirectory (multiple) should call open with directory:true and return string array', async () => {
    const mockPaths = ['/selected/dir1', '/selected/dir2'];
    mockedOpen.mockResolvedValue(mockPaths);

    const result = await capabilities.pickDirectory({ multiple: true });

    expect(mockedOpen).toHaveBeenCalledWith({ multiple: true, directory: true });
    expect(result).toEqual(mockPaths);
  });

  it('pickDirectory should return null if open returns null', async () => {
    mockedOpen.mockResolvedValue(null);
    const result = await capabilities.pickDirectory();
    expect(result).toBeNull();
  });
  
   it('pickDirectory should return null and log error on open failure', async () => {
    const mockError = 'Failed to pick';
    mockedOpen.mockRejectedValue(mockError);

    const result = await capabilities.pickDirectory();
    expect(result).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('pickDirectory (dialog plugin) Error'), mockError);
  });

  // --- pickSaveFile Tests ---
  it('pickSaveFile should call save and return path', async () => {
    const mockPath = '/save/here.json';
    mockedSave.mockResolvedValue(mockPath);

    const result = await capabilities.pickSaveFile({ defaultPath: '/save/here.json', accept: '.json' });

    expect(mockedSave).toHaveBeenCalledWith({ defaultPath: '/save/here.json', filters: [{ name: 'File', extensions: ['json'] }] });
    expect(result).toBe(mockPath);
  });

  it('pickSaveFile should return null if save returns null', async () => {
    mockedSave.mockResolvedValue(null);
    const result = await capabilities.pickSaveFile();
    expect(result).toBeNull();
  });

   it('pickSaveFile should return null and log on save failure', async () => {
    const mockError = 'Save cancelled';
    mockedSave.mockRejectedValue(mockError);

    const result = await capabilities.pickSaveFile();
    expect(result).toBeNull();
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('pickSaveFile Dialog cancelled or errored'), mockError);
  });
}); 