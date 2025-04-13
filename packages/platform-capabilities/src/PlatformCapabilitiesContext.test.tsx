import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlatformCapabilitiesProvider, usePlatformCapabilities } from './PlatformCapabilitiesContext';
import type { PlatformCapabilities, FileSystemCapabilities } from '@paynless/types';

// --- Mocking Setup ---
// Mock Web provider
vi.mock('./webPlatformCapabilities', () => ({
  webFileSystemCapabilities: { isAvailable: false },
}));

// Mock the dynamic import target for Tauri
const mockTauriProvider: FileSystemCapabilities = {
  isAvailable: true,
  pickFile: vi.fn().mockResolvedValue('/mock/tauri/picked'),
  pickSaveFile: vi.fn().mockResolvedValue('/mock/tauri/saved'),
  readFile: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
  writeFile: vi.fn().mockResolvedValue(undefined),
};
vi.mock('./tauriPlatformCapabilities', () => ({
  tauriFileSystemCapabilities: mockTauriProvider,
}));
// ---------------------

// Define a type for the global window object
declare global {
  interface Window {
    __TAURI__?: unknown; // Use unknown to avoid conflicts
  }
}

describe('PlatformCapabilitiesContext', () => {
  const originalTauri = window.__TAURI__;

  beforeEach(() => {
    // Reset mocks before each test
    vi.resetAllMocks();
    // Reset __TAURI__ carefully
    if (originalTauri !== undefined) {
      window.__TAURI__ = originalTauri;
    } else {
      window.__TAURI__ = undefined;
    }
    // No need to reset memoization here as provider state handles it
  });

  afterEach(() => {
    vi.resetAllMocks();
    if (originalTauri !== undefined) {
      window.__TAURI__ = originalTauri;
    } else {
      window.__TAURI__ = undefined;
    }
  });

  it('usePlatformCapabilities should return null initially', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <PlatformCapabilitiesProvider>{children}</PlatformCapabilitiesProvider>
    );
    const { result } = renderHook(() => usePlatformCapabilities(), { wrapper });
    expect(result.current).toBeNull();
  });

  it('should provide web capabilities after mount in web environment', async () => {
    window.__TAURI__ = undefined;
    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <PlatformCapabilitiesProvider>{children}</PlatformCapabilitiesProvider>
    );
    const { result } = renderHook(() => usePlatformCapabilities(), { wrapper });

    // Wait for useEffect to run and update state
    await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current).not.toBeNull();
    expect(result.current?.platform).toBe('web');
    expect(result.current?.fileSystem.isAvailable).toBe(false);
  });

  it('should provide Tauri capabilities after mount in Tauri environment', async () => {
    window.__TAURI__ = {}; // Simulate Tauri

    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <PlatformCapabilitiesProvider>{children}</PlatformCapabilitiesProvider>
    );
    const { result } = renderHook(() => usePlatformCapabilities(), { wrapper });

     // Initially null
    expect(result.current).toBeNull();

    // Wait for useEffect, including the async dynamic import, to run and update state
    await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0)); // Allow async tasks
    });

    expect(result.current).not.toBeNull();
    expect(result.current?.platform).toBe('tauri');
    expect(result.current?.fileSystem.isAvailable).toBe(true);
    // Check if the mocked provider functions are present
    expect((result.current?.fileSystem as FileSystemCapabilities).pickFile).toBeDefined();
  });

}); 