import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from '@testing-library/react';
import {
  api,
  resetApiMock,
  MockWalletApiClient,
} from '../../../api/src/mocks/api.mock';
import { resetMockLogger } from '../../../api/src/mocks/logger.mock';
import {
  mockSetAuthSession,
  mockSetAuthUser,
  resetAuthStoreMock,
} from '../../../../apps/web/src/mocks/authStore.mock';
import { getAiStoreState } from '../../../../apps/web/src/mocks/aiStore.mock';
import {
  createMockActions,
  internalMockOrgStoreGetState,
} from '../../../../apps/web/src/mocks/organizationStore.mock';
import { useCartStore } from './cartStore';
import { useSubscriptionStore } from '../subscriptionStore';
import { useWalletStore } from '../walletStore';
import {
  buildPrefillCartRequest,
  mockCartAvailablePlansForPrefill,
  mockCartCheckoutSession,
  mockCartCheckoutUser,
  mockCartPaymentSuccessResult,
  mockCartPrefillOtpByStripePriceRequest,
  mockCartSubscriptionPlan,
  mockCartPaymentRedirectUrl,
  mockSubscriptionPlan,
} from './cartStore.mock';

vi.mock('@paynless/api', async () => {
  const mockModule = await import('../../../api/src/mocks/api.mock');
  return { api: mockModule.api };
});

vi.mock('@paynless/utils', async (importOriginal) => {
  const actualUtils = await importOriginal<typeof import('@paynless/utils')>();
  const loggerMockModule = await import('../../../api/src/mocks/logger.mock');
  return {
    ...actualUtils,
    logger: loggerMockModule.mockLogger,
  };
});

vi.mock('../authStore', async () => {
  const authStoreMockModule = await import('../../../../apps/web/src/mocks/authStore.mock');
  Object.assign(authStoreMockModule.useAuthStore, {
    subscribe: vi.fn(() => vi.fn()),
  });
  return { useAuthStore: authStoreMockModule.useAuthStore };
});

vi.mock('../aiStore', () => ({
  useAiStore: {
    getState: vi.fn(() => getAiStoreState()),
  },
}));

vi.mock('../organizationStore', () => ({
  useOrganizationStore: {
    getState: vi.fn(() => ({
      ...internalMockOrgStoreGetState(),
      ...createMockActions(),
    })),
  },
}));

