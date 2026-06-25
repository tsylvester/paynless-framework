import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from '@testing-library/react';
import type { PaymentInitiationResult, Session, User } from '@paynless/types';
import { useCartStore } from './cartStore.ts';
import { useSubscriptionStore } from '../subscriptionStore';
import {
  buildPrefillCartRequest,
  buildCheckoutCart,
} from './cartStore.mock';
import {
  buildSubscriptionPlan,
  mockOtpPlan,
  mockSubscriptionPlan,
} from '../../../../apps/web/src/components/subscription/PlanCard.mock';
import { mockLogger, resetMockLogger } from '../../../api/src/mocks/logger.mock';
import {
  mockSetAuthSession,
  mockSetAuthUser,
  resetAuthStoreMock,
} from '../../../../apps/web/src/mocks/authStore.mock';
import { mockUserProfile } from '../../../../apps/web/src/mocks/profile.mock';
import { mockInitiatePurchase } from '../../../../apps/web/src/mocks/walletStore.mock';

const cartCheckoutUser: User = {
  id: mockUserProfile.id,
};

const cartCheckoutSession: Session = {
  access_token: 'mock-token',
  refresh_token: 'mock-refresh',
  expiresAt: Date.now() + 3600000,
};

const cartPaymentRedirectUrl: string =
  'https://checkout.stripe.com/pay/cs_mock_session';

const cartPaymentSuccessResult: PaymentInitiationResult = {
  success: true,
  redirectUrl: cartPaymentRedirectUrl,
};

const cartPaymentFailureMessage: string = 'Checkout declined';

