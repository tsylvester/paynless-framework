import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getPlatformCapabilities, resetMemoizedCapabilities } from './index';
import type { PlatformCapabilities } from '@paynless/types';

// Define a type for the global window object to allow adding __TAURI__
declare global {
  interface Window {
    __TAURI__?: object; // Presence indicates Tauri environment
  }
}

describe('getPlatformCapabilities', () => {
  // Store original window property if it exists
  const originalTauri = window.__TAURI__;

  beforeEach(() => {
    // Reset capabilities memoization and window state
    resetMemoizedCapabilities();
    if (originalTauri) {
      window.__TAURI__ = originalTauri;
    } else {
      delete window.__TAURI__;
    }
  });

  afterEach(() => {
    // Clean up mocks and window state
    vi.resetAllMocks();
    resetMemoizedCapabilities();
    if (originalTauri) {
      window.__TAURI__ = originalTauri;
    } else {
      delete window.__TAURI__;
    }
  });

  it('should return an object conforming to PlatformCapabilities interface', () => {
    const capabilities = getPlatformCapabilities();
    expect(capabilities).toBeTypeOf('object');
    expect(capabilities).toHaveProperty('platform');
    expect(capabilities).toHaveProperty('fileSystem');
    expect(capabilities.fileSystem).toHaveProperty('isAvailable');
    expect(capabilities.fileSystem.isAvailable).toBe(false); // Default is unavailable
  });

  it('should detect web platform when __TAURI__ is not present', () => {
    delete window.__TAURI__;
    const capabilities = getPlatformCapabilities();
    expect(capabilities.platform).toBe('web');
  });

  it('should detect tauri platform when __TAURI__ is present', () => {
    window.__TAURI__ = {}; // Simulate Tauri environment
    const capabilities = getPlatformCapabilities();
    expect(capabilities.platform).toBe('tauri');
  });

  // Placeholder for future React Native detection test
  // it('should detect react-native platform', () => {
  //   // Simulate React Native environment (e.g., navigator.product === 'ReactNative')
  //   Object.defineProperty(navigator, 'product', { value: 'ReactNative', configurable: true });
  //   const capabilities = getPlatformCapabilities();
  //   expect(capabilities.platform).toBe('react-native');
  //   Object.defineProperty(navigator, 'product', { value: originalNavigatorProduct, configurable: true }); // Clean up
  // });

  it('should return fileSystem as unavailable by default for detected platforms', () => {
    // Test web
    delete window.__TAURI__;
    let capabilities = getPlatformCapabilities();
    expect(capabilities.platform).toBe('web'); // Verify detection first
    expect(capabilities.fileSystem.isAvailable).toBe(false);

    // Reset for next check
    resetMemoizedCapabilities();

    // Test tauri
    window.__TAURI__ = {};
    capabilities = getPlatformCapabilities();
    expect(capabilities.platform).toBe('tauri'); // Verify detection first
    expect(capabilities.fileSystem.isAvailable).toBe(false);
  });

  it('should memoize the result after the first call', () => {
    // Simulate web
    delete window.__TAURI__;
    const caps1 = getPlatformCapabilities();
    expect(caps1.platform).toBe('web');

    // Simulate Tauri *without* resetting memoization
    window.__TAURI__ = {};
    const caps2 = getPlatformCapabilities();

    // Should still return the *first* detected result (web)
    expect(caps2.platform).toBe('web');

    // Now reset and check Tauri again
    resetMemoizedCapabilities();
    const caps3 = getPlatformCapabilities();
    expect(caps3.platform).toBe('tauri');
  });
}); 