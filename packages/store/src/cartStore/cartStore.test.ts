import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from '@testing-library/react';
import type { PaymentInitiationResult } from '@paynless/types';
import { useCartStore } from './cartStore.ts';
import { useSubscriptionStore } from '../subscriptionStore';
import {
  buildPrefillCartRequest,
  initialCheckoutCart,
  mockCartAvailablePlansForPrefill,
  mockCartCheckoutSession,
  mockCartCheckoutUser,
  mockCartItemQty2,
  mockCartPaymentFailureMessage,
  mockCartPaymentFailureResult,
  mockCartPaymentRedirectUrl,
  mockCartPaymentSuccessResult,
  mockCartPrefillMissingSubscriptionRequest,
  mockCartPrefillOtpByStripePriceRequest,
  mockCartSubscriptionPlan,
  mockCheckoutCartWithLines,
  mockSubscriptionPlan,
} from './cartStore.mock';
import { mockLogger, resetMockLogger } from '../../../api/src/mocks/logger.mock';
import {
  captureRealAuthStore,
  mockSetAuthSession,
  mockSetAuthUser,
  resetAuthStoreMock,
} from '../../../../apps/web/src/mocks/authStore.mock';
import {
  initializeMockWalletStore,
  mockInitiatePurchase,
} from '../../../../apps/web/src/mocks/walletStore.mock';
import { resetSubscriptionStoreMock } from '../../../../apps/web/src/mocks/subscriptionStore.mock';

vi.mock('@paynless/utils', async (importOriginal) => {
  const actualUtils = await importOriginal<typeof import('@paynless/utils')>();
  const loggerMockModule = await import('../../../api/src/mocks/logger.mock');
  return {
    ...actualUtils,
    logger: loggerMockModule.mockLogger,
  };
});

vi.mock('../authStore', async (importOriginal) => {
  const actualAuthStoreModule = await importOriginal<typeof import('../authStore')>();
  const authStoreMockModule = await import('../../../../apps/web/src/mocks/authStore.mock');
  authStoreMockModule.captureRealAuthStore(actualAuthStoreModule.useAuthStore);
  return { useAuthStore: authStoreMockModule.useAuthStore };
});

vi.mock('../walletStore', async () => {
  const walletStoreMockModule = await import('../../../../apps/web/src/mocks/walletStore.mock');
  return { useWalletStore: walletStoreMockModule.useWalletStore };
});

vi.mock('../subscriptionStore', async () => {
  const subscriptionStoreMockModule = await import(
    '../../../../apps/web/src/mocks/subscriptionStore.mock'
  );
  return { useSubscriptionStore: subscriptionStoreMockModule.useSubscriptionStore };
});