const cartPaymentFailureResult: PaymentInitiationResult = {
  success: false,
  error: cartPaymentFailureMessage,
};
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
    vi.clearAllMocks();
    act(() => {
      useCartStore.setState(useCartStore.getInitialState(), true);
      useSubscriptionStore.setState(useSubscriptionStore.getInitialState(), true);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('setSubscriptionItem', () => {
    it('sets subscription plan with quantity 1', () => {
      act(() => {
        useCartStore.getState().setSubscriptionItem(buildSubscriptionPlan());
      });
      expect(useCartStore.getState().cart.subscriptionItem).toEqual({
        plan: buildSubscriptionPlan(),
        quantity: 1,
      });
    });

    it('replaces existing subscription', () => {
      act(() => {
        useCartStore.getState().setSubscriptionItem(buildSubscriptionPlan());
        useCartStore.getState().setSubscriptionItem(buildSubscriptionPlan());
      });
      expect(useCartStore.getState().cart.subscriptionItem).toEqual({
        plan: buildSubscriptionPlan(),
        quantity: 1,
      });
    });

    it('clears subscription when null passed', () => {
      act(() => {
        useCartStore.getState().setSubscriptionItem(buildSubscriptionPlan());
        useCartStore.getState().setSubscriptionItem(null);
      });
      expect(useCartStore.getState().cart.subscriptionItem).toBeNull();
    });
  });

  describe('addOtpItem', () => {
    it('adds new OTP to empty cart', () => {
      act(() => {
        useCartStore.getState().addOtpItem(buildSubscriptionPlan(), 2);
      });
      expect(useCartStore.getState().cart.otpItems).toEqual([
        { plan: buildSubscriptionPlan(), quantity: 2 },
      ]);
    });

    it('adds different OTP alongside existing', () => {
      act(() => {
        useCartStore.getState().addOtpItem(buildSubscriptionPlan(), 1);
        useCartStore.getState().addOtpItem(mockOtpPlan, 3);
      });
      expect(useCartStore.getState().cart.otpItems).toHaveLength(2);
      expect(useCartStore.getState().cart.otpItems[0]).toEqual({
        plan: buildSubscriptionPlan(),
        quantity: 1,
      });
      expect(useCartStore.getState().cart.otpItems[1]).toEqual({
        plan: mockOtpPlan,
        quantity: 3,
      });
    });

    it('increments quantity when same plan.id already in cart', () => {
      act(() => {
        useCartStore.getState().addOtpItem(buildSubscriptionPlan(), 2);
        useCartStore.getState().addOtpItem(buildSubscriptionPlan(), 3);
      });
      expect(useCartStore.getState().cart.otpItems).toHaveLength(1);
      expect(useCartStore.getState().cart.otpItems[0]).toEqual({
        plan: buildSubscriptionPlan(),
        quantity: 5,
      });
    });
  });

  describe('removeOtpItem', () => {
    it('removes existing OTP by planId', () => {
      act(() => {
        useCartStore.getState().addOtpItem(buildSubscriptionPlan(), 1);
        useCartStore.getState().addOtpItem(mockOtpPlan, 1);
        useCartStore.getState().removeOtpItem(buildSubscriptionPlan().id);
      });
      expect(useCartStore.getState().cart.otpItems).toEqual([
        { plan: mockOtpPlan, quantity: 1 },
      ]);
    });

    it('no-ops when planId not found', () => {
      act(() => {
        useCartStore.getState().addOtpItem(buildSubscriptionPlan(), 1);
        useCartStore.getState().removeOtpItem('missing-plan-id');
      });
      expect(useCartStore.getState().cart.otpItems).toEqual([
        { plan: buildSubscriptionPlan(), quantity: 1 },
      ]);
    });

    it('does not affect subscription item', () => {
      act(() => {
        useCartStore.getState().setSubscriptionItem(buildSubscriptionPlan());
        useCartStore.getState().addOtpItem(buildSubscriptionPlan(), 1);
        useCartStore.getState().removeOtpItem(buildSubscriptionPlan().id);
      });
      expect(useCartStore.getState().cart.subscriptionItem).toEqual({
        plan: buildSubscriptionPlan(),
        quantity: 1,
      });
    });
  });

  describe('clearCart', () => {
    it('resets cart to empty', () => {
      act(() => {
        useCartStore.getState().setSubscriptionItem(buildSubscriptionPlan());
        useCartStore.getState().addOtpItem(buildSubscriptionPlan(), 1);
        useCartStore.getState().clearCart();
      });
      expect(useCartStore.getState().cart).toEqual(buildCheckoutCart());
    });

    it('clears checkoutError if set', async () => {
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
          .setAvailablePlans([buildSubscriptionPlan()]);
      });
    });

    it('populates subscription item from availablePlans by id', () => {
      act(() => {
        useCartStore.getState().setSubscriptionItem(buildSubscriptionPlan());
        useCartStore.getState().prefillCart(
          buildPrefillCartRequest({
            subscriptionPlanId: buildSubscriptionPlan().id,
          }),
        );
      });
      expect(useCartStore.getState().cart.subscriptionItem).toEqual({
        plan: buildSubscriptionPlan(),
        quantity: 1,
      });
    });

    it('populates OTP items from availablePlans by stripe_price_id', () => {
      act(() => {
        useCartStore.getState().prefillCart(buildPrefillCartRequest({ otpPlanIds: [buildSubscriptionPlan().id] }));
      });
      expect(useCartStore.getState().cart.subscriptionItem).toBeNull();
      expect(useCartStore.getState().cart.otpItems).toEqual([
        { plan: buildSubscriptionPlan(), quantity: 1 },
      ]);
    });

    it('skips unfound plans and logs warning', () => {
      act(() => {
        useCartStore.getState().prefillCart(buildPrefillCartRequest({ subscriptionPlanId: 'missing-plan-id' }));
      });
      expect(useCartStore.getState().cart).toEqual(buildCheckoutCart());
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('clears cart before populating', () => {
      act(() => {
        useCartStore.getState().setSubscriptionItem(buildSubscriptionPlan());
        useCartStore.getState().addOtpItem(buildSubscriptionPlan(), 2);
        useCartStore.getState().prefillCart(
          buildPrefillCartRequest({
            subscriptionPlanId: buildSubscriptionPlan().id,
          }),
        );
      });
      expect(useCartStore.getState().cart.otpItems).toEqual([]);
      expect(useCartStore.getState().cart.subscriptionItem).toEqual({
        plan: buildSubscriptionPlan(),
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
      mockSetAuthUser(cartCheckoutUser);
      mockSetAuthSession(cartCheckoutSession);
      act(() => {
        useCartStore.getState().setSubscriptionItem(mockSubscriptionPlan);
        useCartStore.getState().addOtpItem(mockOtpPlan, 2);
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('builds PurchaseRequest with items array, calls initiatePurchase, and handles redirect', async () => {
      mockInitiatePurchase.mockResolvedValue(cartPaymentSuccessResult);

      await act(async () => {
        await useCartStore.getState().checkoutCart();
      });

      expect(mockInitiatePurchase).toHaveBeenCalledWith({
        userId: cartCheckoutUser.id,
        itemId: mockSubscriptionPlan.stripe_price_id,
        quantity: 1,
        items: [
          {
            itemId: mockSubscriptionPlan.stripe_price_id,
            quantity: 1,
          },
          {
            itemId: mockOtpPlan.stripe_price_id,
            quantity: 2,
          },
        ],
        currency: mockSubscriptionPlan.currency,
        paymentGatewayId: 'stripe',
      });
      expect(stubbedLocation.href).toBe(cartPaymentRedirectUrl);
      expect(useCartStore.getState().checkoutError).toBeNull();
      expect(useCartStore.getState().isCheckingOut).toBe(false);
    });

    it('sets checkoutError when unauthenticated and does not call initiatePurchase', async () => {
      resetAuthStoreMock();
      mockInitiatePurchase.mockResolvedValue(cartPaymentSuccessResult);

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
      mockInitiatePurchase.mockResolvedValue(cartPaymentSuccessResult);

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
      mockInitiatePurchase.mockResolvedValue(cartPaymentFailureResult);

      await act(async () => {
        await useCartStore.getState().checkoutCart();
      });

      expect(useCartStore.getState().checkoutError?.message).toBe(
        cartPaymentFailureMessage,
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
        resolvePurchase(cartPaymentSuccessResult);
        await checkoutPromise;
      });

      expect(useCartStore.getState().isCheckingOut).toBe(false);
    });
  });
});
