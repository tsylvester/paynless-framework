// src/pages/Subscription.tsx
import { useEffect, useState, useMemo } from 'react';
import {
  useAuthStore,
  useSubscriptionStore,
  useCartStore,
  selectUserSubscription,
  selectAvailablePlans,
  selectIsSubscriptionLoading,
  selectHasActiveSubscription,
  selectSubscriptionError,
  selectCurrentUserResolvedPlan,
} from '@paynless/store';
import { Navigate, useSearchParams } from 'react-router-dom';
import { logger } from '@paynless/utils';
import { AlertCircle, AlertTriangle } from 'lucide-react';
import { CurrentSubscriptionCard } from '../components/subscription/CurrentSubscriptionCard';
import { PlanCard } from '../components/subscription/PlanCard';
import type { SubscriptionPlan } from '@paynless/types';
import { CartSummary } from '../components/subscription/CartSummary/CartSummary';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';

export function SubscriptionPage() {
  const { user, isLoading: authLoading, userTier } = useAuthStore((state) => ({
    user: state.user,
    isLoading: state.isLoading,
    userTier: state.userTier,
  }));
  const [activeTab, setActiveTab] = useState('monthly');
  const [searchParams, setSearchParams] = useSearchParams();

  const availablePlans = useSubscriptionStore(selectAvailablePlans);
  const userSubscription = useSubscriptionStore(selectUserSubscription);
  const isSubStoreLoading = useSubscriptionStore(selectIsSubscriptionLoading);
  const storeError = useSubscriptionStore(selectSubscriptionError);
  const hasActiveSubscription = useSubscriptionStore(selectHasActiveSubscription);
  const currentUserResolvedPlan = useSubscriptionStore(selectCurrentUserResolvedPlan);

  const {
    isTestMode,
    loadSubscriptionData,
    createBillingPortalSession,
    cancelSubscription,
  } = useSubscriptionStore((state) => ({
    isTestMode: state.isTestMode,
    loadSubscriptionData: state.loadSubscriptionData,
    createBillingPortalSession: state.createBillingPortalSession,
    cancelSubscription: state.cancelSubscription,
  }));

  const {
    cart,
    isCheckingOut,
    checkoutError,
    setSubscriptionItem,
    addOtpItem,
    removeOtpItem,
    clearCart,
    checkoutCart,
    prefillCart,
  } = useCartStore((state) => ({
    cart: state.cart,
    isCheckingOut: state.isCheckingOut,
    checkoutError: state.checkoutError,
    setSubscriptionItem: state.setSubscriptionItem,
    addOtpItem: state.addOtpItem,
    removeOtpItem: state.removeOtpItem,
    clearCart: state.clearCart,
    checkoutCart: state.checkoutCart,
    prefillCart: state.prefillCart,
  }));

  useEffect(() => {
    if (user?.id) {
      logger.info('SubscriptionPage: User found, loading subscription data.');
      loadSubscriptionData(user.id);
    }
  }, [user?.id, loadSubscriptionData]);

  useEffect(() => {
    const hasPlanParam = searchParams.has('plan');
    const hasOtpParam = searchParams.has('otp');
    if ((hasPlanParam || hasOtpParam) && availablePlans.length > 0) {
      const planParam = searchParams.get('plan');
      const subscriptionPlanId =
        planParam === null ? undefined : planParam;
      const otpPlanIds = searchParams.getAll('otp');
      prefillCart({ subscriptionPlanId, otpPlanIds });
      setSearchParams({}, { replace: true });
    }
  }, [
    searchParams,
    setSearchParams,
    prefillCart,
    availablePlans.length,
  ]);

  const handleCancelSubscription = async () => {
    if (!user) return;
    const subscriptionId = userSubscription?.stripe_subscription_id;

    if (!subscriptionId) {
      logger.error('Cannot cancel/downgrade: Missing subscription ID.');
      return;
    }

    logger.info('Initiating cancel subscription', {
      userId: user.id,
      subscriptionId,
    });
    await cancelSubscription(subscriptionId);
  };

  const handleManageSubscription = async () => {
    if (!user || !userSubscription) return;

    logger.info('Initiating billing portal session', { userId: user.id });
    const billingPortalUrl = await createBillingPortalSession();

    if (billingPortalUrl) {
      logger.info('Redirecting to Stripe Billing Portal', {
        url: billingPortalUrl,
      });
      window.location.href = billingPortalUrl;
    } else {
      logger.error('Failed to get billing portal URL from store action');
    }
  };

  const formatAmount = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(amount / 100);
  };

  const formatInterval = (
    interval: string | null | undefined,
    count: number | null | undefined,
  ) => {
    if (interval == null || count == null) {
      return 'one-time';
    }
    if (count === 1) {
      return interval === 'month' ? 'monthly' : 'yearly';
    }
    return `every ${count} ${interval}s`;
  };

  const isLoading = authLoading || isSubStoreLoading || isCheckingOut;

  const { monthlyPlans, annualPlans, topUpPlans, freePlan } = useMemo(() => {
    const monthly = availablePlans.filter((p) =>
      p.name?.toLowerCase().includes('monthly'),
    );
    const annual = availablePlans.filter((p) =>
      p.name?.toLowerCase().includes('annual'),
    );
    const topUp = availablePlans.filter(
      (p) =>
        p.plan_type === 'one_time_purchase' ||
        p.name?.toLowerCase().includes('top up'),
    );
    const free = availablePlans.find((p) => p.amount === 0);
    return {
      monthlyPlans: monthly,
      annualPlans: annual,
      topUpPlans: topUp,
      freePlan: free,
    };
  }, [availablePlans]);

  const isInCart = (plan: SubscriptionPlan): boolean => {
    if (plan.plan_type === 'one_time_purchase') {
      return cart.otpItems.some((item) => item.plan.id === plan.id);
    }
    if (cart.subscriptionItem === null) {
      return false;
    }
    return cart.subscriptionItem.plan.id === plan.id;
  };

  const getCartQuantity = (plan: SubscriptionPlan): number => {
    if (plan.plan_type === 'one_time_purchase') {
      const found = cart.otpItems.find((item) => item.plan.id === plan.id);
      if (found === undefined) {
        return 0;
      }
      return found.quantity;
    }
    if (cart.subscriptionItem === null) {
      return 0;
    }
    if (cart.subscriptionItem.plan.id === plan.id) {
      return 1;
    }
    return 0;
  };

  const handlePlanSelect = (plan: SubscriptionPlan): void => {
    setSubscriptionItem(plan);
  };

  const handleOtpAdd = (plan: SubscriptionPlan): void => {
    addOtpItem(plan, 1);
  };

  const cartHasItems =
    cart.subscriptionItem !== null || cart.otpItems.length > 0;
  void cartHasItems;

  const showPlanChangeWarning =
    hasActiveSubscription &&
    cart.subscriptionItem !== null &&
    currentUserResolvedPlan !== null &&
    cart.subscriptionItem.plan.id !== currentUserResolvedPlan.id;

  if (isLoading && !userSubscription && !availablePlans.length) {
    return (
      <div>
        <div
          data-testid="loading-spinner-container"
          className="flex justify-center items-center py-12"
        >
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  if (!user && !authLoading) {
    return <Navigate to="/login" />;
  }

  const userIsOnPaidPlan = hasActiveSubscription;

  const getTierBadge = (planTierLevel: number): string | null => {
    if (userTier == null) return null;
    if (planTierLevel === userTier.level) return 'Your Tier';
    if (planTierLevel > userTier.level) return 'Upgrade';
    return null;
  };

  const planCardIsProcessing = isSubStoreLoading || isCheckingOut;

  return (
    <div>
      <div className="py-8 px-4 pt-6 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center">
            <h1 className="text-3xl font-extrabold text-textPrimary sm:text-4xl">
              Subscription Plans
            </h1>
            <p className="mt-4 text-xl text-textSecondary">
              Choose the plan that's right for you
            </p>
          </div>

          {storeError && (
            <div className="mt-6 mx-auto max-w-lg p-4 bg-red-50 border border-red-200 rounded-md flex items-center gap-3 text-red-700">
              <AlertCircle size={20} />
              <span data-testid="subscription-error-message">
                {storeError?.message || 'An error occurred'}
              </span>
            </div>
          )}

          {isTestMode && (
            <div className="mt-6 mx-auto max-w-lg p-4 bg-yellow-50 border border-yellow-200 rounded-md flex items-center gap-3 text-yellow-700">
              <AlertTriangle size={20} />
              <div>
                <strong>Test Mode Active</strong>
                <p className="text-sm">
                  Stripe is running in test mode. No real charges will be made.
                </p>
              </div>
            </div>
          )}

          {userSubscription &&
            currentUserResolvedPlan &&
            userSubscription.status !== 'free' && (
              <CurrentSubscriptionCard
                subscription={userSubscription}
                plan={currentUserResolvedPlan}
                isProcessing={isSubStoreLoading}
                handleManageSubscription={handleManageSubscription}
                handleCancelSubscription={handleCancelSubscription}
                formatAmount={formatAmount}
                formatInterval={formatInterval}
              />
            )}

          {showPlanChangeWarning && currentUserResolvedPlan && (
            <div
              data-testid="plan-change-warning"
              className="mt-6 mx-auto max-w-lg p-4 bg-yellow-50 border border-yellow-200 rounded-md text-yellow-700"
            >
              Selecting a new plan will replace your current{' '}
              {currentUserResolvedPlan.name} subscription.
            </div>
          )}

          <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-12">
            <TabsList className="grid w-full grid-cols-3 max-w-md mx-auto bg-transparent p-0">
              <TabsTrigger
                value="monthly"
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:bg-transparent data-[state=inactive]:text-primary data-[state=inactive]:border data-[state=inactive]:border-primary"
              >
                Monthly
              </TabsTrigger>
              <TabsTrigger
                value="annual"
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:bg-transparent data-[state=inactive]:text-primary data-[state=inactive]:border data-[state=inactive]:border-primary"
              >
                Annual
              </TabsTrigger>
              <TabsTrigger
                value="top-up"
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:bg-transparent data-[state=inactive]:text-primary data-[state=inactive]:border data-[state=inactive]:border-primary"
              >
                Top-Up
              </TabsTrigger>
            </TabsList>
            <TabsContent value="monthly">
              <div className="mt-8 sm:mt-12 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
                {monthlyPlans.map((plan) => {
                  const badgeText = getTierBadge(plan.tier_level);
                  return (
                    <div key={plan.id} className="relative">
                      {badgeText !== null && (
                        <Badge
                          variant={
                            badgeText === 'Your Tier' ? 'outline' : 'default'
                          }
                          className="absolute top-2 right-2 z-10"
                        >
                          {badgeText}
                        </Badge>
                      )}
                      <PlanCard
                        plan={plan}
                        isCurrentPlan={currentUserResolvedPlan?.id === plan.id}
                        userIsOnPaidPlan={!!userIsOnPaidPlan}
                        isProcessing={planCardIsProcessing}
                        onSelect={handlePlanSelect}
                        onAdd={handleOtpAdd}
                        onDowngrade={handleCancelSubscription}
                        isInCart={isInCart(plan)}
                        cartQuantity={getCartQuantity(plan)}
                        formatAmount={formatAmount}
                        formatInterval={formatInterval}
                      />
                    </div>
                  );
                })}
              </div>
            </TabsContent>
            <TabsContent value="annual">
              <div className="mt-8 sm:mt-12 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
                {annualPlans.map((plan) => {
                  const badgeText = getTierBadge(plan.tier_level);
                  return (
                    <div key={plan.id} className="relative">
                      {badgeText !== null && (
                        <Badge
                          variant={
                            badgeText === 'Your Tier' ? 'outline' : 'default'
                          }
                          className="absolute top-2 right-2 z-10"
                        >
                          {badgeText}
                        </Badge>
                      )}
                      <PlanCard
                        plan={plan}
                        isCurrentPlan={currentUserResolvedPlan?.id === plan.id}
                        userIsOnPaidPlan={!!userIsOnPaidPlan}
                        isProcessing={planCardIsProcessing}
                        onSelect={handlePlanSelect}
                        onAdd={handleOtpAdd}
                        onDowngrade={handleCancelSubscription}
                        isInCart={isInCart(plan)}
                        cartQuantity={getCartQuantity(plan)}
                        formatAmount={formatAmount}
                        formatInterval={formatInterval}
                      />
                    </div>
                  );
                })}
              </div>
            </TabsContent>
            <TabsContent value="top-up">
              <div className="mt-8 sm:mt-12 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
                {topUpPlans.map((plan) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    isCurrentPlan={currentUserResolvedPlan?.id === plan.id}
                    userIsOnPaidPlan={!!userIsOnPaidPlan}
                    isProcessing={planCardIsProcessing}
                    onSelect={handlePlanSelect}
                    onAdd={handleOtpAdd}
                    onDowngrade={handleCancelSubscription}
                    isInCart={isInCart(plan)}
                    cartQuantity={getCartQuantity(plan)}
                    formatAmount={formatAmount}
                    formatInterval={formatInterval}
                  />
                ))}
              </div>
            </TabsContent>
          </Tabs>

          <div
            data-testid="cart-summary-panel"
            className="fixed top-20 right-4 z-40 w-full max-w-sm max-h-[calc(100vh-5rem)] overflow-y-auto"
          >
            <CartSummary
              cart={cart}
              isCheckingOut={isCheckingOut}
              checkoutError={checkoutError}
              onRemoveSubscription={() => setSubscriptionItem(null)}
              onRemoveOtp={(planId) => removeOtpItem(planId)}
              onClearCart={() => clearCart()}
              onCheckout={() => checkoutCart()}
              formatAmount={formatAmount}
            />
          </div>

          <div className="mt-12 sm:mt-16 grid gap-8">
            {userIsOnPaidPlan &&
              freePlan &&
              currentUserResolvedPlan?.id !== freePlan.id && (
                <div className="max-w-md mx-auto">
                  <PlanCard
                    key={freePlan.id}
                    plan={freePlan}
                    isCurrentPlan={false}
                    userIsOnPaidPlan={true}
                    isProcessing={planCardIsProcessing}
                    onSelect={handlePlanSelect}
                    onAdd={handleOtpAdd}
                    onDowngrade={handleCancelSubscription}
                    isInCart={isInCart(freePlan)}
                    cartQuantity={getCartQuantity(freePlan)}
                    formatAmount={formatAmount}
                    formatInterval={formatInterval}
                  />
                </div>
              )}
          </div>

          <div className="mt-12 text-center">
            <h2 className="text-xl font-semibold text-textPrimary">
              Frequently Asked Questions
            </h2>
            <dl className="mt-8 max-w-3xl mx-auto text-left divide-y divide-border">
              <div className="py-6">
                <dt className="text-lg font-medium text-textPrimary">
                  How do I cancel my subscription?
                </dt>
                <dd className="mt-2 text-base text-textSecondary">
                  You can cancel your subscription at any time from your account
                  page. Your subscription will remain active until the end of your
                  current billing period.
                </dd>
              </div>
              <div className="py-6">
                <dt className="text-lg font-medium text-textPrimary">
                  What payment methods do you accept?
                </dt>
                <dd className="mt-2 text-base text-textSecondary">
                  We accept any method of payment supported by Stripe.
                </dd>
              </div>
              <div className="py-6">
                <dt className="text-lg font-medium text-textPrimary">
                  Can I upgrade or downgrade my plan?
                </dt>
                <dd className="mt-2 text-base text-textSecondary">
                  Yes, you can upgrade or downgrade your plan at any time. When
                  upgrading, you'll be charged a prorated amount for the remainder
                  of your current billing cycle.
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
