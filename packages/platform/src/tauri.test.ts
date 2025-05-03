import { describe, it, expect, vi, beforeEach } from 'vitest';
// REMOVE mockIPC and clearMocks imports
// import { mockIPC, clearMocks } from '@tauri-apps/api/mocks';
// Import the FACTORY function now
import { createTauriFileSystemCapabilities } from './tauri';
import type { FileSystemCapabilities } from '@paynless/types';

// REMOVE vi.mock

// REMOVE tauri import
// import { tauri } from '@tauri-apps/api';

// REMOVE module-scoped mock variables
// let mockInvokeResponse: any = undefined;
// let mockInvokeError: any = undefined;

describe('createTauriFileSystemCapabilities - Invoke Tests', () => {
  // Create dummy mocks for dialog functions, as the factory requires them
  let mockOpen: ReturnType<typeof vi.fn>;
  let mockSave: ReturnType<typeof vi.fn>;
  let mockInvoke: ReturnType<typeof vi.fn>; // Mock for invoke

  beforeEach(() => {
    // REMOVE mock variable resets
    // REMOVE mockIPC setup

    // Reset mocks each time
    mockOpen = vi.fn();
    mockSave = vi.fn();
    mockInvoke = vi.fn();
  });

  // REMOVE afterEach with clearMocks
  // afterEach(() => { clearMocks(); });

  it('should report isAvailable as true', () => {
    // Need to call factory even for this simple test
    const capabilities = createTauriFileSystemCapabilities({ invoke: mockInvoke, open: mockOpen, save: mockSave });
    expect(capabilities.isAvailable).toBe(true);
  });

  // --- readFile Tests ---
  it('readFile should call invoke with correct args and return data', async () => {
    const mockPath = '/path/to/read.bin';
    const mockResponseData = [1, 2, 3, 4];
    // Configure the mock invoke for this test
    mockInvoke.mockResolvedValue(mockResponseData);

    // Create capabilities instance with the mock invoke
    const capabilities = createTauriFileSystemCapabilities({ invoke: mockInvoke, open: mockOpen, save: mockSave });

    const result = await capabilities.readFile(mockPath);

    // Check that invoke was called correctly
    expect(mockInvoke).toHaveBeenCalledOnce();
    expect(mockInvoke).toHaveBeenCalledWith('plugin:capabilities|read_file', { path: mockPath });

    // Check that the result matches the mocked response
    expect(result).toBeInstanceOf(Uint8Array);
    expect(Array.from(result)).toEqual(mockResponseData);
  });

  it('readFile should throw error when invoke rejects', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const mockPath = '/bad/path';
    const mockRustError = 'Read error message';
    // Configure the mock invoke to reject
    mockInvoke.mockRejectedValue(mockRustError);

    // Create capabilities instance
    const capabilities = createTauriFileSystemCapabilities({ invoke: mockInvoke, open: mockOpen, save: mockSave });

    await expect(capabilities.readFile(mockPath))
      .rejects.toThrow(`Failed to read file: ${mockRustError}`);

    // Check that invoke was called
    expect(mockInvoke).toHaveBeenCalledOnce();
    expect(mockInvoke).toHaveBeenCalledWith('plugin:capabilities|read_file', { path: mockPath });

    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  // --- writeFile Tests ---
  it('writeFile should call invoke with correct args and resolve', async () => {
    const mockPath = '/path/to/write.bin';
    const mockData = new Uint8Array([10, 20, 30]);
    const expectedInvokeArgs = { path: mockPath, data: [10, 20, 30] };
    // Configure mock invoke to resolve successfully (default is undefined)
    mockInvoke.mockResolvedValue(undefined);

    // Create capabilities instance
    const capabilities = createTauriFileSystemCapabilities({ invoke: mockInvoke, open: mockOpen, save: mockSave });

    await expect(capabilities.writeFile(mockPath, mockData))
      .resolves.toBeUndefined();

    // Check that invoke was called correctly
    expect(mockInvoke).toHaveBeenCalledOnce();
    expect(mockInvoke).toHaveBeenCalledWith('plugin:capabilities|write_file', expectedInvokeArgs);
  });

   it('writeFile should throw error when invoke rejects', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const mockPath = '/bad/write';
    const mockData = new Uint8Array([5, 6]);
    const expectedInvokeArgs = { path: mockPath, data: [5, 6] };
    const mockRustWriteError = 'Write error message';
    // Configure mock invoke to reject
    mockInvoke.mockRejectedValue(mockRustWriteError);

    // Create capabilities instance
    const capabilities = createTauriFileSystemCapabilities({ invoke: mockInvoke, open: mockOpen, save: mockSave });

    await expect(capabilities.writeFile(mockPath, mockData))
      .rejects.toThrow(`Failed to write file: ${mockRustWriteError}`);

     // Check that invoke was called correctly
    expect(mockInvoke).toHaveBeenCalledOnce();
    expect(mockInvoke).toHaveBeenCalledWith('plugin:capabilities|write_file', expectedInvokeArgs);

    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

}); 