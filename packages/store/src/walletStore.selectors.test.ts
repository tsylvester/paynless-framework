import { describe, it, expect, vi } from 'vitest';
import { selectActiveChatWalletInfo } from './walletStore.selectors';
import { WalletStateValues } from './walletStore';
import { TokenWallet, ActiveChatWalletInfo } from '@paynless/types';

describe('walletStore.selectors', () => {
  describe('selectActiveChatWalletInfo', () => {
    const orgId = 'org-test-123';
    const personalWallet: TokenWallet = {
      walletId: 'personal-wallet-id',
      balance: '1000',
      currency: 'AI_TOKEN',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const orgWallet: TokenWallet = {
      walletId: 'org-wallet-id',
      organizationId: orgId,
      balance: '5000',
      currency: 'AI_TOKEN',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const mockWalletState: WalletStateValues = {
      personalWallet,
      organizationWallets: { [orgId]: orgWallet },
      transactionHistory: [],
      isLoadingPersonalWallet: false,
      isLoadingOrgWallet: {},
      isLoadingHistory: false,
      isLoadingPurchase: false,
      personalWalletError: null,
      orgWalletErrors: {},
      purchaseError: null,
      userOrgTokenConsent: {},
      isConsentModalOpen: false,
      currentChatWalletDecision: null,
    };

    it('should return personal wallet info when context is personal', () => {
      const stateWithPersonalDecision: WalletStateValues = {
        ...mockWalletState,
        currentChatWalletDecision: { outcome: 'use_personal_wallet' },
      };

      const result: ActiveChatWalletInfo = selectActiveChatWalletInfo(stateWithPersonalDecision, 'personal');

      expect(result.type).toBe('personal');
      expect(result.walletId).toBe(personalWallet.walletId);
      expect(result.status).toBe('ok');
    });

    it('should return organization wallet info when context is an orgId', () => {
      // Intentionally keep decision as personal to prove selector reacts to provided context
      const stateWithPersonalDecision: WalletStateValues = {
        ...mockWalletState,
        currentChatWalletDecision: { outcome: 'use_personal_wallet' },
      };

      const result: ActiveChatWalletInfo = selectActiveChatWalletInfo(stateWithPersonalDecision, orgId);

      expect(result.type).toBe('organization');
      expect(result.walletId).toBe(orgWallet.walletId);
      expect(result.status).toBe('ok');
    });

    it('reacts to newChatContext changes without modifying store state', () => {
      const state: WalletStateValues = {
        ...mockWalletState,
        currentChatWalletDecision: { outcome: 'use_personal_wallet' },
      };

      // First, with personal context
      const personalResult = selectActiveChatWalletInfo(state, 'personal');
      expect(personalResult.type).toBe('personal');
      expect(personalResult.walletId).toBe(personalWallet.walletId);
      expect(personalResult.status).toBe('ok');

      // Now, change only the context to an organization id; selector should react
      const orgResult = selectActiveChatWalletInfo(state, orgId);
      expect(orgResult.type).toBe('organization');
      expect(orgResult.walletId).toBe(orgWallet.walletId);
      expect(orgResult.status).toBe('ok');
    });

    it('returns personal wallet info from context when decision is null', () => {
      const stateWithNullDecision: WalletStateValues = {
        ...mockWalletState,
        currentChatWalletDecision: null,
      };

      const result: ActiveChatWalletInfo = selectActiveChatWalletInfo(stateWithNullDecision, 'personal');

      expect(result.type).toBe('personal');
      expect(result.walletId).toBe(personalWallet.walletId);
      expect(result.status).toBe('ok');
    });
  });
});
