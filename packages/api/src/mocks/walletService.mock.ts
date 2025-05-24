import { vi, type Mock } from 'vitest';
import type { ActiveWalletInfo, IWalletService } from '@paynless/types';

export const mockWalletService: IWalletService = {
  getActiveWalletInfo: vi.fn() as Mock<[], ActiveWalletInfo>,
  // Add other methods if they become necessary
};

export const resetMockWalletService = () => {
  mockWalletService.getActiveWalletInfo.mockReset();
};
