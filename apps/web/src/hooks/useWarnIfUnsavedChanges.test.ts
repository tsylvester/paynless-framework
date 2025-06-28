import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useWarnIfUnsavedChanges } from './useWarnIfUnsavedChanges';

describe('useWarnIfUnsavedChanges', () => {
  let mockAddEventListener: ReturnType<typeof vi.spyOn>;
  let mockRemoveEventListener: ReturnType<typeof vi.spyOn>;
  // mock event is now a plain object for better control
  let mockCustomBeforeUnloadEvent: {
    preventDefault: ReturnType<typeof vi.fn>;
    returnValue: string;
    // type: 'beforeunload'; // Optional: can be added if handler inspects event.type
  };

  beforeEach(() => {
    mockAddEventListener = vi.spyOn(window, 'addEventListener');
    mockRemoveEventListener = vi.spyOn(window, 'removeEventListener');
    
    // Initialize as a plain object
    mockCustomBeforeUnloadEvent = {
      preventDefault: vi.fn(),
      returnValue: '', // Browsers often initialize returnValue to an empty string
      // type: 'beforeunload', 
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should add event listener when isDirty is true', () => {
    renderHook(() => useWarnIfUnsavedChanges(true));
    expect(mockAddEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function));
  });

  it('should not add event listener when isDirty is false', () => {
    renderHook(() => useWarnIfUnsavedChanges(false));
    expect(mockAddEventListener).not.toHaveBeenCalled();
  });

  it('should remove event listener when isDirty changes from true to false', () => {
    const { rerender } = renderHook(({ dirty }) => useWarnIfUnsavedChanges(dirty), {
      initialProps: { dirty: true },
    });
    expect(mockAddEventListener).toHaveBeenCalledTimes(1);

    act(() => {
      rerender({ dirty: false });
    });

    expect(mockRemoveEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function));
  });

  it('should add event listener again if isDirty changes back to true', () => {
    const { rerender } = renderHook(({ dirty }) => useWarnIfUnsavedChanges(dirty), {
      initialProps: { dirty: false }, 
    });
    expect(mockAddEventListener).not.toHaveBeenCalled();

    act(() => {
      rerender({ dirty: true });
    });
    expect(mockAddEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    expect(mockAddEventListener).toHaveBeenCalledTimes(1); 
  });

  it('should remove event listener on unmount if it was active', () => {
    const { unmount } = renderHook(() => useWarnIfUnsavedChanges(true));
    expect(mockAddEventListener).toHaveBeenCalledTimes(1);

    unmount();
    expect(mockRemoveEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function));
  });

  it('should not attempt to remove listener on unmount if never added', () => {
    const { unmount } = renderHook(() => useWarnIfUnsavedChanges(false));
    expect(mockAddEventListener).not.toHaveBeenCalled();
    unmount();
    expect(mockRemoveEventListener).not.toHaveBeenCalled();
  });

  it('should call event.preventDefault and set event.returnValue when handler is triggered', () => {
    const defaultMessage = 'You have unsaved changes. Are you sure you want to leave?';
    renderHook(() => useWarnIfUnsavedChanges(true)); // Hook uses its default message
    const handler = mockAddEventListener.mock.calls[0][1] as (event: BeforeUnloadEvent) => void;
    
    handler(mockCustomBeforeUnloadEvent as unknown as BeforeUnloadEvent); // Cast for type compatibility

    expect(mockCustomBeforeUnloadEvent.preventDefault).toHaveBeenCalled();
    expect(mockCustomBeforeUnloadEvent.returnValue).toBe(defaultMessage);
  });

  it('should use the provided message for returnValue if feature detected (though modern browsers ignore it)', () => {
    const customMessage = "You have unsaved changes! Are you sure?";
    renderHook(() => useWarnIfUnsavedChanges(true, customMessage));
    const handler = mockAddEventListener.mock.calls[0][1] as (event: BeforeUnloadEvent) => void;
    
    handler(mockCustomBeforeUnloadEvent as unknown as BeforeUnloadEvent); // Cast for type compatibility
    
    expect(mockCustomBeforeUnloadEvent.returnValue).toBe(customMessage);
  });
}); 