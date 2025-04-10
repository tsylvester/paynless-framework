import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAuthSession } from '../../hooks/useAuthSession';
import type { Session } from '@paynless/types';

// Mock useAuthStore state and actions
let mockSession: Partial<Session> | null = null;
const mockRefreshSession = vi.fn();

const mockAuthStoreState = {
  get session() { return mockSession; }, // Use getter to allow dynamic updates
  refreshSession: mockRefreshSession,
};

vi.mock('@paynless/store', () => ({
  // Handle selector to return specific parts or the whole state
  useAuthStore: (selector?: (state: typeof mockAuthStoreState) => unknown) => {
    if (selector) {
      return selector(mockAuthStoreState);
    }
    return mockAuthStoreState;
  },
}));

// Mock logger
vi.mock('@paynless/utils', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    }
}));

// Define constants used in the hook
const REFRESH_THRESHOLD_MS = 15 * 60 * 1000;

describe('useAuthSession Hook', () => {

  beforeEach(() => {
    // Reset state and mocks before each test
    mockSession = null;
    mockRefreshSession.mockClear();
    // Enable fake timers
    vi.useFakeTimers();
  });

  afterEach(() => {
    // Disable fake timers after each test
    vi.useRealTimers();
  });

  it('should return initial state with no session', () => {
    const { result } = renderHook(() => useAuthSession());
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.session).toBeNull();
    expect(mockRefreshSession).not.toHaveBeenCalled();
  });

  it('should not call refresh immediately if expiry is far in the future', () => {
    const futureExpiry = Date.now() + REFRESH_THRESHOLD_MS * 2; // 30 mins from now
    mockSession = { expiresAt: futureExpiry };
    renderHook(() => useAuthSession());

    expect(mockRefreshSession).not.toHaveBeenCalled();
  });

  it('should schedule and call refresh before expiry if expiry is far', () => {
    const offset = 5 * 60 * 1000; // 5 minutes
    const futureExpiry = Date.now() + REFRESH_THRESHOLD_MS + offset; // 20 mins from now
    mockSession = { expiresAt: futureExpiry };
    renderHook(() => useAuthSession());

    // Shouldn't have refreshed yet
    expect(mockRefreshSession).not.toHaveBeenCalled();

    // Advance time to just BEFORE the refresh should happen (offset - 1ms)
    vi.advanceTimersByTime(offset - 1);
    expect(mockRefreshSession).not.toHaveBeenCalled();

    // Advance time past the refresh trigger point
    vi.advanceTimersByTime(2); // Advance 2ms more
    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
  });

  it('should call refresh immediately if expiry is within the threshold', () => {
    const nearExpiry = Date.now() + REFRESH_THRESHOLD_MS / 2; // 7.5 mins from now
    mockSession = { expiresAt: nearExpiry };
    renderHook(() => useAuthSession());

    // Should call refresh immediately on hook render
    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
  });
  
    it('should call refresh immediately if already expired', () => {
    const pastExpiry = Date.now() - 1000; // 1 second ago
    mockSession = { expiresAt: pastExpiry };
    renderHook(() => useAuthSession());

    // Should call refresh immediately
    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
  });

  it('should not set a timer if session has no expiresAt', () => {
    mockSession = { accessToken: 'abc' }; // Session exists but no expiresAt
    renderHook(() => useAuthSession());

    // Advance time significantly
    vi.advanceTimersByTime(REFRESH_THRESHOLD_MS * 3);
    expect(mockRefreshSession).not.toHaveBeenCalled();
  });

  it('should clear the timer if the session becomes null', () => {
    const futureExpiry = Date.now() + REFRESH_THRESHOLD_MS * 2;
    mockSession = { expiresAt: futureExpiry };
    const { rerender } = renderHook(() => useAuthSession());

    // Session becomes null (logout)
    act(() => {
      mockSession = null;
    });
    rerender(); // Rerender hook with new state

    // Advance time past when the original refresh should have happened
    vi.advanceTimersByTime(REFRESH_THRESHOLD_MS * 2);
    expect(mockRefreshSession).not.toHaveBeenCalled();
  });

  it('should clear the old timer and set a new one if the session changes', () => {
    // Spy on timer functions
    const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
    
    const firstExpiry = Date.now() + REFRESH_THRESHOLD_MS * 4; // 60 mins
    const secondExpiry = Date.now() + REFRESH_THRESHOLD_MS * 2; // 30 mins
    mockSession = { expiresAt: firstExpiry };
    const { rerender } = renderHook(() => useAuthSession());

    // Initial timer set
    expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
    const firstTimerId = setTimeoutSpy.mock.results[0].value; // Get the timer ID
    expect(clearTimeoutSpy).not.toHaveBeenCalled(); // No cleanup yet

    // Change the session and rerender within act
    act(() => {
      mockSession = { expiresAt: secondExpiry };
      rerender(); // Ensure rerender happens within act after state change
    });

    // Expect clearTimeout to have been called with the first timer ID
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
    expect(clearTimeoutSpy).toHaveBeenCalledWith(firstTimerId);

    // Expect setTimeout to have been called again for the new timer
    expect(setTimeoutSpy).toHaveBeenCalledTimes(2);
    const secondTimerId = setTimeoutSpy.mock.results[1].value;
    expect(secondTimerId).not.toBe(firstTimerId); // Ensure it's a new timer

    // Optional: Verify the new timer eventually calls refresh
    act(() => {
        // Advance past second timer trigger point (initial time + 30min - 15min = 15min elapsed for second timer)
        vi.advanceTimersByTime(REFRESH_THRESHOLD_MS * 1.1); // Advance ~16.5 mins
    });
    expect(mockRefreshSession).toHaveBeenCalledTimes(1);

    // Cleanup spies
    setTimeoutSpy.mockRestore();
    clearTimeoutSpy.mockRestore();
  });

  it('should clear the timer on unmount', () => {
    const futureExpiry = Date.now() + REFRESH_THRESHOLD_MS * 2;
    mockSession = { expiresAt: futureExpiry };
    const { unmount } = renderHook(() => useAuthSession());

    // Unmount the hook
    unmount();

    // Advance time past when the refresh should have happened
    vi.advanceTimersByTime(REFRESH_THRESHOLD_MS * 2);
    expect(mockRefreshSession).not.toHaveBeenCalled();
  });

}); 