import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SupabaseClient, Session, AuthChangeEvent } from '@supabase/supabase-js';
import { useAuthStore } from './authStore';
import { initAuthListener } from './authStore';

// Define a type for the listener callback Supabase expects
type AuthStateChangeListener = (event: AuthChangeEvent, session: Session | null) => void;

// Define mock Supabase client and session
const mockSession: Session = {
  access_token: 'mock-access-token',
  refresh_token: 'mock-refresh-token',
  user: { id: 'user-123', /* other user props */ } as any,
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Date.now() / 1000 + 3600,
};

const mockSupabaseClient = {
  auth: {
    onAuthStateChange: vi.fn((callback: AuthStateChangeListener) => {
      (mockSupabaseClient.auth as any)._listenerCallback = callback;
      return { 
        data: { subscription: { unsubscribe: vi.fn() } }, 
        error: null 
      };
    }),
  },
} as unknown as SupabaseClient;

describe('authStore Listener Logic (initAuthListener)', () => {
  let setStateSpy: vi.SpyInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    setStateSpy = vi.spyOn(useAuthStore, 'setState').mockImplementation(() => {});
  });

  afterEach(() => {
    setStateSpy.mockRestore();
  });

  it('should set session and isLoading=false on INITIAL_SESSION event with session', () => {
    initAuthListener(mockSupabaseClient);
    const listenerCallback = (mockSupabaseClient.auth as any)._listenerCallback as AuthStateChangeListener;
    expect(listenerCallback).toBeDefined();

    listenerCallback('INITIAL_SESSION', mockSession);

    expect(setStateSpy).toHaveBeenCalledTimes(1);
    expect(setStateSpy).toHaveBeenCalledWith({ 
      session: mockSession, 
      isLoading: false 
    });
  });

  it('should set session=null and isLoading=false on INITIAL_SESSION event without session', () => {
    initAuthListener(mockSupabaseClient);
    const listenerCallback = (mockSupabaseClient.auth as any)._listenerCallback as AuthStateChangeListener;
    expect(listenerCallback).toBeDefined();

    listenerCallback('INITIAL_SESSION', null);

    expect(setStateSpy).toHaveBeenCalledTimes(1);
    expect(setStateSpy).toHaveBeenCalledWith({ 
      session: null, 
      isLoading: false 
    });
  });

  it('should set session on SIGNED_IN event', () => {
    initAuthListener(mockSupabaseClient);
    const listenerCallback = (mockSupabaseClient.auth as any)._listenerCallback as AuthStateChangeListener;

    listenerCallback('SIGNED_IN', mockSession);

    expect(setStateSpy).toHaveBeenCalledTimes(1);
    expect(setStateSpy).toHaveBeenCalledWith({ session: mockSession });
  });

  it('should set session=null on SIGNED_OUT event', () => {
    initAuthListener(mockSupabaseClient);
    const listenerCallback = (mockSupabaseClient.auth as any)._listenerCallback as AuthStateChangeListener;

    listenerCallback('SIGNED_OUT', null); 

    expect(setStateSpy).toHaveBeenCalledTimes(1);
    expect(setStateSpy).toHaveBeenCalledWith({ session: null });
  });

  it('should update session on TOKEN_REFRESHED event', () => {
    initAuthListener(mockSupabaseClient);
    const listenerCallback = (mockSupabaseClient.auth as any)._listenerCallback as AuthStateChangeListener;
    const refreshedSession = { ...mockSession, access_token: 'new-refreshed-token' };

    listenerCallback('TOKEN_REFRESHED', refreshedSession);

    expect(setStateSpy).toHaveBeenCalledTimes(1);
    expect(setStateSpy).toHaveBeenCalledWith({ session: refreshedSession });
  });

  // --- Add tests for SIGNED_IN, SIGNED_OUT etc. later ---

}); 