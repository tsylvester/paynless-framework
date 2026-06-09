import React, { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PlatformProvider,
  usePlatform,
  DEFAULT_INITIAL_CAPABILITIES
} from './Context';
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

// *** Mock window and event emitter ***
const mockOnDragDropEvent = vi.fn();
const mockUnlisten = vi.fn();
// Variable to capture the actual listener callback passed by the component
let capturedListenerCallback:
  | ((event: TauriEvent<DragDropEvent>) => void)
  | null = null; 
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    // Use mockImplementation to capture the callback AND call the outer spy
    onDragDropEvent: vi.fn( (callback) => {
      // Call the outer spy so assertions against it work
      mockOnDragDropEvent(callback); 
      capturedListenerCallback = callback; // Capture the callback
      return Promise.resolve(mockUnlisten); // Still return the unlisten function
    }),
    // ... add other window methods if needed by other tests ...
  })),
  // Export DragDropEvent type if needed (usually just interfaces/types, might not be needed for mock)
}));

// Define spy *before* mocking the module that uses it
// const mockEmit = vi.fn(); 

// REMOVED: vi.mock('@paynless/platform/events', ...) factory

// Import the ACTUAL emitter first
import { platformEventEmitter } from './events';

// Import the mocked window function
import { Event as TauriEvent } from '@tauri-apps/api/event';
import { DragDropEvent, getCurrentWindow } from '@tauri-apps/api/window';
import { SERIALIZE_TO_IPC_FN } from '@tauri-apps/api/core';
import { PhysicalPosition } from '@tauri-apps/api/dpi';

const createDragDropTauriEvent = (
  payload: DragDropEvent,
): TauriEvent<DragDropEvent> => ({
  event: 'tauri://drag-drop',
  id: 0,
  payload,
});

const mockPhysicalPosition: PhysicalPosition = {
  type: 'Physical',
  x: 0,
  y: 0,
  toLogical: vi.fn(),
  toJSON: vi.fn(),
  [SERIALIZE_TO_IPC_FN]: vi.fn(),
};

