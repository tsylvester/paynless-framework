import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useChatWalletDecision } from './useChatWalletDecision';

vi.mock('@paynless/store', async (importOriginal) => {
  const actual = await importOriginal() as object;
  const walletMock = await vi.importActual('../mocks/walletStore.mock.ts');
  const aiMock = await vi.importActual('../mocks/aiStore.mock.ts');
  const orgMock = await vi.importActual('../mocks/organizationStore.mock.ts');
  
  return {
    ...actual,
    ...walletMock,
    ...aiMock,
    ...orgMock,
  };
});

// Import mock utilities and the mock store hooks
import { resetAiStoreMock, getAiStoreState } from '../mocks/aiStore.mock';
import {
  initializeMockWalletStore,
  mockDetermineChatWallet,
  useWalletStore,
  mockClearUserOrgTokenConsent,
} from '../mocks/walletStore.mock';
import {
  resetAllStoreMocks,
  mockSetCurrentOrganizationDetails,
  mockSetCurrentOrgId,
  mockSetUserOrganizations,
} from '../mocks/organizationStore.mock';


describe('useChatWalletDecision', () => {
  beforeEach(() => {
    resetAllStoreMocks();
    resetAiStoreMock();
    initializeMockWalletStore();
  });

  const setupOrgContext = (orgId: string, name: string, tokenPolicy?: 'member_tokens' | 'organization_tokens') => {
    act(() => {
      getAiStoreState().newChatContext = orgId;
      mockSetCurrentOrgId(orgId);
      const orgDetails = {
        id: orgId,
        name: name,
        token_usage_policy: tokenPolicy || 'member_tokens',
        allow_member_chat_creation: true,
        created_at: new Date().toISOString(),
        deleted_at: null,
        visibility: 'private',
      };
      mockSetCurrentOrganizationDetails(orgDetails);
      mockSetUserOrganizations([orgDetails]);
    });
  };

  it('should return use_personal_wallet when context is personal', () => {
    act(() => {
      getAiStoreState().newChatContext = null;
    });

    mockDetermineChatWallet.mockReturnValue({ outcome: 'use_personal_wallet' });
    
    const { result } = renderHook(() => useChatWalletDecision());

    expect(result.current.effectiveOutcome.outcome).toBe('use_personal_wallet');
    expect(result.current.isLoadingConsent).toBe(false);
  });

  it('should be loading while org store is loading, then resolve', async () => {
    setupOrgContext('org-123', 'Test Org');

    mockDetermineChatWallet.mockReturnValue({ outcome: 'loading' });

    const { result, rerender } = renderHook(() => useChatWalletDecision());

    expect(result.current.isLoadingConsent).toBe(true);
    expect(result.current.effectiveOutcome.outcome).toBe('loading');

    mockDetermineChatWallet.mockReturnValue({ outcome: 'user_consent_required', orgId: 'org-123' });

    rerender();

    expect(result.current.isLoadingConsent).toBe(false);
    expect(result.current.effectiveOutcome.outcome).toBe('user_consent_required');
  });

  it('should use stored consent if already given (true)', async () => {
    setupOrgContext('org-123', 'Test Org');
    mockDetermineChatWallet.mockReturnValue({
      outcome: 'use_organization_wallet',
      orgId: 'org-123',
    });

    const { result } = renderHook(() => useChatWalletDecision());

    expect(result.current.effectiveOutcome.outcome).toBe('use_organization_wallet');
    if (result.current.effectiveOutcome.outcome === 'use_organization_wallet') {
      expect(result.current.effectiveOutcome.orgId).toBe('org-123');
    }
    expect(result.current.isLoadingConsent).toBe(false);
  });

  it('should use stored consent if already refused (false)', async () => {
    setupOrgContext('org-123', 'Test Org');
    mockDetermineChatWallet.mockReturnValue({
      outcome: 'user_consent_refused',
      orgId: 'org-123',
    });

    const { result } = renderHook(() => useChatWalletDecision());

    expect(result.current.effectiveOutcome.outcome).toBe('user_consent_refused');
    expect(result.current.isLoadingConsent).toBe(false);
  });

  it('should update consent to true when giveConsent is called', async () => {
    const orgId = 'org-123';
    setupOrgContext(orgId, 'Test Org');
    mockDetermineChatWallet.mockReturnValue({ outcome: 'user_consent_required', orgId });

    const { result, rerender } = renderHook(() => useChatWalletDecision());
    expect(result.current.effectiveOutcome.outcome).toBe('user_consent_required');

    // Simulate user giving consent
    act(() => {
      useWalletStore.getState().setUserOrgTokenConsent(orgId, true);
    });

    // After consent, the decision should change
    mockDetermineChatWallet.mockReturnValue({ outcome: 'use_organization_wallet', orgId });
    rerender();

    expect(result.current.effectiveOutcome.outcome).toBe('use_organization_wallet');
  });

  it('should update consent to false when refuseConsent is called', async () => {
    const orgId = 'org-123';
    setupOrgContext(orgId, 'Test Org');
    mockDetermineChatWallet.mockReturnValue({ outcome: 'user_consent_required', orgId });

    const { result, rerender } = renderHook(() => useChatWalletDecision());
    expect(result.current.effectiveOutcome.outcome).toBe('user_consent_required');

    // Simulate user refusing consent
    act(() => {
      useWalletStore.getState().setUserOrgTokenConsent(orgId, false);
    });

    // After refusal, the decision should change
    mockDetermineChatWallet.mockReturnValue({ outcome: 'user_consent_refused', orgId: 'org-123' });
    rerender();

    expect(result.current.effectiveOutcome.outcome).toBe('user_consent_refused');
  });

  it('should reset consent when resetOrgTokenConsent is called', async () => {
    const orgId = 'org-123';
    setupOrgContext(orgId, 'Test Org');
    
    // Start with consent given
    mockDetermineChatWallet.mockReturnValue({ outcome: 'use_organization_wallet', orgId });

    const { result, rerender } = renderHook(() => useChatWalletDecision());
    expect(result.current.effectiveOutcome.outcome).toBe('use_organization_wallet');

    // Reset consent
    act(() => {
      result.current.resetOrgTokenConsent(orgId);
    });

    expect(mockClearUserOrgTokenConsent).toHaveBeenCalledWith(orgId);

    // After reset, consent should be required again
    mockDetermineChatWallet.mockReturnValue({ outcome: 'user_consent_required', orgId });
    rerender();

    expect(result.current.effectiveOutcome.outcome).toBe('user_consent_required');
  });

  it('should handle org_wallet_not_available_policy_org outcome correctly', async () => {
    const orgId = 'org-123';
    setupOrgContext(orgId, 'Test Org', 'organization_tokens');
    mockDetermineChatWallet.mockReturnValue({ outcome: 'org_wallet_not_available_policy_org', orgId });

    const { result } = renderHook(() => useChatWalletDecision());

    expect(result.current.effectiveOutcome.outcome).toBe('org_wallet_not_available_policy_org');
    if (result.current.effectiveOutcome.outcome === 'org_wallet_not_available_policy_org') {
      expect(result.current.effectiveOutcome.orgId).toBe(orgId);
    }
    expect(result.current.isLoadingConsent).toBe(false);
  });
});