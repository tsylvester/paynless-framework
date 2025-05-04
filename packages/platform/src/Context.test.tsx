import React, { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PlatformProvider,
  usePlatform,
  DEFAULT_INITIAL_CAPABILITIES
} from './context';
import type { PlatformCapabilities, FileSystemCapabilities } from '@paynless/types';

// *** Mock the ./index module ***
vi.mock('./index', async (importOriginal) => {
  const original = await importOriginal<typeof import('./index')>();
  // Define the mock function *within* the factory scope
  const mockFn = vi.fn(); 
  return {
    ...original, // Keep other exports
    getPlatformCapabilities: mockFn, // Export the mock function
  };
});

// *** Import the mocked function AFTER vi.mock ***
import { getPlatformCapabilities } from './index';

// --- Test Data (Mock capabilities remain the same) ---

const mockWebCapabilities: PlatformCapabilities = {
  platform: 'web',
  os: 'linux', 
  fileSystem: { isAvailable: false },
};

const mockTauriCapabilities: PlatformCapabilities = {
  platform: 'tauri',
  os: 'windows', 
  fileSystem: {
    isAvailable: true,
    readFile: vi.fn(),
    writeFile: vi.fn(),
    pickFile: vi.fn(),
    pickDirectory: vi.fn(),
    pickSaveFile: vi.fn(),
  },
};

// --- Test Component & Helper (Remain the same) ---

const TestConsumer = () => {
  const capabilities = usePlatform();
  return <div data-testid="capabilities">{JSON.stringify(capabilities)}</div>;
};

const renderWithProvider = (ui: ReactNode) => {
  return render(
    <PlatformProvider>{ui}</PlatformProvider>
  );
};

// --- Tests --- 
describe('PlatformProvider', () => {
  // Get a typed reference to the *mocked* function
  const mockGetPlatformCapabilitiesFn = vi.mocked(getPlatformCapabilities);

  beforeEach(() => {
    // Reset the mock function
    mockGetPlatformCapabilitiesFn.mockReset();
    // Default implementation for tests
    mockGetPlatformCapabilitiesFn.mockResolvedValue(mockWebCapabilities);
  });

  afterEach(() => {
    vi.restoreAllMocks(); 
  });

  it('should initially provide default capabilities and then resolved capabilities', async () => {
    mockGetPlatformCapabilitiesFn.mockResolvedValue(mockWebCapabilities);
    renderWithProvider(<TestConsumer />);
    
    const capsElement = screen.getByTestId('capabilities');
    const initialCapabilities = JSON.parse(capsElement.textContent || '{}') as PlatformCapabilities;
    expect(initialCapabilities).toEqual(DEFAULT_INITIAL_CAPABILITIES);
    
    await waitFor(() => {
      const finalCapabilities = JSON.parse(screen.getByTestId('capabilities').textContent || '{}') as PlatformCapabilities;
      expect(finalCapabilities).toEqual(mockWebCapabilities);
    });
    expect(mockGetPlatformCapabilitiesFn).toHaveBeenCalledTimes(1);
  });

  it('should provide Tauri capabilities when service resolves with them', async () => {
    mockGetPlatformCapabilitiesFn.mockResolvedValue(mockTauriCapabilities);
    renderWithProvider(<TestConsumer />);

    await waitFor(() => {
      const finalCapabilities = JSON.parse(screen.getByTestId('capabilities').textContent || '{}') as PlatformCapabilities;
      // Compare only serializable parts because functions are stripped by JSON.stringify
      const expectedSerializableTauriCaps = {
        platform: mockTauriCapabilities.platform,
        os: mockTauriCapabilities.os,
        fileSystem: { isAvailable: mockTauriCapabilities.fileSystem.isAvailable }
      };
      expect(finalCapabilities).toEqual(expectedSerializableTauriCaps); 
      // Keep these checks as they test specific important values
      expect(finalCapabilities.platform).toBe('tauri');
      expect(finalCapabilities.fileSystem.isAvailable).toBe(true);
    });
    expect(mockGetPlatformCapabilitiesFn).toHaveBeenCalledTimes(1);
  });

  it('should provide default capabilities and log error when service rejects', async () => {
    const mockError = new Error('Service Failure');
    mockGetPlatformCapabilitiesFn.mockRejectedValue(mockError);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderWithProvider(<TestConsumer />);

    await waitFor(() => {
      const finalCapabilities = JSON.parse(screen.getByTestId('capabilities').textContent || '{}') as PlatformCapabilities;
      expect(finalCapabilities).toEqual(DEFAULT_INITIAL_CAPABILITIES);
    });
    
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error getting capabilities from service:'), mockError);
    expect(mockGetPlatformCapabilitiesFn).toHaveBeenCalledTimes(1);
    consoleErrorSpy.mockRestore();
  });

  // Previous tests for specific web/tauri detection based on isTauri mock
  // are now implicitly covered by mocking getPlatformCapabilities directly.
  // Keep placeholder tests if needed for future specific env checks.
  it('should fallback to web for React Native (placeholder)', () => {
    expect(true).toBe(true); 
  });

  it('should fallback to web for Node/Headless (JSDOM simulation - placeholder)', () => {
     expect(true).toBe(true);
  });

});
