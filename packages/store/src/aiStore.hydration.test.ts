import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAiStore } from './aiStore';
import { initialAiStateValues } from '@paynless/types';
import type { ChatContextPreferences, AiState } from '@paynless/types';

// Mock logger to prevent console output during tests
vi.mock('@paynless/utils', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  isChatContextPreferences: vi.fn((val) => typeof val === 'object' && val !== null),
}));

// Mock authStore as its getState().updateProfile is called by _updateChatContextInProfile
// Although not directly called by hydration actions, setters are, and resetting state might involve them.
// For focused hydration tests, this might not be strictly necessary if we only call hydrate/reset actions.
// However, if any store action internally calls setters that trigger _updateChatContextInProfile,
// this mock prevents errors.
vi.mock('./authStore', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({
      profile: {
        // Minimal profile, chat_context will be overridden or tested as null
        chat_context: null 
      }, 
      updateProfile: vi.fn().mockResolvedValue({ success: true }),
      // Add other authStore state/actions if they become necessary for aiStore setup/teardown
    })),
  },
}));


describe('aiStore - Chat Context Hydration', () => {
  beforeEach(() => {
    // Reset AiStore to its initial state values, merging them into the existing store
    // to preserve actions. `false` for the second parameter (replace) ensures merging.
    useAiStore.setState(
      {
        ...initialAiStateValues,
        // If there were any state properties not covered by initialAiStateValues
        // but defined in AiState and modified by tests, reset them here too.
        // For this store, initialAiStateValues should be comprehensive for what hydration tests touch.
      },
      false // Ensures merge, preserving actions
    );
  });

  it('should have correct initial hydration state and context values', () => {
    const state = useAiStore.getState();
    expect(state.isChatContextHydrated).toBe(false);
    expect(state.newChatContext).toBe(initialAiStateValues.newChatContext); // Typically null
    expect(state.selectedProviderId).toBe(initialAiStateValues.selectedProviderId); // Typically null
    expect(state.selectedPromptId).toBe(initialAiStateValues.selectedPromptId); // Typically null
  });

  it('hydrateChatContext should update context and set hydration flag with full data', () => {
    const testContextData: ChatContextPreferences = {
      newChatContext: 'org_123',
      selectedProviderId: 'provider_abc',
      selectedPromptId: 'prompt_xyz',
    };

    useAiStore.getState().hydrateChatContext(testContextData);

    const state = useAiStore.getState();
    expect(state.isChatContextHydrated).toBe(true);
    expect(state.newChatContext).toBe('org_123');
    expect(state.selectedProviderId).toBe('provider_abc');
    expect(state.selectedPromptId).toBe('prompt_xyz');
  });

  it('hydrateChatContext should update context and set hydration flag with partial data', () => {
    const testContextData: Partial<ChatContextPreferences> = {
      newChatContext: 'personal_context',
    };

    // Ensure initial state for other fields
    expect(useAiStore.getState().selectedProviderId).toBe(initialAiStateValues.selectedProviderId);

    useAiStore.getState().hydrateChatContext(testContextData as ChatContextPreferences);

    const state = useAiStore.getState();
    expect(state.isChatContextHydrated).toBe(true);
    expect(state.newChatContext).toBe('personal_context');
    // Unchanged fields should remain as per initialAiStateValues (typically null)
    expect(state.selectedProviderId).toBe(initialAiStateValues.selectedProviderId);
    expect(state.selectedPromptId).toBe(initialAiStateValues.selectedPromptId);
  });
  
  it('hydrateChatContext should handle undefined fields in input gracefully', () => {
    const testContextData = {
      newChatContext: 'org_123',
      selectedProviderId: undefined, // Explicitly undefined
      // selectedPromptId is omitted
    } as ChatContextPreferences;

    useAiStore.getState().hydrateChatContext(testContextData);
    const state = useAiStore.getState();

    expect(state.isChatContextHydrated).toBe(true);
    expect(state.newChatContext).toBe('org_123');
    expect(state.selectedProviderId).toBe(initialAiStateValues.selectedProviderId); // Should not set to undefined, keep initial
    expect(state.selectedPromptId).toBe(initialAiStateValues.selectedPromptId); // Should remain initial
  });


  it('hydrateChatContext should set hydration flag but not change values if context data is null', () => {
    useAiStore.getState().hydrateChatContext(null);

    const state = useAiStore.getState();
    expect(state.isChatContextHydrated).toBe(true);
    expect(state.newChatContext).toBe(initialAiStateValues.newChatContext);
    expect(state.selectedProviderId).toBe(initialAiStateValues.selectedProviderId);
    expect(state.selectedPromptId).toBe(initialAiStateValues.selectedPromptId);
  });

  it('hydrateChatContext should set hydration flag but not change values if context data is an empty object', () => {
    useAiStore.getState().hydrateChatContext({});

    const state = useAiStore.getState();
    expect(state.isChatContextHydrated).toBe(true);
    expect(state.newChatContext).toBe(initialAiStateValues.newChatContext);
    expect(state.selectedProviderId).toBe(initialAiStateValues.selectedProviderId);
    expect(state.selectedPromptId).toBe(initialAiStateValues.selectedPromptId);
  });

  it('resetChatContextToDefaults should reset context values and hydration flag', () => {
    // First, set some non-default values by hydrating
    const initialData: ChatContextPreferences = {
      newChatContext: 'org_789',
      selectedProviderId: 'provider_def',
      selectedPromptId: 'prompt_uvw',
    };
    useAiStore.getState().hydrateChatContext(initialData);
    expect(useAiStore.getState().isChatContextHydrated).toBe(true); // Confirm it was set

    // Now, reset
    useAiStore.getState().resetChatContextToDefaults();

    const state = useAiStore.getState();
    expect(state.isChatContextHydrated).toBe(false);
    expect(state.newChatContext).toBe(initialAiStateValues.newChatContext);
    expect(state.selectedProviderId).toBe(initialAiStateValues.selectedProviderId);
    expect(state.selectedPromptId).toBe(initialAiStateValues.selectedPromptId);
  });

  it('setChatContextHydrated should update the isChatContextHydrated flag', () => {
    expect(useAiStore.getState().isChatContextHydrated).toBe(false);

    useAiStore.getState().setChatContextHydrated(true);
    expect(useAiStore.getState().isChatContextHydrated).toBe(true);

    useAiStore.getState().setChatContextHydrated(false);
    expect(useAiStore.getState().isChatContextHydrated).toBe(false);
  });
}); 