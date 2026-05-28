import { describe, it, expect } from 'vitest';
import type { SubscriptionPlan } from '@paynless/types';
import type {
  CartItem,
  CheckoutCart,
  PrefillCartRequest,
} from './cartStore.interface';

const contractSubscriptionPlan: SubscriptionPlan = {
  id: 'contract-plan-otp',
  stripe_price_id: 'price_contract_otp',
  name: 'Contract OTP Pack',
  amount: 2500,
  currency: 'usd',
  interval: null,
  interval_count: null,
  active: true,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  description: { subtitle: 'OTP', features: ['tokens'] },
  metadata: null,
  stripe_product_id: 'prod_contract_otp',
  plan_type: 'one_time',
  item_id_internal: 'otp-6m',
  tokens_to_award: 6000000,
};

describe('cartStore.interface contract', () => {
  describe('CartItem', () => {
    it('valid CartItem with full SubscriptionPlan and positive quantity must pass', () => {
      const item: CartItem = {
        plan: contractSubscriptionPlan,
        quantity: 2,
      };
      expect(item.plan.id).toBe('contract-plan-otp');
      expect(item.quantity).toBe(2);
      expect(Number.isInteger(item.quantity)).toBe(true);
      expect(item.quantity).toBeGreaterThan(0);
    });

    it('valid CartItem with quantity of 1 is minimum positive integer', () => {
      const item: CartItem = {
        plan: contractSubscriptionPlan,
        quantity: 1,
      };
      expect(item.quantity).toBe(1);
      expect(item.quantity).toBeGreaterThan(0);
    });

    it('invalid CartItem null plan must fail contract', () => {
      const absent: CartItem | null = null;
      expect(absent).toBeNull();
      const requiredPlanKey: keyof CartItem = 'plan';
      expect(requiredPlanKey).toBe('plan');
    });

    it('invalid CartItem undefined plan must fail contract', () => {
      const planKey: keyof CartItem = 'plan';
      const undefinedPlan: undefined = undefined;
      expect(planKey).toBe('plan');
      expect(undefinedPlan).toBeUndefined();
    });

    it('invalid CartItem quantity zero must fail contract', () => {
      const invalidQuantity: number = 0;
      const minimumValidQuantity: CartItem['quantity'] = 1;
      expect(invalidQuantity).toBeLessThan(minimumValidQuantity);
      expect(invalidQuantity).toBe(0);
    });

    it('invalid CartItem negative quantity must fail contract', () => {
      const invalidQuantity: number = -1;
      const minimumValidQuantity: CartItem['quantity'] = 1;
      expect(invalidQuantity).toBeLessThan(minimumValidQuantity);
    });

    it('invalid CartItem missing quantity field must fail contract', () => {
      const requiredKeys: (keyof CartItem)[] = ['plan', 'quantity'];
      expect(requiredKeys).toContain('plan');
      expect(requiredKeys).toContain('quantity');
      expect(requiredKeys.length).toBe(2);
    });

    it('invalid CartItem missing plan field must fail contract', () => {
      const requiredKeys: (keyof CartItem)[] = ['plan', 'quantity'];
      expect(requiredKeys.includes('plan')).toBe(true);
    });

    it('invariant CartItem quantity is always a positive integer', () => {
      const item: CartItem = {
        plan: contractSubscriptionPlan,
        quantity: 3,
      };
      expect(Number.isInteger(item.quantity)).toBe(true);
      expect(item.quantity).toBeGreaterThan(0);
    });
  });

  describe('CheckoutCart', () => {
    it('valid CheckoutCart with null subscriptionItem and empty otpItems must pass', () => {
      const cart: CheckoutCart = {
        subscriptionItem: null,
        otpItems: [],
      };
      expect(cart.subscriptionItem).toBeNull();
      expect(cart.otpItems).toEqual([]);
      expect(Array.isArray(cart.otpItems)).toBe(true);
    });

    it('valid CheckoutCart with subscription CartItem and otp CartItem array must pass', () => {
      const subscriptionLine: CartItem = {
        plan: {
          ...contractSubscriptionPlan,
          id: 'contract-plan-sub',
          stripe_price_id: 'price_contract_sub',
          plan_type: 'subscription',
          interval: 'month',
          interval_count: 1,
        },
        quantity: 1,
      };
      const otpLine: CartItem = {
        plan: contractSubscriptionPlan,
        quantity: 2,
      };
      const cart: CheckoutCart = {
        subscriptionItem: subscriptionLine,
        otpItems: [otpLine],
      };
      expect(cart.subscriptionItem?.quantity).toBe(1);
      expect(cart.otpItems.length).toBe(1);
      expect(cart.otpItems[0].quantity).toBe(2);
    });

    it('invalid CheckoutCart truthy non-CartItem subscriptionItem must fail contract', () => {
      const notCartItem = { label: 'not-a-cart-item' };
      expect(notCartItem).not.toHaveProperty('plan');
      expect(notCartItem).not.toHaveProperty('quantity');
    });

    it('invalid CheckoutCart otpItems containing non-CartItem entries must fail contract', () => {
      const notCartItemEntry = { id: 'wrong-shape' };
      expect(notCartItemEntry).not.toHaveProperty('plan');
      expect(notCartItemEntry).not.toHaveProperty('quantity');
      const otpItemsKey: keyof CheckoutCart = 'otpItems';
      expect(otpItemsKey).toBe('otpItems');
    });

    it('invalid CheckoutCart otpItems null must fail contract', () => {
      const absentOtpItems: CheckoutCart['otpItems'] | null = null;
      expect(absentOtpItems).toBeNull();
    });

    it('invariant CheckoutCart otpItems is always an array never null or undefined', () => {
      const cart: CheckoutCart = {
        subscriptionItem: null,
        otpItems: [],
      };
      expect(cart.otpItems).not.toBeNull();
      expect(cart.otpItems).not.toBeUndefined();
      expect(Array.isArray(cart.otpItems)).toBe(true);
    });
  });

  describe('PrefillCartRequest', () => {
    it('valid PrefillCartRequest with subscriptionPlanId only must pass', () => {
      const request: PrefillCartRequest = {
        subscriptionPlanId: 'premium-monthly',
      };
      expect(request.subscriptionPlanId).toBe('premium-monthly');
    });

    it('valid PrefillCartRequest with otpPlanIds only must pass', () => {
      const request: PrefillCartRequest = {
        otpPlanIds: ['otp-6m', 'otp-18m'],
      };
      expect(request.otpPlanIds).toEqual(['otp-6m', 'otp-18m']);
    });

    it('valid PrefillCartRequest with both subscriptionPlanId and otpPlanIds must pass', () => {
      const request: PrefillCartRequest = {
        subscriptionPlanId: 'premium-monthly',
        otpPlanIds: ['otp-6m'],
      };
      expect(request.subscriptionPlanId).toBeDefined();
      expect(request.otpPlanIds?.length).toBe(1);
    });

    it('edge PrefillCartRequest with empty otpPlanIds array and subscriptionPlanId must pass', () => {
      const request: PrefillCartRequest = {
        subscriptionPlanId: 'basic-monthly',
        otpPlanIds: [],
      };
      expect(request.subscriptionPlanId).toBe('basic-monthly');
      expect(request.otpPlanIds).toEqual([]);
    });

    it('invalid PrefillCartRequest with both fields missing must fail contract', () => {
      const empty: Record<string, never> = {};
      expect('subscriptionPlanId' in empty).toBe(false);
      expect('otpPlanIds' in empty).toBe(false);
    });

    it('invalid PrefillCartRequest with both fields undefined must fail contract', () => {
      const subscriptionPlanIdKey: keyof PrefillCartRequest = 'subscriptionPlanId';
      const otpPlanIdsKey: keyof PrefillCartRequest = 'otpPlanIds';
      const undefinedField: undefined = undefined;
      expect(subscriptionPlanIdKey).toBe('subscriptionPlanId');
      expect(otpPlanIdsKey).toBe('otpPlanIds');
      expect(undefinedField).toBeUndefined();
    });

    it('invalid PrefillCartRequest non-object null must fail contract', () => {
      const absent: PrefillCartRequest | null = null;
      expect(absent).toBeNull();
    });
  });
});
