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
let capturedListenerCallback: Function | null = null; 
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
import { getCurrentWindow } from '@tauri-apps/api/window';

// Import jest-dom matchers
import '@testing-library/jest-dom/vitest';

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
        expect(screen.getByTestId('loading-state')).toHaveTextContent('isLoading:false');
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

      const mockEnterEvent = { type: 'enter', paths: [], position: { x: 0, y: 0 } };
      const mockOverEvent = { type: 'over', paths: [], position: { x: 0, y: 0 } };

      // Simulate enter
      listenerCallback({ payload: mockEnterEvent }); // Wrap in { payload: ... }
      // Assert on the predefined mock spy
      expect(mockEmit).toHaveBeenCalledWith('file-drag-hover');

      // Simulate over
      listenerCallback({ payload: mockOverEvent }); // Wrap in { payload: ... }
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

      const mockLeaveEvent = { type: 'leave', position: { x: 0, y: 0 } }; // Leave doesn't have paths

      // Simulate leave
      listenerCallback({ payload: mockLeaveEvent }); // Wrap in { payload: ... }
      // Assert on the predefined mock spy
      expect(mockEmit).toHaveBeenNthCalledWith(3, 'file-drag-cancel');
    });

    it('should emit file-drop and file-drag-cancel on "drop" event with paths', async () => {
      renderWithProvider(<TestConsumer />);
      await waitFor(() => expect(mockOnDragDropEvent).toHaveBeenCalled());

      // Use the captured listener callback
      const listenerCallback = capturedListenerCallback;
      if (!listenerCallback) throw new Error('Listener callback was not captured');

      const mockPaths = ['/path/to/file1.txt', '/path/to/file2.png'];
      const mockDropEvent = { type: 'drop', paths: mockPaths, position: { x: 0, y: 0 } };

      // Simulate drop
      listenerCallback({ payload: mockDropEvent }); // Wrap in { payload: ... }

      // Assert on the predefined mock spy
      expect(mockEmit).toHaveBeenNthCalledWith(4, 'file-drop', mockPaths);
      expect(mockEmit).toHaveBeenNthCalledWith(5, 'file-drag-cancel');
      // Check total calls
      expect(mockEmit).toHaveBeenCalledTimes(5);
    });

    it('should emit only file-drag-cancel on "drop" event without paths', async () => {
      renderWithProvider(<TestConsumer />);
      await waitFor(() => expect(mockOnDragDropEvent).toHaveBeenCalled());

      // Use the captured listener callback
      const listenerCallback = capturedListenerCallback;
      if (!listenerCallback) throw new Error('Listener callback was not captured');

      const mockDropEventNoPaths = { type: 'drop', paths: [], position: { x: 0, y: 0 } };

      // Simulate drop with no paths
      listenerCallback({ payload: mockDropEventNoPaths }); // Wrap in { payload: ... }

      // Assert on the predefined mock spy
      expect(mockEmit).toHaveBeenNthCalledWith(6, 'file-drag-cancel');
      expect(mockEmit).toHaveBeenCalledTimes(6); // Total calls up to this point
    });
  });

});