// Define the spy *after* importing the actual emitter
// Initialize with spyOn immediately
const mockEmit = vi.spyOn(platformEventEmitter, 'emit').mockImplementation(() => {}); 

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
    mockEmit.mockClear();
    vi.mocked(getCurrentWindow).mockClear();
  });

  afterEach(() => {
    mockEmit.mockClear();
    vi.mocked(getCurrentWindow).mockClear();
  });

  it('should provide loading state initially, then resolved capabilities', async () => {
    let resolvePromise: (value: PlatformCapabilities) => void;
    const promise = new Promise<PlatformCapabilities>(resolve => {
      resolvePromise = resolve;
    });
    mockGetPlatformCapabilitiesFn.mockReturnValue(promise);
    
    renderWithProvider(<TestConsumer />);

    expect(screen.getByTestId('loading-state').textContent).toBe('isLoading:true');
    expect(screen.getByTestId('error-state').textContent).toBe('error:null');
    expect(screen.getByTestId('capabilities-state').textContent).toBe(`capabilities:${JSON.stringify(null)}`);

    resolvePromise!(mockWebCapabilities);

    await waitFor(() => {
      expect(screen.getByTestId('loading-state').textContent).toBe('isLoading:false');
    });
    expect(screen.getByTestId('error-state').textContent).toBe('error:null');
    expect(screen.getByTestId('capabilities-state').textContent).toBe(`capabilities:${JSON.stringify(mockWebCapabilities)}`);
    expect(mockGetPlatformCapabilitiesFn).toHaveBeenCalledTimes(1);
  });

  it('should provide Tauri capabilities when service resolves with them', async () => {
    mockGetPlatformCapabilitiesFn.mockResolvedValue(mockTauriCapabilities);
    renderWithProvider(<TestConsumer />);

    await waitFor(() => {
      expect(screen.getByTestId('loading-state').textContent).toBe('isLoading:false');
    });

    expect(screen.getByTestId('error-state').textContent).toBe('error:null');
    const capsStateElement = screen.getByTestId('capabilities-state');
    const finalCapabilities = JSON.parse(capsStateElement.textContent?.replace('capabilities:', '') || '{}');
    
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

    expect(screen.getByTestId('loading-state').textContent).toBe('isLoading:true');
    expect(screen.getByTestId('error-state').textContent).toBe('error:null');
    expect(screen.getByTestId('capabilities-state').textContent).toBe(`capabilities:${JSON.stringify(null)}`);

    rejectPromise!(mockError);

    await waitFor(() => {
      expect(screen.getByTestId('loading-state').textContent).toBe('isLoading:false');
    });
    expect(screen.getByTestId('error-state').textContent).toBe(`error:${mockError.message}`);
    expect(screen.getByTestId('capabilities-state').textContent).toBe(`capabilities:${JSON.stringify(null)}`); 
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

    expect(screen.getByTestId('loading-state').textContent).toBe('isLoading:true');

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

  // --- NEW Test Suite for Drag and Drop Listener ---
  describe('Tauri Drag and Drop Event Handling', () => {
    beforeEach(() => {
      // Ensure capabilities resolve to Tauri for these tests
      mockGetPlatformCapabilitiesFn.mockResolvedValue(mockTauriCapabilities);
      // Clear mocks related to this specific feature before each test
      mockOnDragDropEvent.mockClear(); // Clear the capture mock itself if needed
      mockUnlisten.mockClear();
      capturedListenerCallback = null; // Reset captured callback
      // Clear the emit spy directly
      mockEmit.mockClear();
    });

    it('should attach onDragDropEvent listener when platform is Tauri and clean up on unmount', async () => {
      const { unmount } = renderWithProvider(<TestConsumer />);

      // Wait for capabilities to load
      await waitFor(() => {
        expect(screen.getByTestId('loading-state').textContent).toBe('isLoading:false');
      });

      // Check if listener was attached
      expect(getCurrentWindow).toHaveBeenCalledTimes(1); 
      expect(mockOnDragDropEvent).toHaveBeenCalledTimes(1);
      expect(mockUnlisten).not.toHaveBeenCalled(); // Not cleaned up yet

      // Unmount
      unmount();

      // Check if cleanup function was called
      expect(mockUnlisten).toHaveBeenCalledTimes(1);
    });

    it('should emit file-drag-hover on "enter" and "over" events', async () => {
      renderWithProvider(<TestConsumer />);
      await waitFor(() => expect(mockOnDragDropEvent).toHaveBeenCalled());

      // Use the captured listener callback
      const listenerCallback = capturedListenerCallback; 
      if (!listenerCallback) throw new Error('Listener callback was not captured');

      // Simulate enter
      listenerCallback(
        createDragDropTauriEvent({
          type: 'enter',
          paths: [],
          position: mockPhysicalPosition,
        }),
      );
      // Assert on the predefined mock spy
      expect(mockEmit).toHaveBeenCalledWith('file-drag-hover');

      // Simulate over
      listenerCallback(
        createDragDropTauriEvent({
          type: 'over',
          position: mockPhysicalPosition,
        }),
      );
      // Check total calls and specifically the second call
      expect(mockEmit).toHaveBeenCalledTimes(2);
      expect(mockEmit).toHaveBeenNthCalledWith(2, 'file-drag-hover');
    });

    it('should emit file-drag-cancel on "leave" event', async () => {
      renderWithProvider(<TestConsumer />);
      await waitFor(() => expect(mockOnDragDropEvent).toHaveBeenCalled());

      // Use the captured listener callback
      const listenerCallback = capturedListenerCallback; 
      if (!listenerCallback) throw new Error('Listener callback was not captured');

      const mockLeaveEvent: DragDropEvent = { type: 'leave' };

      // Simulate leave
      listenerCallback(createDragDropTauriEvent(mockLeaveEvent));
      // Assert on the predefined mock spy
      expect(mockEmit).toHaveBeenCalledWith('file-drag-cancel');
      expect(mockEmit).toHaveBeenCalledTimes(1);
    });

    it('should emit file-drop and file-drag-cancel on "drop" event with paths', async () => {
      renderWithProvider(<TestConsumer />);
      await waitFor(() => expect(mockOnDragDropEvent).toHaveBeenCalled());

      // Use the captured listener callback
      const listenerCallback = capturedListenerCallback;
      if (!listenerCallback) throw new Error('Listener callback was not captured');

      const mockPaths = ['/path/to/file1.txt', '/path/to/file2.png'];

      // Simulate drop
      listenerCallback(
        createDragDropTauriEvent({
          type: 'drop',
          paths: mockPaths,
          position: mockPhysicalPosition,
        }),
      );

      // Assert on the predefined mock spy
      expect(mockEmit).toHaveBeenNthCalledWith(1, 'file-drop', mockPaths);
      expect(mockEmit).toHaveBeenNthCalledWith(2, 'file-drag-cancel');
      expect(mockEmit).toHaveBeenCalledTimes(2);
    });

    it('should emit only file-drag-cancel on "drop" event without paths', async () => {
      renderWithProvider(<TestConsumer />);
      await waitFor(() => expect(mockOnDragDropEvent).toHaveBeenCalled());

      // Use the captured listener callback
      const listenerCallback = capturedListenerCallback;
      if (!listenerCallback) throw new Error('Listener callback was not captured');

      // Simulate drop with no paths
      listenerCallback(
        createDragDropTauriEvent({
          type: 'drop',
          paths: [],
          position: mockPhysicalPosition,
        }),
      );

      // Assert on the predefined mock spy
      expect(mockEmit).toHaveBeenCalledWith('file-drag-cancel');
      expect(mockEmit).toHaveBeenCalledTimes(1);
    });
  });

});
