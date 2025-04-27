import { describe, it, expect, vi, beforeEach } from 'vitest';
// Import the FACTORY function
import { createTauriFileSystemCapabilities } from './tauriPlatformCapabilities';

// REMOVE vi.mock
// vi.mock('@tauri-apps/api', ...);

// REMOVE dialog import
// import { dialog } from '@tauri-apps/api';

describe('createTauriFileSystemCapabilities - Dialog Tests', () => {
  // Create mocks for the dependencies
  let mockOpen: ReturnType<typeof vi.fn>;
  let mockSave: ReturnType<typeof vi.fn>;
  let mockInvoke: ReturnType<typeof vi.fn>; // Dummy mock for invoke

  beforeEach(() => {
    // Reset mocks before each test
    mockOpen = vi.fn();
    mockSave = vi.fn();
    mockInvoke = vi.fn(); // Initialize dummy invoke mock
  });

  // --- pickFile Tests ---
  it('pickFile should call injected open function and return path', async () => {
    const mockPath = '/path/to/selected/file.txt';
    // Configure the mock dialog function
    mockOpen.mockResolvedValue(mockPath);

    // Create capabilities instance with mock dependencies
    const capabilities = createTauriFileSystemCapabilities({ invoke: mockInvoke, open: mockOpen, save: mockSave });

    const result = await capabilities.pickFile();
    expect(mockOpen).toHaveBeenCalledOnce();
    expect(mockOpen).toHaveBeenCalledWith({ multiple: false, filters: undefined });
    expect(result).toBe(mockPath);
  });

  it('pickFile should handle injected open function cancellation', async () => {
    mockOpen.mockResolvedValue(null);
    const capabilities = createTauriFileSystemCapabilities({ invoke: mockInvoke, open: mockOpen, save: mockSave });
    const result = await capabilities.pickFile();
    expect(result).toBeNull();
    expect(mockOpen).toHaveBeenCalledOnce();
  });

  it('pickFile should handle injected open function error', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const testError = new Error('Dialog error');
    mockOpen.mockRejectedValue(testError);
    const capabilities = createTauriFileSystemCapabilities({ invoke: mockInvoke, open: mockOpen, save: mockSave });
    const result = await capabilities.pickFile();
    expect(result).toBeNull();
    expect(mockOpen).toHaveBeenCalledOnce();
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error picking file:', testError);
    consoleErrorSpy.mockRestore();
  });

  it('pickFile should pass accept options to injected open function', async () => {
    mockOpen.mockResolvedValue('/path/to/file.txt');
    const capabilities = createTauriFileSystemCapabilities({ invoke: mockInvoke, open: mockOpen, save: mockSave });
    await capabilities.pickFile({ accept: '.txt,.csv' });
    expect(mockOpen).toHaveBeenCalledOnce();
    expect(mockOpen).toHaveBeenCalledWith({ multiple: false, filters: [{ name: 'File', extensions: ['txt', 'csv'] }] });
  });

  // --- pickSaveFile Tests ---
  it('pickSaveFile should call injected save function and return path', async () => {
    const mockPath = '/path/to/save/file.txt';
    mockSave.mockResolvedValue(mockPath);
    const capabilities = createTauriFileSystemCapabilities({ invoke: mockInvoke, open: mockOpen, save: mockSave });
    const result = await capabilities.pickSaveFile();
    expect(mockSave).toHaveBeenCalledOnce();
    expect(mockSave).toHaveBeenCalledWith({ defaultPath: undefined, filters: undefined });
    expect(result).toBe(mockPath);
  });

  it('pickSaveFile should handle injected save function cancellation', async () => {
    mockSave.mockResolvedValue(null);
    const capabilities = createTauriFileSystemCapabilities({ invoke: mockInvoke, open: mockOpen, save: mockSave });
    const result = await capabilities.pickSaveFile();
    expect(result).toBeNull();
    expect(mockSave).toHaveBeenCalledOnce();
  });

  it('pickSaveFile should handle injected save function error', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const testError = new Error('Dialog error');
    mockSave.mockRejectedValue(testError);
    const capabilities = createTauriFileSystemCapabilities({ invoke: mockInvoke, open: mockOpen, save: mockSave });
    const result = await capabilities.pickSaveFile();
    expect(result).toBeNull();
    expect(mockSave).toHaveBeenCalledOnce();
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error picking save file:', testError);
    consoleErrorSpy.mockRestore();
  });

   it('pickSaveFile should pass options to injected save function', async () => {
    mockSave.mockResolvedValue('/path/to/default.json');
    const capabilities = createTauriFileSystemCapabilities({ invoke: mockInvoke, open: mockOpen, save: mockSave });
    await capabilities.pickSaveFile({ accept: '.json', defaultPath: '/tmp/default.json' });
    expect(mockSave).toHaveBeenCalledOnce();
    expect(mockSave).toHaveBeenCalledWith({ defaultPath: '/tmp/default.json', filters: [{ name: 'File', extensions: ['json'] }] });
  });
}); 