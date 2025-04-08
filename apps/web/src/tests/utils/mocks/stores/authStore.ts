import { create } from 'zustand';
import { vi } from 'vitest';
import type { AuthState } from '@paynless/store';

export const createMockAuthStore = (initialState?: Partial<AuthState>) => {
  return create<AuthState>((set) => ({
    user: initialState?.user ?? null,
    isAuthenticated: initialState?.isAuthenticated ?? false,
    isLoading: initialState?.isLoading ?? false,
    error: initialState?.error ?? null,
    setNavigate: vi.fn(),
    initialize: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    register: vi.fn(),
    updateProfile: vi.fn(),
    setError: vi.fn(),
    clearError: vi.fn(),
  }));
}; 