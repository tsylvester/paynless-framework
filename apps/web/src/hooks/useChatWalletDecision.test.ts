import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';
import { useChatWalletDecision } from './useChatWalletDecision';

// Import mocks from their respective files
import { resetAiStoreMock, getAiStoreState } from '../mocks/aiStore.mock';
import { 
  useWalletStore as actualUseWalletStore, // Renamed to avoid conflict
  initializeMockWalletStore, 
  mockDetermineChatWallet,
  mockSetUserOrgTokenConsent,
  mockLoadUserOrgTokenConsent,
  type MockableWalletStore, // Import the type
} from '../mocks/walletStore.mock';
import { 
  resetAllStoreMocks as resetOrganizationStoreMock,
  mockSetCurrentOrganizationDetails,
  mockSetCurrentOrgId,
} from '../mocks/organizationStore.mock';

vi.mock('@paynless/utils', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }
}));

// Type for the mocked useWalletStore with getState
interface MockedUseWalletStore extends Mock<[(state: MockableWalletStore) => unknown] | [], unknown> {
  getState: () => MockableWalletStore;
}

// Cast the imported mock to our new type
const useWalletStore = actualUseWalletStore as unknown as MockedUseWalletStore;

describe('useChatWalletDecision', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAiStoreMock();
    // Initialize with a basic state. determineChatWallet will be the vi.fn() from the mock file.
    // Its return value will be set per test.
    initializeMockWalletStore({});
    resetOrganizationStoreMock();

    // Default for loadUserOrgTokenConsent (no consent found for any org)
    mockLoadUserOrgTokenConsent.mockImplementation(() => null);

    // Set a common org context for AI store, can be overridden by setupOrgContext or specific test needs
    // This is important because the hook reads newChatContextOrgId from aiStore
    act(() => {
        getAiStoreState().newChatContext = 'default-org-from-beforeEach'; // ensure it has a value for tests that might need it.
        mockSetCurrentOrgId('default-org-from-beforeEach');
        mockSetCurrentOrganizationDetails({
          id: 'default-org-from-beforeEach',
          name: 'Default Org BeforeEach',
          token_usage_policy: 'member_tokens',
          allow_member_chat_creation: true,
          created_at: new Date().toISOString(),
          deleted_at: null,
          visibility: 'private',
        });
    });
  });

  const setupOrgContext = (orgId: string, name: string, tokenPolicy?: 'member_tokens' | 'organization_tokens') => {
    act(() => {
        getAiStoreState().newChatContext = orgId;
        mockSetCurrentOrgId(orgId);
        mockSetCurrentOrganizationDetails({
          id: orgId,
          name: name,
          token_usage_policy: tokenPolicy || 'member_tokens',
          allow_member_chat_creation: true,
          created_at: new Date().toISOString(),
          deleted_at: null,
          visibility: 'private',
        });
    });
  };

  it('should initialize and return default state when no consent is required (no org context)', () => {
    act(() => {
        getAiStoreState().newChatContext = null; // No org context
        mockSetCurrentOrgId(null);
        mockSetCurrentOrganizationDetails(null);
    });
    mockDetermineChatWallet.mockReturnValue({ outcome: 'use_personal_wallet' });

    const { result } = renderHook(() => useChatWalletDecision());

    expect(result.current.effectiveOutcome.outcome).toBe('use_personal_wallet');
    expect(result.current.isLoadingConsent).toBe(false);
  });

  it('should be loading consent initially then resolve if orgId is present and consent required', async () => {
    const orgId = 'test-org-loading';
    setupOrgContext(orgId, "Test Org Loading");
    // Crucially, set the return value for determineChatWallet for THIS test case
    mockDetermineChatWallet.mockReturnValue({ outcome: 'user_consent_required', orgId });
    
    let resolveLoadConsent: (value: boolean | null) => void;
    mockLoadUserOrgTokenConsent.mockImplementation((loadedOrgId) => {
      if (loadedOrgId === orgId) {
        return new Promise((resolve) => { resolveLoadConsent = resolve; });
      }
      return Promise.resolve(null);
    });

    const { result, rerender } = renderHook(() => useChatWalletDecision());
    expect(result.current.isLoadingConsent).toBe(true); // Should be true initially

    await act(async () => {
      resolveLoadConsent!(null); // Resolve the promise, simulating async load completing
      await Promise.resolve(); // Allow microtasks to flush
    });
    rerender(); // Rerender to get the latest state after async operations

    expect(result.current.isLoadingConsent).toBe(false);
    expect(result.current.effectiveOutcome.outcome).toBe('user_consent_required');
  });


  it('should use stored consent if already given (true)', async () => {
    const orgId = 'test-org-given';
    setupOrgContext(orgId, "Test Org Given");
    mockDetermineChatWallet.mockReturnValue({ outcome: 'user_consent_required', orgId });
    mockLoadUserOrgTokenConsent.mockImplementation(async (loadedOrgId) => loadedOrgId === orgId ? true : null);

    const { result, rerender } = renderHook(() => useChatWalletDecision());
    await act(async () => { /* allow effects to run */ });
    rerender();

    expect(result.current.isLoadingConsent).toBe(false);
    expect(result.current.effectiveOutcome.outcome).toBe('use_personal_wallet_for_org');
    expect((result.current.effectiveOutcome as { outcome: string; orgId: string }).orgId).toBe(orgId);
  });

  it('should use stored consent if already refused (false)', async () => {
    const orgId = 'test-org-refused';
    setupOrgContext(orgId, "Test Org Refused");
    mockDetermineChatWallet.mockReturnValue({ outcome: 'user_consent_required', orgId });
    mockLoadUserOrgTokenConsent.mockImplementation(async (loadedOrgId) => loadedOrgId === orgId ? false : null);

    const { result, rerender } = renderHook(() => useChatWalletDecision());
    await act(async () => { /* allow effects to run */ });
    rerender();

    expect(result.current.isLoadingConsent).toBe(false);
    expect(result.current.effectiveOutcome.outcome).toBe('user_consent_refused');
    expect((result.current.effectiveOutcome as { outcome: string; orgId: string }).orgId).toBe(orgId);
  });

  it('should update consent to true when setUserOrgTokenConsent is called (simulating giveConsent)', async () => {
    const orgId = 'test-org-give-consent';
    setupOrgContext(orgId, "Test Org Give");
    mockDetermineChatWallet.mockReturnValue({ outcome: 'user_consent_required', orgId });
    mockLoadUserOrgTokenConsent.mockImplementation(async () => null); // Initially no consent

    const { result, rerender } = renderHook(() => useChatWalletDecision());
    await act(async () => { /* allow effects to run */ });
    rerender();

    expect(result.current.effectiveOutcome.outcome).toBe('user_consent_required');

    await act(async () => {
      // Simulate user giving consent - this would be done via a UI element calling setUserOrgTokenConsent
      // For testing the hook's reaction, we call the store's action directly
      useWalletStore.getState().setUserOrgTokenConsent(orgId, true);
    });
    rerender(); // Store update should trigger rerender

    expect(mockSetUserOrgTokenConsent).toHaveBeenCalledWith(orgId, true); // This mock is from walletStore.mock.ts
    expect(result.current.effectiveOutcome.outcome).toBe('use_personal_wallet_for_org');
  });

  it('should update consent to false when setUserOrgTokenConsent is called (simulating refuseConsent)', async () => {
    const orgId = 'test-org-refuse-consent';
    setupOrgContext(orgId, "Test Org Refuse");    
    mockDetermineChatWallet.mockReturnValue({ outcome: 'user_consent_required', orgId });
    mockLoadUserOrgTokenConsent.mockImplementation(async () => null); // Initially no consent

    const { result, rerender } = renderHook(() => useChatWalletDecision());
    await act(async () => { /* allow effects to run */ });
    rerender();

    await act(async () => {
      // Simulate user refusing consent
      useWalletStore.getState().setUserOrgTokenConsent(orgId, false);
    });
    rerender();

    expect(mockSetUserOrgTokenConsent).toHaveBeenCalledWith(orgId, false);
    expect(result.current.effectiveOutcome.outcome).toBe('user_consent_refused');
  });

  it('should reset consent when resetOrgTokenConsent is called', async () => {
    const orgId = 'test-org-reset-consent';
    setupOrgContext(orgId, "Test Org Reset");
    mockDetermineChatWallet.mockReturnValue({ outcome: 'user_consent_required', orgId });
    mockLoadUserOrgTokenConsent.mockImplementation(async (loadedOrgId) => loadedOrgId === orgId ? true : null); // Start with consent given

    const { result, rerender } = renderHook(() => useChatWalletDecision());
    await act(async () => { /* allow effects to run */ });
    rerender();

    expect(result.current.effectiveOutcome.outcome).toBe('use_personal_wallet_for_org');

    await act(async () => {
      result.current.resetOrgTokenConsent(orgId); // Call the hook's reset function
    });
    rerender();
    
    // The hook's resetOrgTokenConsent calls clearUserOrgTokenConsent from the store,
    // which in turn should set the consent to null.
    // We check if mockSetUserOrgTokenConsent was called by clearUserOrgTokenConsent with null.
    // This depends on the implementation of clearUserOrgTokenConsent in the mock.
    // For this test, we'll assume clearUserOrgTokenConsent sets it to null via setUserOrgTokenConsent.
    // If clearUserOrgTokenConsent is mocked differently, this assertion needs to change.
    // Let's spy on useWalletStore.getState().clearUserOrgTokenConsent directly for better precision.
    const clearConsentSpy = vi.spyOn(useWalletStore.getState(), 'clearUserOrgTokenConsent');
    
    await act(async () => {
      result.current.resetOrgTokenConsent(orgId);
    });

    expect(clearConsentSpy).toHaveBeenCalledWith(orgId);
    // After consent is cleared (becomes null or undefined), the outcome should be user_consent_required
    // We might need a rerender or to wait for the state to propagate if using mockLoadUserOrgTokenConsent
    // to simulate the load again after clearing.
    // For now, assuming clearing makes it undefined which leads to 'user_consent_required'
    // Or 'loading' if loadUserOrgTokenConsent is triggered again and hasn't resolved.
    // Let's update mockLoadUserOrgTokenConsent to reflect the cleared state (returns null)
    mockLoadUserOrgTokenConsent.mockImplementation(async (loadedOrgId) => loadedOrgId === orgId ? null : true);


    // Re-render or wait for state update
    await act(async () => { /* allow effects to run */ });
    rerender(); // Force rerender after mock update and state change

    expect(result.current.effectiveOutcome.outcome).toBe('user_consent_required');
  });

  it('should default to personal_wallet if newChatContextOrgId is null', async () => {
    act(() => {
        getAiStoreState().newChatContext = null;
        mockSetCurrentOrgId(null);
        mockSetCurrentOrganizationDetails(null);
    });
    mockDetermineChatWallet.mockReturnValue({ outcome: 'use_personal_wallet' });

    const { result, rerender } = renderHook(() => useChatWalletDecision());
    await act(async () => { /* allow effects to run */ });
    rerender();

    expect(result.current.isLoadingConsent).toBe(false);
    expect(result.current.effectiveOutcome.outcome).toBe('use_personal_wallet'); 
    expect(mockLoadUserOrgTokenConsent).not.toHaveBeenCalled();
  });

  it('should handle org_wallet_not_available_policy_org outcome correctly', async () => {
    const orgId = 'test-org-policy';
    setupOrgContext(orgId, "Test Org Policy", 'organization_tokens');
    mockDetermineChatWallet.mockReturnValue({ outcome: 'org_wallet_not_available_policy_org', orgId });

    const { result, rerender } = renderHook(() => useChatWalletDecision());
    await act(async () => { /* allow effects to run */ });
    rerender();

    expect(result.current.effectiveOutcome.outcome).toBe('org_wallet_not_available_policy_org');
    expect(result.current.isLoadingConsent).toBe(false);
    expect(mockLoadUserOrgTokenConsent).not.toHaveBeenCalled(); 
  });
}); 