import { vi } from 'vitest';
import type { Chat, ApiResponse } from '@paynless/types';

// Mock implementations using vi.fn()
export const mockGetChatHistory = vi.fn<[], Promise<ApiResponse<Chat[]>>>();
export const mockDeleteChatHistory = vi.fn<[string], Promise<ApiResponse<void>>>();
export const mockClearUserChatHistory = vi.fn<[], Promise<ApiResponse<void>>>();

// Default mock data (can be overridden in tests)
export const defaultMockChatHistory: Chat[] = [
  {
    id: 'chat-1',
    user_id: 'user-123',
    title: 'Test Chat 1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    organization_id: null,
    system_prompt_id: null,
  },
  {
    id: 'chat-2',
    user_id: 'user-123',
    title: 'Test Chat 2',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    organization_id: null,
    system_prompt_id: null,
  },
];

// Reset function
export const resetChatHistoryMocks = () => {
  mockGetChatHistory.mockReset();
  mockDeleteChatHistory.mockReset();
  mockClearUserChatHistory.mockReset();

  // Set default successful resolutions with status and error: undefined
  mockGetChatHistory.mockResolvedValue({ status: 200, data: [...defaultMockChatHistory], error: undefined });
  mockDeleteChatHistory.mockResolvedValue({ status: 204, data: undefined, error: undefined });
  mockClearUserChatHistory.mockResolvedValue({ status: 204, data: undefined, error: undefined });
};

// Initialize with default mocks
resetChatHistoryMocks(); 