describe('useCartStore (integration)', () => {
  const originalLocation: Location = window.location;
  let stubbedLocation: Location;
  let mockInitiateTokenPurchase: MockWalletApiClient['initiateTokenPurchase'];

  beforeEach(() => {
    stubbedLocation = {
      ...originalLocation,
      href: '',
      assign: vi.fn(),
    };
    vi.stubGlobal('window', {
      ...window,
      location: stubbedLocation,
    });
    resetMockLogger();
    resetAuthStoreMock();
    resetApiMock();
    useWalletStore.getState()._resetForTesting();
    mockInitiateTokenPurchase = api.wallet().initiateTokenPurchase;
    mockInitiateTokenPurchase.mockResolvedValue({
      data: mockCartPaymentSuccessResult,
      error: undefined,
      status: 200,
    });
    act(() => {
      useCartStore.setState(useCartStore.getInitialState(), true);
      useSubscriptionStore.getState().setAvailablePlans([]);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('subscriptionStore.availablePlans → prefillCart', () => {
    beforeEach(() => {
      act(() => {
        useSubscriptionStore
          .getState()
          .setAvailablePlans(mockCartAvailablePlansForPrefill);
      });
    });

    it('populates cart from real subscriptionStore.availablePlans by plan id', () => {
      act(() => {
        useCartStore.getState().prefillCart(buildPrefillCartRequest());
      });

      expect(useCartStore.getState().cart.subscriptionItem).toEqual({
        plan: mockCartSubscriptionPlan,
        quantity: 1,
      });
      expect(useCartStore.getState().cart.otpItems).toEqual([]);
    });

    it('populates OTP lines from availablePlans by stripe_price_id', () => {
      act(() => {
        useCartStore.getState().prefillCart(mockCartPrefillOtpByStripePriceRequest);
      });

      expect(useCartStore.getState().cart.subscriptionItem).toBeNull();
      expect(useCartStore.getState().cart.otpItems).toEqual([
        { plan: mockSubscriptionPlan, quantity: 1 },
      ]);
    });
  });

  describe('checkoutCart → walletStore.initiatePurchase', () => {
    beforeEach(() => {
      mockSetAuthUser(mockCartCheckoutUser);
      mockSetAuthSession(mockCartCheckoutSession);
      act(() => {
        useCartStore.getState().setSubscriptionItem(mockCartSubscriptionPlan);
        useCartStore.getState().addOtpItem(mockSubscriptionPlan, 2);
      });
    });

    it('runs real initiatePurchase with multi-item PurchaseRequest from checkoutCart', async () => {
      await act(async () => {
        await useCartStore.getState().checkoutCart();
      });

      expect(mockInitiateTokenPurchase).toHaveBeenCalledWith({
        userId: mockCartCheckoutUser.id,
        itemId: mockCartSubscriptionPlan.stripe_price_id,
        quantity: 1,
        items: [
          {
            itemId: mockCartSubscriptionPlan.stripe_price_id,
            quantity: 1,
          },
          {
            itemId: mockSubscriptionPlan.stripe_price_id,
            quantity: 2,
          },
        ],
        currency: mockCartSubscriptionPlan.currency,
        paymentGatewayId: 'stripe',
      });
      expect(useWalletStore.getState().purchaseError).toBeNull();
      expect(useWalletStore.getState().isLoadingPurchase).toBe(false);
      expect(stubbedLocation.href).toBe(mockCartPaymentRedirectUrl);
      expect(useCartStore.getState().checkoutError).toBeNull();
      expect(useCartStore.getState().isCheckingOut).toBe(false);
    });
  });

  describe('full chain', () => {
    it('auth → prefill → modify cart → checkoutCart → wallet initiatePurchase', async () => {
      mockSetAuthUser(mockCartCheckoutUser);
      mockSetAuthSession(mockCartCheckoutSession);

      act(() => {
        useSubscriptionStore
          .getState()
          .setAvailablePlans(mockCartAvailablePlansForPrefill);
        useCartStore.getState().prefillCart(buildPrefillCartRequest());
        useCartStore.getState().setSubscriptionItem(mockSubscriptionPlan);
        useCartStore.getState().addOtpItem(mockSubscriptionPlan, 2);
      });

      expect(useCartStore.getState().cart.subscriptionItem).toEqual({
        plan: mockSubscriptionPlan,
        quantity: 1,
      });
      expect(useCartStore.getState().cart.otpItems).toEqual([
        { plan: mockSubscriptionPlan, quantity: 2 },
      ]);

      await act(async () => {
        await useCartStore.getState().checkoutCart();
      });

      expect(mockInitiateTokenPurchase).toHaveBeenCalledWith({
        userId: mockCartCheckoutUser.id,
        itemId: mockSubscriptionPlan.stripe_price_id,
        quantity: 1,
        items: [
          {
            itemId: mockSubscriptionPlan.stripe_price_id,
            quantity: 1,
          },
          {
            itemId: mockSubscriptionPlan.stripe_price_id,
            quantity: 2,
          },
        ],
        currency: mockSubscriptionPlan.currency,
        paymentGatewayId: 'stripe',
      });
      expect(useWalletStore.getState().purchaseError).toBeNull();
      expect(stubbedLocation.href).toBe(mockCartPaymentRedirectUrl);
      expect(useCartStore.getState().checkoutError).toBeNull();
      expect(useCartStore.getState().isCheckingOut).toBe(false);
    });
  });
});
