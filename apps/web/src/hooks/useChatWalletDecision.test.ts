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
    vi.resetAllMocks();
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
    setupOrgContext(orgId, "Test Org Loading", 'member_tokens'); // policy is member_tokens for consent path

    // Stage 1: Initial render - outcome is 'loading'
    // Ensure mockDetermineChatWallet is primed BEFORE the hook renders for the first time.
    mockDetermineChatWallet.mockReset().mockReturnValueOnce({ outcome: 'loading' });
    
    const { result, rerender } = renderHook(() => useChatWalletDecision());
    
    // On initial render, determineChatWallet should return 'loading'
    expect(result.current.isLoadingConsent).toBe(true);
    expect(result.current.effectiveOutcome.outcome).toBe('loading');

    // Stage 2: After rerender - outcome is 'user_consent_required'
    // Prime mockDetermineChatWallet for the call that happens upon rerender.
    mockDetermineChatWallet.mockReset().mockReturnValueOnce({ outcome: 'user_consent_required', orgId });
    
    await act(async () => {
      rerender(); 
    });

    expect(result.current.isLoadingConsent).toBe(false); 
    expect(result.current.effectiveOutcome.outcome).toBe('user_consent_required');
    expect((result.current.effectiveOutcome as { outcome: string; orgId: string }).orgId).toBe(orgId);
  });


  it('should use stored consent if already given (true)', async () => {
    const orgId = 'test-org-given';
    setupOrgContext(orgId, "Test Org Given", 'member_tokens'); 
    
    // Set determineChatWallet to the expected outcome *before* initializing store state for this specific test
    mockDetermineChatWallet.mockReturnValue({ outcome: 'use_personal_wallet_for_org', orgId });
    
    initializeMockWalletStore({
      userOrgTokenConsent: { [orgId]: true }
    });

    const { result } = renderHook(() => useChatWalletDecision()); 
    
    await act(async () => { /* allow effects to run */ });

    expect(result.current.isLoadingConsent).toBe(false); 
    expect(result.current.effectiveOutcome.outcome).toBe('use_personal_wallet_for_org');
    expect((result.current.effectiveOutcome as { outcome: string; orgId: string }).orgId).toBe(orgId);
  });

  it('should use stored consent if already refused (false)', async () => {
    const orgId = 'test-org-refused';
    setupOrgContext(orgId, "Test Org Refused", 'member_tokens'); 

    // Set determineChatWallet to the expected outcome *before* initializing store state
    mockDetermineChatWallet.mockReturnValue({ outcome: 'user_consent_refused', orgId });

    initializeMockWalletStore({
      userOrgTokenConsent: { [orgId]: false }
    });

    const { result } = renderHook(() => useChatWalletDecision()); 
    await act(async () => { /* allow effects to run */ });

    expect(result.current.isLoadingConsent).toBe(false);
    expect(result.current.effectiveOutcome.outcome).toBe('user_consent_refused');
    expect((result.current.effectiveOutcome as { outcome: string; orgId: string }).orgId).toBe(orgId);
  });

  it('should update consent to true when setUserOrgTokenConsent is called (simulating giveConsent)', async () => {
    const orgId = 'test-org-give-consent';
    setupOrgContext(orgId, "Test Org Give", 'member_tokens');
    
    // For initial render:
    mockDetermineChatWallet.mockReturnValue({ outcome: 'user_consent_required', orgId });
    initializeMockWalletStore({
      userOrgTokenConsent: { [orgId]: null } // Start with consent pending
    });

    const { result, rerender } = renderHook(() => useChatWalletDecision());
    
    await act(async () => { /* allow initial effects */ });
    expect(result.current.effectiveOutcome.outcome).toBe('user_consent_required');

    // For render after consent is given:
    mockDetermineChatWallet.mockReturnValue({ outcome: 'use_personal_wallet_for_org', orgId });
    // No need to call initializeMockWalletStore again if only userOrgTokenConsent changed by an action
    
    await act(async () => {
      useWalletStore.getState().setUserOrgTokenConsent(orgId, true);
    });
    await act(async () => { rerender() }); 

    expect(useWalletStore.getState().setUserOrgTokenConsent).toHaveBeenCalledWith(orgId, true);
    expect(result.current.effectiveOutcome.outcome).toBe('use_personal_wallet_for_org');
    expect((result.current.effectiveOutcome as { outcome: string; orgId: string }).orgId).toBe(orgId);
  });

  it('should update consent to false when setUserOrgTokenConsent is called (simulating refuseConsent)', async () => {
    const orgId = 'test-org-refuse-consent';
    setupOrgContext(orgId, "Test Org Refuse", 'member_tokens');    
    
    // For initial render:
    mockDetermineChatWallet.mockReturnValue({ outcome: 'user_consent_required', orgId });
    initializeMockWalletStore({
      userOrgTokenConsent: { [orgId]: null } // Start with consent pending
    });

    const { result, rerender } = renderHook(() => useChatWalletDecision());
    await act(async () => { /* allow initial effects */ });
    expect(result.current.effectiveOutcome.outcome).toBe('user_consent_required');

    // For render after consent is refused:
    mockDetermineChatWallet.mockReturnValue({ outcome: 'user_consent_refused', orgId });

    await act(async () => {
      useWalletStore.getState().setUserOrgTokenConsent(orgId, false);
    });
    await act(async () => { rerender() }); 

    expect(useWalletStore.getState().setUserOrgTokenConsent).toHaveBeenCalledWith(orgId, false);
    expect(result.current.effectiveOutcome.outcome).toBe('user_consent_refused');
    expect((result.current.effectiveOutcome as { outcome: string; orgId: string }).orgId).toBe(orgId);
  });

  it('should reset consent when resetOrgTokenConsent is called', async () => {
    const orgId = 'test-org-reset-consent';
    setupOrgContext(orgId, "Test Org Reset", 'member_tokens');
    
    // For initial render (consent given):
    mockDetermineChatWallet.mockReturnValue({ outcome: 'use_personal_wallet_for_org', orgId });
    initializeMockWalletStore({
      userOrgTokenConsent: { [orgId]: true } // Start with consent given
    });

    const { result, rerender } = renderHook(() => useChatWalletDecision());
    await act(async () => { /* allow initial effects */ });
    expect(result.current.effectiveOutcome.outcome).toBe('use_personal_wallet_for_org');

    const clearConsentSpy = vi.spyOn(useWalletStore.getState(), 'clearUserOrgTokenConsent');

    // For render after consent is reset:
    mockDetermineChatWallet.mockReturnValue({ outcome: 'user_consent_required', orgId });
    
    await act(async () => {
      result.current.resetOrgTokenConsent(orgId); 
    });
    
    expect(clearConsentSpy).toHaveBeenCalledWith(orgId);
    await act(async () => { rerender(); }); 

    expect(result.current.effectiveOutcome.outcome).toBe('user_consent_required');
    expect((result.current.effectiveOutcome as { outcome: string; orgId: string }).orgId).toBe(orgId);

    clearConsentSpy.mockRestore();
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
    const orgId = 'test-org-policy-org';
    setupOrgContext(orgId, 'Test Org Policy Org', 'organization_tokens');

    // Set determineChatWallet to the expected outcome *before* rendering the hook
    mockDetermineChatWallet.mockReturnValue({ outcome: 'org_wallet_not_available_policy_org', orgId });
    
    const loadConsentSpy = vi.spyOn(mockLoadUserOrgTokenConsent, 'getMockImplementation' as any || 'apply');

    const { result } = renderHook(() => useChatWalletDecision()); // No rerender needed

    await act(async () => { /* allow initial effects */ });

    expect(result.current.effectiveOutcome.outcome).toBe('org_wallet_not_available_policy_org');
    expect((result.current.effectiveOutcome as { outcome: string; orgId: string }).orgId).toBe(orgId);
    expect(result.current.isLoadingConsent).toBe(false); 
    
    expect(mockLoadUserOrgTokenConsent).not.toHaveBeenCalled(); 
    loadConsentSpy.mockRestore();
  });
}); 