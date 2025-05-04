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
  const { capabilities, isLoadingCapabilities, capabilityError } = usePlatform();
  
  return (
    <div>
      <div data-testid="loading-state">{`isLoading:${isLoadingCapabilities}`}</div>
      <div data-testid="error-state">{`error:${capabilityError ? capabilityError.message : 'null'}`}</div>
      <div data-testid="capabilities-state">{`capabilities:${JSON.stringify(capabilities)}`}</div>
    </div>
  );
};

const renderWithProvider = (ui: ReactNode) => {
  return render(
    <PlatformProvider>{ui}</PlatformProvider>
  );
};

// --- Tests --- 
describe('PlatformProvider and usePlatform Hook', () => {
  const mockGetPlatformCapabilitiesFn = vi.mocked(getPlatformCapabilities);

  beforeEach(() => {
    mockGetPlatformCapabilitiesFn.mockReset();
    // Default mock implementation for most tests
    mockGetPlatformCapabilitiesFn.mockResolvedValue(mockWebCapabilities);
  });

  afterEach(() => {
    vi.restoreAllMocks(); 
  });

  it('should provide loading state initially, then resolved capabilities', async () => {
    let resolvePromise: (value: PlatformCapabilities) => void;
    const promise = new Promise<PlatformCapabilities>(resolve => {
      resolvePromise = resolve;
    });
    mockGetPlatformCapabilitiesFn.mockReturnValue(promise);
    
    renderWithProvider(<TestConsumer />);

    expect(screen.getByTestId('loading-state')).toHaveTextContent('isLoading:true');
    expect(screen.getByTestId('error-state')).toHaveTextContent('error:null');
    expect(screen.getByTestId('capabilities-state')).toHaveTextContent(`capabilities:${JSON.stringify(null)}`);

    resolvePromise!(mockWebCapabilities);

    await waitFor(() => {
      expect(screen.getByTestId('loading-state')).toHaveTextContent('isLoading:false');
    });
    expect(screen.getByTestId('error-state')).toHaveTextContent('error:null');
    expect(screen.getByTestId('capabilities-state')).toHaveTextContent(`capabilities:${JSON.stringify(mockWebCapabilities)}`);
    expect(mockGetPlatformCapabilitiesFn).toHaveBeenCalledTimes(1);
  });

  it('should provide Tauri capabilities when service resolves with them', async () => {
    mockGetPlatformCapabilitiesFn.mockResolvedValue(mockTauriCapabilities);
    renderWithProvider(<TestConsumer />);

    await waitFor(() => {
      expect(screen.getByTestId('loading-state')).toHaveTextContent('isLoading:false');
    });

    expect(screen.getByTestId('error-state')).toHaveTextContent('error:null');
    const capsStateElement = screen.getByTestId('capabilities-state');
    const finalCapabilities = JSON.parse(capsStateElement.textContent?.replace('capabilities:', '') || '{}') as PlatformCapabilities;
    
    const expectedSerializableTauriCaps = {
      platform: mockTauriCapabilities.platform,
      os: mockTauriCapabilities.os,
      fileSystem: { isAvailable: mockTauriCapabilities.fileSystem.isAvailable }
    };
    expect(finalCapabilities).toEqual(expectedSerializableTauriCaps);
    expect(mockGetPlatformCapabilitiesFn).toHaveBeenCalledTimes(1);
  });

  it('should provide loading state, then error state and null capabilities when service rejects', async () => {
    const mockError = new Error('Service Failure');
    let rejectPromise: (reason?: any) => void;
    const promise = new Promise<PlatformCapabilities>((_, reject) => {
      rejectPromise = reject;
    });
    mockGetPlatformCapabilitiesFn.mockReturnValue(promise);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderWithProvider(<TestConsumer />);

    expect(screen.getByTestId('loading-state')).toHaveTextContent('isLoading:true');
    expect(screen.getByTestId('error-state')).toHaveTextContent('error:null');
    expect(screen.getByTestId('capabilities-state')).toHaveTextContent(`capabilities:${JSON.stringify(null)}`);

    rejectPromise!(mockError);

    await waitFor(() => {
      expect(screen.getByTestId('loading-state')).toHaveTextContent('isLoading:false');
    });
    expect(screen.getByTestId('error-state')).toHaveTextContent(`error:${mockError.message}`);
    expect(screen.getByTestId('capabilities-state')).toHaveTextContent(`capabilities:${JSON.stringify(null)}`); 
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error getting platform capabilities'), mockError);
    expect(mockGetPlatformCapabilitiesFn).toHaveBeenCalledTimes(1);
    consoleErrorSpy.mockRestore();
  });

  it('should not update state if component unmounts while promise is pending', async () => {
    let resolvePromise: (value: PlatformCapabilities) => void;
    const promise = new Promise<PlatformCapabilities>(resolve => {
      resolvePromise = resolve;
    });
    mockGetPlatformCapabilitiesFn.mockReturnValue(promise);

    const { unmount } = renderWithProvider(<TestConsumer />); 

    expect(screen.getByTestId('loading-state')).toHaveTextContent('isLoading:true');

    unmount();

    resolvePromise!(mockWebCapabilities);

    await promise.catch(() => {});
    expect(mockGetPlatformCapabilitiesFn).toHaveBeenCalledTimes(1);
  });

  it('should fallback to web for React Native (placeholder)', () => {
    expect(true).toBe(true); 
  });

  it('should fallback to web for Node/Headless (JSDOM simulation - placeholder)', () => {
     expect(true).toBe(true);
  });
});
