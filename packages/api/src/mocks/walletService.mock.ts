import { vi } from 'vitest';
import type { ActiveChatWalletInfo, IWalletService } from '@paynless/types';

// Create the actual mock function instance
const getActiveWalletInfoMock = vi.fn<[], ActiveChatWalletInfo>();

export const mockWalletService: IWalletService = {
  getActiveWalletInfo: (...args: []) => getActiveWalletInfoMock(...args),
  // Add other methods if they become necessary
};

export const resetMockWalletService = () => {
  getActiveWalletInfoMock.mockReset();
};
