export enum SubscriptionStatus {
  ACTIVE = 'active',
  CANCELED = 'canceled',
  PAST_DUE = 'past_due',
  UNPAID = 'unpaid',
  INCOMPLETE = 'incomplete',
  INCOMPLETE_EXPIRED = 'incomplete_expired',
  TRIALING = 'trialing',
  CANCELED_AT_PERIOD_END = 'canceled_at_period_end'
}

export enum SubscriptionEventType {
  SUBSCRIPTION_CREATED = 'subscription_created',
  SUBSCRIPTION_UPDATED = 'subscription_updated',
  SUBSCRIPTION_CANCELED = 'subscription_canceled',
  SUBSCRIPTION_RESUMED = 'subscription_resumed',
  PLAN_CHANGED = 'plan_changed',
  PLAN_UPGRADED = 'plan_upgraded',
  PLAN_DOWNGRADED = 'plan_downgraded',
  PAYMENT_SUCCEEDED = 'payment_succeeded',
  PAYMENT_FAILED = 'payment_failed',
  CHECKOUT_STARTED = 'checkout_started'
}

export interface SubscriptionPlan {
  subscription_plan_id: string;
  subscription_name: string;
  subscription_description: string;
  subscription_price: number;
  interval: string;
  features: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  subscription_limits: {
    messages_per_day: number | null;
    history_days: number | null;
    [key: string]: any;
  };
  stripe_price_id: string | null;
}

export interface Subscription {
  subscription_id: string;
  user_id: string;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  subscription_status: SubscriptionStatus;
  subscription_plan_id: string;
  subscription_price: number;
  current_period_start: string | null;
  current_period_end: string | null;
  canceled_at: string | null;
  ended_at: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionWithPlan extends Subscription {
  plan: SubscriptionPlan;
}

export interface SubscriptionEvent {
  subscription_event_id: string;
  subscription_id: string | null;
  user_id: string;
  stripe_subscription_id: string | null;
  subscription_event_type: SubscriptionEventType | string;
  subscription_previous_state: string | null;
  subscription_status: string | null;
  event_data: Record<string, any> | null;
  created_at: string;
}

export interface SubscriptionContextType {
  subscription: SubscriptionWithPlan | null;
  subscriptionEvents: SubscriptionEvent[];
  plans: SubscriptionPlan[];
  isLoading: boolean;
  error: Error | null;
  checkoutSession: {
    url: string | null;
    sessionId: string | null;
    isCreating: boolean;
    error: Error | null;
  };
  loadSubscription: () => Promise<void>;
  loadSubscriptionEvents: () => Promise<void>;
  loadPlans: () => Promise<void>;
  createCheckoutSession: (planId: string) => Promise<{ url: string } | null>;
  cancelSubscription: () => Promise<boolean>;
  resumeSubscription: () => Promise<boolean>;
  changePlan: (planId: string) => Promise<boolean>;
  isSubscriptionFeatureEnabled: (featureName: string) => boolean;
  getRemainingUsage: (usageType: string) => number | null;
}

export interface CheckoutSessionResponse {
  url: string;
  session_id: string;
}

export interface ManageSubscriptionResponse {
  message: string;
  effective_date?: string;
  status?: string;
  plan_id?: string;
  require_checkout?: boolean;
}