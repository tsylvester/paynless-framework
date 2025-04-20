import React, { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PlatformCapabilitiesProvider,
  usePlatformCapabilities,
} from './PlatformCapabilitiesContext'; // Assuming this is the correct path
import type { PlatformCapabilities } from '@paynless/types';
// Import the specific module we need to modify
import * as core from '@tauri-apps/api/core';

// --- Mocks Setup ---

// Static mock for isTauri - Now a function returning false
vi.mock('@tauri-apps/api/core', () => ({
  isTauri: vi.fn(() => false),
}));

// Mock @tauri-apps/api (dummy DI functions)
vi.mock('@tauri-apps/api', () => ({
  dialog: {
    open: vi.fn(),
    save: vi.fn(),
  },
  tauri: {
    invoke: vi.fn(),
  },
}));

// Mock the factory function from ./tauriPlatformCapabilities
const mockTauriCapabilities = {
  isAvailable: true as const, 
  readFile: vi.fn(),
  writeFile: vi.fn(),
  pickFile: vi.fn(),
  pickSaveFile: vi.fn(),
};
vi.mock('./tauriPlatformCapabilities', () => ({
  createTauriFileSystemCapabilities: vi.fn(() => mockTauriCapabilities),
}));

// --- Test Component & Helper ---

// Helper component to consume the context
const TestConsumer = () => {
  const capabilities = usePlatformCapabilities();
  if (capabilities === null) {
    return <div>Loading...</div>;
  }
  return <div data-testid="capabilities">{JSON.stringify(capabilities)}</div>;
};

// Helper to render with provider
const renderWithProvider = (ui: ReactNode) => {
  return render(
    <PlatformCapabilitiesProvider>{ui}</PlatformCapabilitiesProvider>
  );
};

describe('PlatformCapabilitiesProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Remove the attempt to reset the property directly
    // try { (core as any).isTauri = false; } catch (e) {}
    vi.restoreAllMocks(); // This will reset the mock function's implementation
  });

  // Test for the default (web) case
  it('should eventually provide web capabilities when isTauri is false', async () => {
    // No spy needed, relies on default static mock
    renderWithProvider(<TestConsumer />);
    await waitFor(() => {
      const capsElement = screen.getByTestId('capabilities');
      const capabilities = JSON.parse(capsElement.textContent || '') as PlatformCapabilities;
      expect(capabilities.platform).toBe('web');
      expect(capabilities.fileSystem.isAvailable).toBe(false);
    });
  });

  // Test for the default (web) case - explicit
  it('should detect web environment (window defined, isTauri is false)', async () => {
    // No spy needed, relies on default static mock
    renderWithProvider(<TestConsumer />);
    await waitFor(() => {
      const capsElement = screen.getByTestId('capabilities');
      const capabilities = JSON.parse(capsElement.textContent || '') as PlatformCapabilities;
      expect(capabilities.platform).toBe('web');
      expect(capabilities.fileSystem.isAvailable).toBe(false);
    });
  });

  // Test for Tauri case - Change the mock function's return value
  it('should detect Tauri environment when isTauri is true', async () => {
    // Change the mock function's return value for this test
    vi.mocked(core.isTauri).mockReturnValue(true);

    // Mock the factory return value
    const { createTauriFileSystemCapabilities } = await import('./tauriPlatformCapabilities');
    vi.mocked(createTauriFileSystemCapabilities).mockReturnValue(mockTauriCapabilities);

    renderWithProvider(<TestConsumer />);

    await waitFor(() => {
      const capsElement = screen.getByTestId('capabilities');
      const capabilities = JSON.parse(capsElement.textContent || '') as PlatformCapabilities;
      expect(capabilities.platform).toBe('tauri');
      expect(capabilities.fileSystem.isAvailable).toBe(true);
      expect(createTauriFileSystemCapabilities).toHaveBeenCalled();
    });

    // Verify the mock function was called
    expect(core.isTauri).toHaveBeenCalled();
  });

  // Test for error handling in Tauri case - Change the mock function's return value
  it('should handle errors when loading Tauri capabilities module (when isTauri is true)', async () => {
    // Change the mock function's return value for this test
    vi.mocked(core.isTauri).mockReturnValue(true);

    // Mock the factory function to throw an error
    const loadError = new Error('Failed to create Tauri capabilities');
    const { createTauriFileSystemCapabilities } = await import('./tauriPlatformCapabilities');
    vi.mocked(createTauriFileSystemCapabilities).mockImplementation(() => {
      throw loadError;
    });

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderWithProvider(<TestConsumer />);

    await waitFor(() => {
      const capsElement = screen.getByTestId('capabilities');
      const capabilities = JSON.parse(capsElement.textContent || '') as PlatformCapabilities;
      expect(capabilities.platform).toBe('tauri');
      expect(capabilities.fileSystem.isAvailable).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error loading specific platform capabilities module:', loadError);
    });

    // Verify the mock function was called
    expect(core.isTauri).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  // --- Placeholder Tests (Implementing first one) ---

  // This test might be redundant if the first 'web' test covers it.
  // Purpose: Explicitly test non-Tauri path in a browser-like JSDOM env.
  it('should explicitly detect web environment (window defined, isTauri is false)', async () => {
    // Relies on the default static mock (isTauri: false)
    // JSDOM environment provides a window object by default.

    renderWithProvider(<TestConsumer />);

    await waitFor(() => {
      const capsElement = screen.getByTestId('capabilities');
      expect(capsElement).toBeInTheDocument();
      const capabilities = JSON.parse(capsElement.textContent || '') as PlatformCapabilities;
      expect(capabilities.platform).toBe('web');
      expect(capabilities.fileSystem.isAvailable).toBe(false);
    });
  });

  it('should fallback to web for React Native (placeholder)', () => {
    // TODO: Mock environment for React Native (e.g., navigator.product)
    expect(true).toBe(false); // Placeholder
  });

  it('should fallback to web for Node/Headless (JSDOM simulation - placeholder)', () => {
    // TODO: Mock environment for Node (e.g., ensure window is undefined?)
    expect(true).toBe(false); // Placeholder
  });

});
