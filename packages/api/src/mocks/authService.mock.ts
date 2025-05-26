import { vi } from 'vitest';
import type { User, Session, IAuthService } from '@paynless/types';

// Create the actual mock function instances
const getCurrentUserMock = vi.fn<[], User | null>();
const getSessionMock = vi.fn<[], Session | null>();
const requestLoginNavigationMock = vi.fn<[], void>();

export const mockAuthService: IAuthService = {
  getCurrentUser: getCurrentUserMock,
  getSession: getSessionMock,
  requestLoginNavigation: requestLoginNavigationMock,
  // Add other methods if they become necessary
};

export const resetMockAuthService = () => {
  getCurrentUserMock.mockReset();
  getSessionMock.mockReset();
  requestLoginNavigationMock.mockReset();
};
