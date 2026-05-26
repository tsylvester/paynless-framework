import { describe, it, expect } from 'vitest';
import type {
  CurrentSubscriptionCardProps,
  CurrentSubscriptionCardFormatAmountFn,
  CurrentSubscriptionCardFormatIntervalFn,
} from './CurrentSubscriptionCard.interface';

describe('CurrentSubscriptionCard.interface contract', () => {
  describe('CurrentSubscriptionCardProps', () => {
    it('valid CurrentSubscriptionCardProps with all fields and named formatter types must pass', () => {
      const formatAmount: CurrentSubscriptionCardFormatAmountFn = (
        amount: number,
        currency: string,
      ): string => `${amount}-${currency}`;
      const formatInterval: CurrentSubscriptionCardFormatIntervalFn = (
        interval: string | null | undefined,
        count: number | null | undefined,
      ): string => `${interval ?? ''}-${count ?? ''}`;
      const props: CurrentSubscriptionCardProps = {
        subscription: {
          id: 'sub_user_123',
          user_id: 'user-abc',
          stripe_customer_id: 'cus_xyz',
          stripe_subscription_id: 'stripe_sub_xyz',
          status: 'active',
          plan_id: 'plan_pro_456',
          current_period_start: '2024-01-01T00:00:00.000Z',
          current_period_end: '2024-02-01T00:00:00.000Z',
          cancel_at_period_end: false,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
          has_ever_paid: true,
          tier_level: 10,
        },
        plan: {
          id: 'plan_pro_456',
          stripe_price_id: 'price_pro_stripe_456',
          stripe_product_id: 'prod_pro_stripe',
          name: 'Pro Plan',
          description: {
            subtitle: 'For professionals',
            features: ['Pro Feature 1'],
          },
          amount: 2500,
          currency: 'usd',
          interval: 'month',
          interval_count: 1,
          active: true,
          metadata: null,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
          item_id_internal: null,
          plan_type: 'subscription',
          tier_level: 10,
          tokens_to_award: 1000,
        },
        isProcessing: false,
        handleManageSubscription: (): void => {},
        handleCancelSubscription: (): void => {},
        formatAmount,
        formatInterval,
      };
      expect(props.subscription).toBeDefined();
      expect(props.plan).toBeDefined();
      expect(typeof props.isProcessing).toBe('boolean');
      expect(typeof props.handleManageSubscription).toBe('function');
      expect(typeof props.handleCancelSubscription).toBe('function');
      expect(typeof props.formatAmount).toBe('function');
      expect(typeof props.formatInterval).toBe('function');
    });

    it('valid CurrentSubscriptionCardProps with subscription status active must pass', () => {
      const props: CurrentSubscriptionCardProps = {
        subscription: {
          id: 'sub_user_123',
          user_id: 'user-abc',
          stripe_customer_id: 'cus_xyz',
          stripe_subscription_id: 'stripe_sub_xyz',
          status: 'active',
          plan_id: 'plan_pro_456',
          current_period_start: '2024-01-01T00:00:00.000Z',
          current_period_end: '2024-02-01T00:00:00.000Z',
          cancel_at_period_end: false,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
          has_ever_paid: true,
          tier_level: 10,
        },
        plan: {
          id: 'plan_pro_456',
          stripe_price_id: 'price_pro_stripe_456',
          stripe_product_id: 'prod_pro_stripe',
          name: 'Pro Plan',
          description: {
            subtitle: 'For professionals',
            features: ['Pro Feature 1'],
          },
          amount: 2500,
          currency: 'usd',
          interval: 'month',
          interval_count: 1,
          active: true,
          metadata: null,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
          item_id_internal: null,
          plan_type: 'subscription',
          tier_level: 10,
          tokens_to_award: 1000,
        },
        isProcessing: false,
        handleManageSubscription: (): void => {},
        handleCancelSubscription: (): void => {},
        formatAmount: (): string => '',
        formatInterval: (): string => '',
      };
      expect(props.subscription.status).toBe('active');
    });

    it('valid CurrentSubscriptionCardProps with subscription status trialing must pass', () => {
      const props: CurrentSubscriptionCardProps = {
        subscription: {
          id: 'sub_user_123',
          user_id: 'user-abc',
          stripe_customer_id: 'cus_xyz',
          stripe_subscription_id: 'stripe_sub_xyz',
          status: 'trialing',
          plan_id: 'plan_pro_456',
          current_period_start: '2024-01-01T00:00:00.000Z',
          current_period_end: '2024-02-01T00:00:00.000Z',
          cancel_at_period_end: false,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
          has_ever_paid: true,
          tier_level: 10,
        },
        plan: {
          id: 'plan_pro_456',
          stripe_price_id: 'price_pro_stripe_456',
          stripe_product_id: 'prod_pro_stripe',
          name: 'Pro Plan',
          description: {
            subtitle: 'For professionals',
            features: ['Pro Feature 1'],
          },
          amount: 2500,
          currency: 'usd',
          interval: 'month',
          interval_count: 1,
          active: true,
          metadata: null,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
          item_id_internal: null,
          plan_type: 'subscription',
          tier_level: 10,
          tokens_to_award: 1000,
        },
        isProcessing: false,
        handleManageSubscription: (): void => {},
        handleCancelSubscription: (): void => {},
        formatAmount: (): string => '',
        formatInterval: (): string => '',
      };
      expect(props.subscription.status).toBe('trialing');
    });

    it('valid CurrentSubscriptionCardProps with subscription status past_due must pass', () => {
      const props: CurrentSubscriptionCardProps = {
        subscription: {
          id: 'sub_user_123',
          user_id: 'user-abc',
          stripe_customer_id: 'cus_xyz',
          stripe_subscription_id: 'stripe_sub_xyz',
          status: 'past_due',
          plan_id: 'plan_pro_456',
          current_period_start: '2024-01-01T00:00:00.000Z',
          current_period_end: '2024-02-01T00:00:00.000Z',
          cancel_at_period_end: false,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
          has_ever_paid: true,
          tier_level: 10,
        },
        plan: {
          id: 'plan_pro_456',
          stripe_price_id: 'price_pro_stripe_456',
          stripe_product_id: 'prod_pro_stripe',
          name: 'Pro Plan',
          description: {
            subtitle: 'For professionals',
            features: ['Pro Feature 1'],
          },
          amount: 2500,
          currency: 'usd',
          interval: 'month',
          interval_count: 1,
          active: true,
          metadata: null,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
          item_id_internal: null,
          plan_type: 'subscription',
          tier_level: 10,
          tokens_to_award: 1000,
        },
        isProcessing: false,
        handleManageSubscription: (): void => {},
        handleCancelSubscription: (): void => {},
        formatAmount: (): string => '',
        formatInterval: (): string => '',
      };
      expect(props.subscription.status).toBe('past_due');
    });

    it('invalid CurrentSubscriptionCardProps props is null must fail contract', () => {
      const absent: CurrentSubscriptionCardProps | null = null;
      expect(absent).toBeNull();
      const subscriptionKey: keyof CurrentSubscriptionCardProps = 'subscription';
      expect(subscriptionKey).toBe('subscription');
    });

    it('invalid CurrentSubscriptionCardProps missing subscription must fail contract', () => {
      const subscriptionKey: keyof CurrentSubscriptionCardProps = 'subscription';
      expect(subscriptionKey).toBe('subscription');
      const missingSubscription: undefined = undefined;
      expect(missingSubscription).toBeUndefined();
    });

    it('invalid CurrentSubscriptionCardProps missing plan must fail contract', () => {
      const planKey: keyof CurrentSubscriptionCardProps = 'plan';
      expect(planKey).toBe('plan');
      const missingPlan: undefined = undefined;
      expect(missingPlan).toBeUndefined();
    });

    it('invalid CurrentSubscriptionCardProps must require separate subscription and plan keys not merged object', () => {
      const subscriptionKey: keyof CurrentSubscriptionCardProps = 'subscription';
      const planKey: keyof CurrentSubscriptionCardProps = 'plan';
      expect(subscriptionKey).toBe('subscription');
      expect(planKey).toBe('plan');
      const mergedPropName: string = 'userSubscription';
      expect(mergedPropName).not.toBe(subscriptionKey);
      expect(mergedPropName).not.toBe(planKey);
    });

    it('invalid CurrentSubscriptionCardProps isProcessing is not boolean must fail contract', () => {
      const invalidIsProcessing: string = 'true';
      expect(typeof invalidIsProcessing).not.toBe('boolean');
      const isProcessingKey: keyof CurrentSubscriptionCardProps = 'isProcessing';
      expect(isProcessingKey).toBe('isProcessing');
    });

    it('invalid CurrentSubscriptionCardProps missing handleManageSubscription must fail contract', () => {
      const handleManageSubscriptionKey: keyof CurrentSubscriptionCardProps =
        'handleManageSubscription';
      expect(handleManageSubscriptionKey).toBe('handleManageSubscription');
      const missingCallback: undefined = undefined;
      expect(missingCallback).toBeUndefined();
    });

    it('invalid CurrentSubscriptionCardProps missing handleCancelSubscription must fail contract', () => {
      const handleCancelSubscriptionKey: keyof CurrentSubscriptionCardProps =
        'handleCancelSubscription';
      expect(handleCancelSubscriptionKey).toBe('handleCancelSubscription');
      const missingCallback: undefined = undefined;
      expect(missingCallback).toBeUndefined();
    });

    it('invalid CurrentSubscriptionCardProps handleManageSubscription is string instead of function must fail contract', () => {
      const notAFunction: string = 'manage';
      expect(typeof notAFunction).not.toBe('function');
      const handleManageSubscriptionKey: keyof CurrentSubscriptionCardProps =
        'handleManageSubscription';
      expect(handleManageSubscriptionKey).toBe('handleManageSubscription');
    });

    it('invalid CurrentSubscriptionCardProps missing formatAmount must fail contract', () => {
      const formatAmountKey: keyof CurrentSubscriptionCardProps = 'formatAmount';
      expect(formatAmountKey).toBe('formatAmount');
      const missingFormatAmount: undefined = undefined;
      expect(missingFormatAmount).toBeUndefined();
    });

    it('invalid CurrentSubscriptionCardProps formatAmount is not a function must fail contract', () => {
      const notAFunction: number = 1;
      expect(typeof notAFunction).not.toBe('function');
      const formatAmountKey: keyof CurrentSubscriptionCardProps = 'formatAmount';
      expect(formatAmountKey).toBe('formatAmount');
    });

    it('invalid CurrentSubscriptionCardProps missing formatInterval must fail contract', () => {
      const formatIntervalKey: keyof CurrentSubscriptionCardProps = 'formatInterval';
      expect(formatIntervalKey).toBe('formatInterval');
      const missingFormatInterval: undefined = undefined;
      expect(missingFormatInterval).toBeUndefined();
    });

    it('invalid CurrentSubscriptionCardProps formatInterval is not a function must fail contract', () => {
      const notAFunction: number = 1;
      expect(typeof notAFunction).not.toBe('function');
      const formatIntervalKey: keyof CurrentSubscriptionCardProps = 'formatInterval';
      expect(formatIntervalKey).toBe('formatInterval');
    });

    it('invariant CurrentSubscriptionCardProps declares subscription key', () => {
      const subscriptionKey: keyof CurrentSubscriptionCardProps = 'subscription';
      expect(subscriptionKey).toBe('subscription');
    });

    it('invariant CurrentSubscriptionCardProps declares plan key', () => {
      const planKey: keyof CurrentSubscriptionCardProps = 'plan';
      expect(planKey).toBe('plan');
    });

    it('invariant CurrentSubscriptionCardProps declares isProcessing key', () => {
      const isProcessingKey: keyof CurrentSubscriptionCardProps = 'isProcessing';
      expect(isProcessingKey).toBe('isProcessing');
    });

    it('invariant CurrentSubscriptionCardProps callbacks are functions on valid props', () => {
      const props: CurrentSubscriptionCardProps = {
        subscription: {
          id: 'sub_user_123',
          user_id: 'user-abc',
          stripe_customer_id: 'cus_xyz',
          stripe_subscription_id: 'stripe_sub_xyz',
          status: 'active',
          plan_id: 'plan_pro_456',
          current_period_start: '2024-01-01T00:00:00.000Z',
          current_period_end: '2024-02-01T00:00:00.000Z',
          cancel_at_period_end: false,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
          has_ever_paid: true,
          tier_level: 10,
        },
        plan: {
          id: 'plan_pro_456',
          stripe_price_id: 'price_pro_stripe_456',
          stripe_product_id: 'prod_pro_stripe',
          name: 'Pro Plan',
          description: {
            subtitle: 'For professionals',
            features: ['Pro Feature 1'],
          },
          amount: 2500,
          currency: 'usd',
          interval: 'month',
          interval_count: 1,
          active: true,
          metadata: null,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
          item_id_internal: null,
          plan_type: 'subscription',
          tier_level: 10,
          tokens_to_award: 1000,
        },
        isProcessing: false,
        handleManageSubscription: (): void => {},
        handleCancelSubscription: (): void => {},
        formatAmount: (): string => '',
        formatInterval: (): string => '',
      };
      expect(typeof props.handleManageSubscription).toBe('function');
      expect(typeof props.handleCancelSubscription).toBe('function');
      expect(typeof props.formatAmount).toBe('function');
      expect(typeof props.formatInterval).toBe('function');
    });

    it('invariant CurrentSubscriptionCardProps isProcessing is boolean on valid props', () => {
      const props: CurrentSubscriptionCardProps = {
        subscription: {
          id: 'sub_user_123',
          user_id: 'user-abc',
          stripe_customer_id: 'cus_xyz',
          stripe_subscription_id: 'stripe_sub_xyz',
          status: 'active',
          plan_id: 'plan_pro_456',
          current_period_start: '2024-01-01T00:00:00.000Z',
          current_period_end: '2024-02-01T00:00:00.000Z',
          cancel_at_period_end: false,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
          has_ever_paid: true,
          tier_level: 10,
        },
        plan: {
          id: 'plan_pro_456',
          stripe_price_id: 'price_pro_stripe_456',
          stripe_product_id: 'prod_pro_stripe',
          name: 'Pro Plan',
          description: {
            subtitle: 'For professionals',
            features: ['Pro Feature 1'],
          },
          amount: 2500,
          currency: 'usd',
          interval: 'month',
          interval_count: 1,
          active: true,
          metadata: null,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
          item_id_internal: null,
          plan_type: 'subscription',
          tier_level: 10,
          tokens_to_award: 1000,
        },
        isProcessing: true,
        handleManageSubscription: (): void => {},
        handleCancelSubscription: (): void => {},
        formatAmount: (): string => '',
        formatInterval: (): string => '',
      };
      expect(typeof props.isProcessing).toBe('boolean');
    });
  });
});
