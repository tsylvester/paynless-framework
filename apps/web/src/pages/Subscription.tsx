// src/pages/Subscription.tsx
import { useEffect, useState, useMemo } from 'react';
import { useAuthStore, useWalletStore } from '@paynless/store';
import { Navigate } from 'react-router-dom';
import { logger } from '@paynless/utils';
import { AlertCircle, AlertTriangle } from 'lucide-react';
import { 
  useSubscriptionStore,
  selectUserSubscription,
  selectAvailablePlans,
  selectIsSubscriptionLoading,
  selectHasActiveSubscription,
  selectSubscriptionError,
  selectCurrentUserResolvedPlan,
} from '@paynless/store';
import { CurrentSubscriptionCard } from '../components/subscription/CurrentSubscriptionCard';
import { PlanCard } from '../components/subscription/PlanCard';
import type { UserSubscription, SubscriptionPlan, PurchaseRequest, PaymentInitiationResult } from '@paynless/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export function SubscriptionPage() {
  const { user, isLoading: authLoading } = useAuthStore();
  const [activeTab, setActiveTab] = useState('monthly');

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
  } = useSubscriptionStore(state => ({ 
    isTestMode: state.isTestMode,
    loadSubscriptionData: state.loadSubscriptionData,
    createBillingPortalSession: state.createBillingPortalSession,
    cancelSubscription: state.cancelSubscription,
  }));

  const {
    initiatePurchase,
    isLoadingPurchase,
    purchaseError,
  } = useWalletStore(state => ({
    initiatePurchase: state.initiatePurchase,
    isLoadingPurchase: state.isLoadingPurchase,
    purchaseError: state.purchaseError,
  }));
  
  useEffect(() => {
    if (user?.id) {
      logger.info('SubscriptionPage: User found, loading subscription data.');
      loadSubscriptionData(user.id);
    }
  }, [user?.id, loadSubscriptionData]);
  
  const handleSubscribe = async (priceId: string) => {
    if (!user || !user.id) {
      logger.warn('User not available for subscription.');
      return;
    }

    const plan = availablePlans.find(p => p.stripe_price_id === priceId);
    if (!plan || !plan.stripe_price_id || !plan.currency) {
      logger.error('Selected plan not found, or is missing price_id or currency', { priceId });
      return;
    }

    logger.info('Initiating purchase process', { userId: user.id, priceId, planName: plan.name });

    const purchaseRequest: PurchaseRequest = {
      userId: user.id,
      itemId: plan.stripe_price_id,
      quantity: 1,
      currency: plan.currency.toUpperCase(),
      paymentGatewayId: 'stripe',
      metadata: { planName: plan.name, planId: plan.id }
    };

    const result: PaymentInitiationResult | null = await initiatePurchase(purchaseRequest);

    if (result?.success && result.redirectUrl) {
      logger.info('Redirecting to Stripe Checkout via Wallet Store', { url: result.redirectUrl });
      window.location.href = result.redirectUrl;
    } else {
      logger.error('Failed to get checkout URL from wallet store action', { error: result?.error || purchaseError });
    }
  };
  
  const handleCancelSubscription = async () => {
    if (!user) return;
    const subscriptionId = userSubscription?.stripe_subscription_id;
    
    if (!subscriptionId) {
        logger.error('Cannot cancel/downgrade: Missing subscription ID.');
        return;
    }

    logger.info('Initiating cancel subscription', { userId: user.id, subscriptionId });
    await cancelSubscription(subscriptionId);
  };
  
  const handleManageSubscription = async () => {
    if (!user || !userSubscription) return;
    
    logger.info('Initiating billing portal session', { userId: user.id });
    const billingPortalUrl = await createBillingPortalSession();

    if (billingPortalUrl) {
      logger.info('Redirecting to Stripe Billing Portal', { url: billingPortalUrl });
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
  
  const formatInterval = (interval: string, count: number) => {
    if (count === 1) {
      return interval === 'month' ? 'monthly' : 'yearly';
    }
    return `every ${count} ${interval}s`;
  };
  
  const isLoading = authLoading || isSubStoreLoading || isLoadingPurchase;

  const { monthlyPlans, annualPlans, topUpPlans, freePlan } = useMemo(() => {
    const monthly = availablePlans.filter(p => p.name?.toLowerCase().includes('monthly'));
    const annual = availablePlans.filter(p => p.name?.toLowerCase().includes('annual'));
    const topUp = availablePlans.filter(p => p.name?.toLowerCase().includes('top up'));
    const free = availablePlans.find(p => p.name?.toLowerCase() === 'free');
    return { monthlyPlans: monthly, annualPlans: annual, topUpPlans: topUp, freePlan: free };
  }, [availablePlans]);

  if (isLoading && !userSubscription && !availablePlans.length) {
    return (
      <div>
        <div data-testid="loading-spinner-container" className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }
  
  if (!user && !authLoading) {
    return <Navigate to="/login" />;
  }
  
  const userIsOnPaidPlan = hasActiveSubscription;

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
              <span data-testid="subscription-error-message">{storeError?.message || 'An error occurred'}</span>
            </div>
          )}
          
          {isTestMode && (
            <div className="mt-6 mx-auto max-w-lg p-4 bg-yellow-50 border border-yellow-200 rounded-md flex items-center gap-3 text-yellow-700">
              <AlertTriangle size={20} />
              <div>
                <strong>Test Mode Active</strong>
                <p className="text-sm">Stripe is running in test mode. No real charges will be made.</p>
              </div>
            </div>
          )}
          
          {userSubscription && currentUserResolvedPlan && userSubscription.status !== 'free' && (
            <CurrentSubscriptionCard 
              userSubscription={{...userSubscription, plan: currentUserResolvedPlan } as UserSubscription & { plan: SubscriptionPlan }}
              isProcessing={isSubStoreLoading}
              handleManageSubscription={handleManageSubscription}
              handleCancelSubscription={handleCancelSubscription}
              formatAmount={formatAmount}
              formatInterval={formatInterval}
            />
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
                {monthlyPlans.map((plan) => (
                  <PlanCard 
                    key={plan.id} 
                    plan={plan}
                    isCurrentPlan={currentUserResolvedPlan?.id === plan.id}
                    userIsOnPaidPlan={!!userIsOnPaidPlan}
                    isProcessing={isSubStoreLoading || isLoadingPurchase}
                    handleSubscribe={handleSubscribe}
                    handleCancelSubscription={handleCancelSubscription}
                    formatAmount={formatAmount}
                    formatInterval={formatInterval}
                  />
                ))}
              </div>
            </TabsContent>
            <TabsContent value="annual">
              <div className="mt-8 sm:mt-12 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
                {annualPlans.map((plan) => (
                  <PlanCard 
                    key={plan.id} 
                    plan={plan}
                    isCurrentPlan={currentUserResolvedPlan?.id === plan.id}
                    userIsOnPaidPlan={!!userIsOnPaidPlan}
                    isProcessing={isSubStoreLoading || isLoadingPurchase}
                    handleSubscribe={handleSubscribe}
                    handleCancelSubscription={handleCancelSubscription}
                    formatAmount={formatAmount}
                    formatInterval={formatInterval}
                  />
                ))}
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
                    isProcessing={isSubStoreLoading || isLoadingPurchase}
                    handleSubscribe={handleSubscribe}
                    handleCancelSubscription={handleCancelSubscription}
                    formatAmount={formatAmount}
                    formatInterval={formatInterval}
                  />
                ))}
              </div>
            </TabsContent>
          </Tabs>
          
          <div className="mt-12 sm:mt-16 grid gap-8">
            {userIsOnPaidPlan && freePlan && currentUserResolvedPlan?.id !== freePlan.id && (
              <div className="max-w-md mx-auto">
                <PlanCard 
                  key={freePlan.id} 
                  plan={freePlan}
                  isCurrentPlan={false}
                  userIsOnPaidPlan={true}
                  isProcessing={isSubStoreLoading || isLoadingPurchase}
                  handleSubscribe={() => handleCancelSubscription()}
                  handleCancelSubscription={handleCancelSubscription}
                  formatAmount={formatAmount}
                  formatInterval={formatInterval}
                />
              </div>
            )}
          </div>
          
          <div className="mt-12 text-center">
            <h2 className="text-xl font-semibold text-textPrimary">Frequently Asked Questions</h2>
            <dl className="mt-8 max-w-3xl mx-auto text-left divide-y divide-border">
              <div className="py-6">
                <dt className="text-lg font-medium text-textPrimary">How do I cancel my subscription?</dt>
                <dd className="mt-2 text-base text-textSecondary">
                  You can cancel your subscription at any time from your account page. 
                  Your subscription will remain active until the end of your current billing period.
                </dd>
              </div>
              <div className="py-6">
                <dt className="text-lg font-medium text-textPrimary">What payment methods do you accept?</dt>
                <dd className="mt-2 text-base text-textSecondary">
                  We accept all major credit cards including Visa, MasterCard, American Express, and Discover.
                </dd>
              </div>
              <div className="py-6">
                <dt className="text-lg font-medium text-textPrimary">Can I upgrade or downgrade my plan?</dt>
                <dd className="mt-2 text-base text-textSecondary">
                  Yes, you can upgrade or downgrade your plan at any time. When upgrading, you'll be charged a prorated amount for the remainder of your current billing cycle.
                </dd>
              </div>
            </dl>
          </div>
          
          {purchaseError && (
            <div className="mt-6 mx-auto max-w-lg p-4 bg-red-50 border border-red-200 rounded-md flex items-center gap-3 text-red-700">
              <AlertCircle size={20} />
              <span data-testid="purchase-error-message">{purchaseError.message || 'An error occurred with the purchase.'}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}