describe('useCartStore', () => {
  beforeEach(() => {
    resetMockLogger();
    resetAuthStoreMock();
    resetSubscriptionStoreMock();
    initializeMockWalletStore();
    vi.clearAllMocks();
    act(() => {
      useCartStore.setState(useCartStore.getInitialState(), true);
      useSubscriptionStore.setState(useSubscriptionStore.getInitialState(), true);
    });
    mockInitiatePurchase.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('setSubscriptionItem', () => {
    it('sets subscription plan with quantity 1', () => {
      act(() => {
        useCartStore.getState().setSubscriptionItem(mockCartSubscriptionPlan);
      });
      expect(useCartStore.getState().cart.subscriptionItem).toEqual({
        plan: mockCartSubscriptionPlan,
        quantity: 1,
      });
    });

    it('replaces existing subscription', () => {
      act(() => {
        useCartStore.getState().setSubscriptionItem(mockCartSubscriptionPlan);
        useCartStore.getState().setSubscriptionItem(mockSubscriptionPlan);
      });
      expect(useCartStore.getState().cart.subscriptionItem).toEqual({
        plan: mockSubscriptionPlan,
        quantity: 1,
      });
    });

    it('clears subscription when null passed', () => {
      act(() => {
        useCartStore.getState().setSubscriptionItem(mockCartSubscriptionPlan);
        useCartStore.getState().setSubscriptionItem(null);
      });
      expect(useCartStore.getState().cart.subscriptionItem).toBeNull();
    });
  });

  describe('addOtpItem', () => {
    it('adds new OTP to empty cart', () => {
      act(() => {
        useCartStore.getState().addOtpItem(mockSubscriptionPlan, 2);
      });
      expect(useCartStore.getState().cart.otpItems).toEqual([
        { plan: mockSubscriptionPlan, quantity: 2 },
      ]);
    });

    it('adds different OTP alongside existing', () => {
      act(() => {
        useCartStore.getState().addOtpItem(mockSubscriptionPlan, 1);
        useCartStore.getState().addOtpItem(mockCartSubscriptionPlan, 3);
      });
      expect(useCartStore.getState().cart.otpItems).toHaveLength(2);
      expect(useCartStore.getState().cart.otpItems[0]).toEqual({
        plan: mockSubscriptionPlan,
        quantity: 1,
      });
      expect(useCartStore.getState().cart.otpItems[1]).toEqual({
        plan: mockCartSubscriptionPlan,
        quantity: 3,
      });
    });

    it('increments quantity when same plan.id already in cart', () => {
      act(() => {
        useCartStore.getState().addOtpItem(mockSubscriptionPlan, 2);
        useCartStore.getState().addOtpItem(mockSubscriptionPlan, 3);
      });
      expect(useCartStore.getState().cart.otpItems).toHaveLength(1);
      expect(useCartStore.getState().cart.otpItems[0]).toEqual({
        plan: mockSubscriptionPlan,
        quantity: 5,
      });
    });
  });

  describe('removeOtpItem', () => {
    it('removes existing OTP by planId', () => {
      act(() => {
        useCartStore.getState().addOtpItem(mockSubscriptionPlan, 1);
        useCartStore.getState().addOtpItem(mockCartSubscriptionPlan, 1);
        useCartStore.getState().removeOtpItem(mockSubscriptionPlan.id);
      });
      expect(useCartStore.getState().cart.otpItems).toEqual([
        { plan: mockCartSubscriptionPlan, quantity: 1 },
      ]);
    });

    it('no-ops when planId not found', () => {
      act(() => {
        useCartStore.getState().addOtpItem(mockSubscriptionPlan, 1);
        useCartStore.getState().removeOtpItem('missing-plan-id');
      });
      expect(useCartStore.getState().cart.otpItems).toEqual([
        { plan: mockSubscriptionPlan, quantity: 1 },
      ]);
    });

    it('does not affect subscription item', () => {
      act(() => {
        useCartStore.getState().setSubscriptionItem(mockCartSubscriptionPlan);
        useCartStore.getState().addOtpItem(mockSubscriptionPlan, 1);
        useCartStore.getState().removeOtpItem(mockSubscriptionPlan.id);
      });
      expect(useCartStore.getState().cart.subscriptionItem).toEqual({
        plan: mockCartSubscriptionPlan,
        quantity: 1,
      });
    });
  });

  describe('clearCart', () => {
    it('resets cart to empty', () => {
      act(() => {
        useCartStore.getState().setSubscriptionItem(mockCartSubscriptionPlan);
        useCartStore.getState().addOtpItem(mockSubscriptionPlan, 1);
        useCartStore.getState().clearCart();
      });
      expect(useCartStore.getState().cart).toEqual(initialCheckoutCart);
    });

    it('clears checkoutError if set', async () => {
      mockSetAuthUser(mockCartCheckoutUser);
      mockSetAuthSession(mockCartCheckoutSession);
      mockInitiatePurchase.mockResolvedValue(null);
      await act(async () => {
        await useCartStore.getState().checkoutCart();
      });
      expect(useCartStore.getState().checkoutError).not.toBeNull();
      act(() => {
        useCartStore.getState().clearCart();
      });
      expect(useCartStore.getState().checkoutError).toBeNull();
    });
  });

  describe('prefillCart', () => {
    beforeEach(() => {
      act(() => {
        useSubscriptionStore
          .getState()
          .setAvailablePlans(mockCartAvailablePlansForPrefill);
      });
    });

    it('populates subscription item from availablePlans by id', () => {
      act(() => {
        useCartStore.getState().setSubscriptionItem(mockSubscriptionPlan);
        useCartStore.getState().prefillCart(buildPrefillCartRequest());
      });
      expect(useCartStore.getState().cart.subscriptionItem).toEqual({
        plan: mockCartSubscriptionPlan,
        quantity: 1,
      });
    });

    it('populates OTP items from availablePlans by stripe_price_id', () => {
      act(() => {
        useCartStore.getState().prefillCart(mockCartPrefillOtpByStripePriceRequest);
      });
      expect(useCartStore.getState().cart.subscriptionItem).toBeNull();
      expect(useCartStore.getState().cart.otpItems).toEqual([
        { plan: mockSubscriptionPlan, quantity: 1 },
      ]);
    });

    it('skips unfound plans and logs warning', () => {
      act(() => {
        useCartStore.getState().prefillCart(mockCartPrefillMissingSubscriptionRequest);
      });
      expect(useCartStore.getState().cart).toEqual(initialCheckoutCart);
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('clears cart before populating', () => {
      act(() => {
        useCartStore.getState().setSubscriptionItem(mockSubscriptionPlan);
        useCartStore.getState().addOtpItem(mockCartSubscriptionPlan, 2);
        useCartStore.getState().prefillCart(buildPrefillCartRequest());
      });
      expect(useCartStore.getState().cart.otpItems).toEqual([]);
      expect(useCartStore.getState().cart.subscriptionItem).toEqual({
        plan: mockCartSubscriptionPlan,
        quantity: 1,
      });
    });
  });

  describe('checkoutCart', () => {
    const originalLocation: Location = window.location;
    let stubbedLocation: Location;

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
      mockSetAuthUser(mockCartCheckoutUser);
      mockSetAuthSession(mockCartCheckoutSession);
      act(() => {
        useCartStore.getState().setSubscriptionItem(mockCartSubscriptionPlan);
        useCartStore.getState().addOtpItem(mockSubscriptionPlan, 2);
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('builds PurchaseRequest with items array, calls initiatePurchase, and handles redirect', async () => {
      mockInitiatePurchase.mockResolvedValue(mockCartPaymentSuccessResult);

      await act(async () => {
        await useCartStore.getState().checkoutCart();
      });

      expect(mockInitiatePurchase).toHaveBeenCalledWith({
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
      expect(stubbedLocation.href).toBe(mockCartPaymentRedirectUrl);
      expect(useCartStore.getState().checkoutError).toBeNull();
      expect(useCartStore.getState().isCheckingOut).toBe(false);
    });

    it('sets checkoutError when unauthenticated and does not call initiatePurchase', async () => {
      resetAuthStoreMock();
      mockInitiatePurchase.mockResolvedValue(mockCartPaymentSuccessResult);

      await act(async () => {
        await useCartStore.getState().checkoutCart();
      });

      expect(mockInitiatePurchase).not.toHaveBeenCalled();
      expect(useCartStore.getState().checkoutError?.message).toBe(
        'User not authenticated',
      );
      expect(useCartStore.getState().isCheckingOut).toBe(false);
    });

    it('sets checkoutError when cart is empty and does not call initiatePurchase', async () => {
      act(() => {
        useCartStore.getState().clearCart();
      });
      mockInitiatePurchase.mockResolvedValue(mockCartPaymentSuccessResult);

      await act(async () => {
        await useCartStore.getState().checkoutCart();
      });

      expect(mockInitiatePurchase).not.toHaveBeenCalled();
      expect(useCartStore.getState().checkoutError?.message).toBe('Cart is empty');
      expect(useCartStore.getState().isCheckingOut).toBe(false);
    });

    it('sets checkoutError when initiatePurchase returns null', async () => {
      mockInitiatePurchase.mockResolvedValue(null);

      await act(async () => {
        await useCartStore.getState().checkoutCart();
      });

      expect(useCartStore.getState().checkoutError?.message).toBe(
        'Payment initiation failed',
      );
      expect(useCartStore.getState().isCheckingOut).toBe(false);
    });

    it('sets checkoutError from result when initiatePurchase returns success false', async () => {
      mockInitiatePurchase.mockResolvedValue(mockCartPaymentFailureResult);

      await act(async () => {
        await useCartStore.getState().checkoutCart();
      });

      expect(useCartStore.getState().checkoutError?.message).toBe(
        mockCartPaymentFailureMessage,
      );
      expect(useCartStore.getState().isCheckingOut).toBe(false);
    });

    it('sets isCheckingOut true during execution and false after', async () => {
      let resolvePurchase: (value: PaymentInitiationResult) => void;
      const pendingResult: Promise<PaymentInitiationResult> = new Promise(
        (resolve) => {
          resolvePurchase = resolve;
        },
      );
      mockInitiatePurchase.mockReturnValue(pendingResult);

      let checkoutPromise: Promise<void>;
      act(() => {
        checkoutPromise = useCartStore.getState().checkoutCart();
      });
      expect(useCartStore.getState().isCheckingOut).toBe(true);

      await act(async () => {
        resolvePurchase(mockCartPaymentSuccessResult);
        await checkoutPromise;
      });

      expect(useCartStore.getState().isCheckingOut).toBe(false);
    });
  });
});
