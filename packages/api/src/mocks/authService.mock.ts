import { vi, type Mock } from 'vitest';
import type { User, Session, IAuthService } from '@paynless/types';

export const mockAuthService: IAuthService = {
  getCurrentUser: vi.fn() as Mock<[], User | null>,
  getSession: vi.fn() as Mock<[], Session | null>,
  requestLoginNavigation: vi.fn() as Mock<[], void>,
  // Add other methods if they become necessary
};

export const resetMockAuthService = () => {
  mockAuthService.getCurrentUser.mockReset();
  mockAuthService.getSession.mockReset();
  mockAuthService.requestLoginNavigation.mockReset();
};
