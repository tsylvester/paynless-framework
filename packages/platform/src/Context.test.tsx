import React, { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PlatformProvider,
  usePlatform,
  DEFAULT_INITIAL_CAPABILITIES
} from './context';
import type { PlatformCapabilities, FileSystemCapabilities } from '@paynless/types';

// *** Mock the centralized service function from ./index ***
const mockGetPlatformCapabilities = vi.fn();
vi.mock('./index', async (importOriginal) => {
  const original = await importOriginal<typeof import('./index')>();
  return {
    ...original, // Keep other exports like resetMemoizedCapabilities if needed
    getPlatformCapabilities: mockGetPlatformCapabilities,
  };
});

// --- Test Data (Define mock capabilities) ---

const mockWebCapabilities: PlatformCapabilities = {
  platform: 'web',
  os: 'linux', // Example OS
  fileSystem: { isAvailable: false },
};

const mockTauriCapabilities: PlatformCapabilities = {
  platform: 'tauri',
  os: 'windows', // Example OS
  fileSystem: {
    isAvailable: true,
    // Add dummy methods if needed for type checking, though usually not required
    // if only checking the structure received by the consumer.
    readFile: vi.fn(),
    writeFile: vi.fn(),
    pickFile: vi.fn(),
    pickDirectory: vi.fn(),
    pickSaveFile: vi.fn(),
  },
};

// --- Test Component & Helper ---

const TestConsumer = () => {
  const capabilities = usePlatform();
  // Render the received capabilities for testing
  return <div data-testid="capabilities">{JSON.stringify(capabilities)}</div>;
};

const renderWithProvider = (ui: ReactNode) => {
  return render(
    <PlatformProvider>{ui}</PlatformProvider>
  );
};

describe('PlatformProvider', () => {

  beforeEach(() => {
    // Reset the mock before each test
    mockGetPlatformCapabilities.mockReset();
    // Default mock implementation (e.g., resolves to web)
    mockGetPlatformCapabilities.mockResolvedValue(mockWebCapabilities);
  });

  afterEach(() => {
    vi.restoreAllMocks(); 
  });

  it('should initially provide default capabilities and then resolved capabilities', async () => {
    // Mock the service call to resolve with specific web capabilities
    mockGetPlatformCapabilities.mockResolvedValue(mockWebCapabilities);

    renderWithProvider(<TestConsumer />);

    // Check initial state (might still show default before async effect completes)
    // Note: Depending on timing, this might sometimes see the resolved state immediately.
    const capsElement = screen.getByTestId('capabilities');
    const initialCapabilities = JSON.parse(capsElement.textContent || '{}') as PlatformCapabilities;
    expect(initialCapabilities).toEqual(DEFAULT_INITIAL_CAPABILITIES);
    
    // Wait for the async effect to complete and check final state
    await waitFor(() => {
      const finalCapabilities = JSON.parse(screen.getByTestId('capabilities').textContent || '{}') as PlatformCapabilities;
      expect(finalCapabilities).toEqual(mockWebCapabilities);
    });

    // Ensure the service function was called
    expect(mockGetPlatformCapabilities).toHaveBeenCalledTimes(1);
  });

  it('should provide Tauri capabilities when service resolves with them', async () => {
    // Mock the service call to resolve with Tauri capabilities
    mockGetPlatformCapabilities.mockResolvedValue(mockTauriCapabilities);

    renderWithProvider(<TestConsumer />);

    // Wait for the async effect and check final state
    await waitFor(() => {
      const finalCapabilities = JSON.parse(screen.getByTestId('capabilities').textContent || '{}') as PlatformCapabilities;
      expect(finalCapabilities).toEqual(mockTauriCapabilities);
      // Check specific properties as well
      expect(finalCapabilities.platform).toBe('tauri');
      expect(finalCapabilities.fileSystem.isAvailable).toBe(true);
    });

    expect(mockGetPlatformCapabilities).toHaveBeenCalledTimes(1);
  });

  it('should provide default capabilities and log error when service rejects', async () => {
    const mockError = new Error('Service Failure');
    // Mock the service call to reject
    mockGetPlatformCapabilities.mockRejectedValue(mockError);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderWithProvider(<TestConsumer />);

    // Wait for the async effect to complete (or fail)
    await waitFor(() => {
      const finalCapabilities = JSON.parse(screen.getByTestId('capabilities').textContent || '{}') as PlatformCapabilities;
      // Should fall back to the default initial state
      expect(finalCapabilities).toEqual(DEFAULT_INITIAL_CAPABILITIES);
    });
    
    // Check that the error was logged
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error getting capabilities from service:'), mockError);
    expect(mockGetPlatformCapabilities).toHaveBeenCalledTimes(1);
    consoleErrorSpy.mockRestore();
  });

  // Add more tests if specific loading states or other behaviors need verification

});
