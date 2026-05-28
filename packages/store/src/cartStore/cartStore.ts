import { create } from 'zustand';
import type {
  PurchaseRequest,
  PurchaseRequestItem,
  SubscriptionPlan,
} from '@paynless/types';
import { logger } from '@paynless/utils';
import { useAuthStore } from '../authStore';
import { useSubscriptionStore } from '../subscriptionStore';
import { useWalletStore } from '../walletStore';
import type {
  CartItem,
  CartStore,
  CheckoutCart,
  PrefillCartRequest,
} from './cartStore.interface';

const initialCart: CheckoutCart = {
  subscriptionItem: null,
  otpItems: [],
};

export const useCartStore = create<CartStore>()((set, get) => ({
  cart: initialCart,
  isCheckingOut: false,
  checkoutError: null,

  setSubscriptionItem: (plan) => {
    if (plan === null) {
      const clearedCart: CheckoutCart = {
        subscriptionItem: null,
        otpItems: get().cart.otpItems,
      };
      set({ cart: clearedCart });
      return;
    }
    const subscriptionItem: CartItem = {
      plan,
      quantity: 1,
    };
    const updatedCart: CheckoutCart = {
      subscriptionItem,
      otpItems: get().cart.otpItems,
    };
    set({ cart: updatedCart });
  },

  addOtpItem: (plan, quantity) => {
    const currentCart: CheckoutCart = get().cart;
    const existingIndex: number = currentCart.otpItems.findIndex(
      (item) => item.plan.id === plan.id,
    );
    if (existingIndex >= 0) {
      const updatedOtpItems: CartItem[] = currentCart.otpItems.map(
        (item, index) => {
          if (index === existingIndex) {
            const incrementedItem: CartItem = {
              plan: item.plan,
              quantity: item.quantity + quantity,
            };
            return incrementedItem;
          }
          return item;
        },
      );
      const updatedCart: CheckoutCart = {
        subscriptionItem: currentCart.subscriptionItem,
        otpItems: updatedOtpItems,
      };
      set({ cart: updatedCart });
      return;
    }
    const newItem: CartItem = {
      plan,
      quantity,
    };
    const updatedCart: CheckoutCart = {
      subscriptionItem: currentCart.subscriptionItem,
      otpItems: [...currentCart.otpItems, newItem],
    };
    set({ cart: updatedCart });
  },

  removeOtpItem: (planId) => {
    const updatedCart: CheckoutCart = {
      subscriptionItem: get().cart.subscriptionItem,
      otpItems: get().cart.otpItems.filter((item) => item.plan.id !== planId),
    };
    set({ cart: updatedCart });
  },

  clearCart: () => {
    set({
      cart: initialCart,
      checkoutError: null,
    });
  },

  prefillCart: (request: PrefillCartRequest) => {
    get().clearCart();
    const availablePlans: SubscriptionPlan[] =
      useSubscriptionStore.getState().availablePlans;

    if (request.subscriptionPlanId !== undefined) {
      const subscriptionPlan = availablePlans.find(
        (plan) =>
          plan.id === request.subscriptionPlanId ||
          plan.stripe_price_id === request.subscriptionPlanId,
      );
      if (subscriptionPlan !== undefined) {
        get().setSubscriptionItem(subscriptionPlan);
      } else {
        logger.warn('[cartStore] Subscription plan not found for prefill.', {
          subscriptionPlanId: request.subscriptionPlanId,
        });
      }
    }

    if (request.otpPlanIds !== undefined) {
      for (const otpPlanId of request.otpPlanIds) {
        const otpPlan = availablePlans.find(
          (plan) => plan.id === otpPlanId || plan.stripe_price_id === otpPlanId,
        );
        if (otpPlan !== undefined) {
          get().addOtpItem(otpPlan, 1);
        } else {
          logger.warn('[cartStore] OTP plan not found for prefill.', {
            otpPlanId,
          });
        }
      }
    }
  },

  checkoutCart: async () => {
    set({ isCheckingOut: true, checkoutError: null });

    const { user, session } = useAuthStore.getState();
    if (user === null || session === null) {
      set({
        checkoutError: new Error('User not authenticated'),
        isCheckingOut: false,
      });
      return;
    }

    const cart: CheckoutCart = get().cart;
    const hasSubscriptionItem: boolean = cart.subscriptionItem !== null;
    const hasOtpItems: boolean = cart.otpItems.length > 0;
    if (!hasSubscriptionItem && !hasOtpItems) {
      set({
        checkoutError: new Error('Cart is empty'),
        isCheckingOut: false,
      });
      return;
    }

    const items: PurchaseRequestItem[] = [];

    if (cart.subscriptionItem !== null) {
      if (cart.subscriptionItem.plan.stripe_price_id === null) {
        set({
          checkoutError: new Error('Cart is empty'),
          isCheckingOut: false,
        });
        return;
      }
      const subscriptionItemEntry: PurchaseRequestItem = {
        itemId: cart.subscriptionItem.plan.stripe_price_id,
        quantity: cart.subscriptionItem.quantity,
      };
      items.push(subscriptionItemEntry);
    }

    for (const otpItem of cart.otpItems) {
      if (otpItem.plan.stripe_price_id === null) {
        set({
          checkoutError: new Error('Cart is empty'),
          isCheckingOut: false,
        });
        return;
      }
      const otpItemEntry: PurchaseRequestItem = {
        itemId: otpItem.plan.stripe_price_id,
        quantity: otpItem.quantity,
      };
      items.push(otpItemEntry);
    }

    if (items.length === 0) {
      set({
        checkoutError: new Error('Cart is empty'),
        isCheckingOut: false,
      });
      return;
    }

    let currencyPlan: SubscriptionPlan;
    if (cart.subscriptionItem !== null) {
      currencyPlan = cart.subscriptionItem.plan;
    } else {
      currencyPlan = cart.otpItems[0].plan;
    }

    if (currencyPlan.currency === null) {
      set({
        checkoutError: new Error('Cart is empty'),
        isCheckingOut: false,
      });
      return;
    }

    const firstItem: PurchaseRequestItem = items[0];
    const request: PurchaseRequest = {
      userId: user.id,
      itemId: firstItem.itemId,
      quantity: firstItem.quantity,
      items,
      currency: currencyPlan.currency,
      paymentGatewayId: 'stripe',
    };

    const result = await useWalletStore.getState().initiatePurchase(request);

    if (result === null) {
      set({
        checkoutError: new Error('Payment initiation failed'),
        isCheckingOut: false,
      });
      return;
    }

    if (!result.success) {
      const errorMessage: string =
        result.error !== undefined ? result.error : 'Payment initiation failed';
      set({
        checkoutError: new Error(errorMessage),
        isCheckingOut: false,
      });
      return;
    }

    if (result.redirectUrl !== undefined) {
      window.location.href = result.redirectUrl;
    }

    set({ isCheckingOut: false, checkoutError: null });
  },
}));
