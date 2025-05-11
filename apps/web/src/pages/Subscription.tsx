// src/pages/Subscription.tsx
import { useEffect } from 'react';
import { useAuthStore } from '@paynless/store';
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
import type { UserSubscription, SubscriptionPlan } from '@paynless/types';

export function SubscriptionPage() {
  const { user, isLoading: authLoading } = useAuthStore();

  const availablePlans = useSubscriptionStore(selectAvailablePlans);
  const userSubscription = useSubscriptionStore(selectUserSubscription);
  const isSubscriptionLoading = useSubscriptionStore(selectIsSubscriptionLoading);
  const storeError = useSubscriptionStore(selectSubscriptionError);
  const hasActiveSubscription = useSubscriptionStore(selectHasActiveSubscription);
  const currentUserResolvedPlan = useSubscriptionStore(selectCurrentUserResolvedPlan);

  const { 
    isTestMode, 
    loadSubscriptionData,
    createCheckoutSession,
    createBillingPortalSession,
    cancelSubscription,
  } = useSubscriptionStore(state => ({ 
    isTestMode: state.isTestMode,
    loadSubscriptionData: state.loadSubscriptionData,
    createCheckoutSession: state.createCheckoutSession,
    createBillingPortalSession: state.createBillingPortalSession,
    cancelSubscription: state.cancelSubscription,
  }));
  
  useEffect(() => {
    if (user?.id) {
      logger.info('SubscriptionPage: User found, loading subscription data.');
      loadSubscriptionData(user.id);
    }
  }, [user?.id, loadSubscriptionData]);
  
  const handleSubscribe = async (priceId: string) => {
    if (!user) return;
    
    logger.info('Initiating checkout process', { userId: user.id, priceId });
    const checkoutUrl = await createCheckoutSession(priceId);

    if (checkoutUrl) {
      logger.info('Redirecting to Stripe Checkout', { url: checkoutUrl });
      window.location.href = checkoutUrl;
    } else {
      logger.error('Failed to get checkout URL from store action');
    }
  };
  
  const handleCancelSubscription = async () => {
    if (!user) return;
    const subscriptionId = userSubscription?.stripeSubscriptionId;
    
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
  
  const isLoading = authLoading || isSubscriptionLoading;

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
              isProcessing={isSubscriptionLoading}
              handleManageSubscription={handleManageSubscription}
              handleCancelSubscription={handleCancelSubscription}
              formatAmount={formatAmount}
              formatInterval={formatInterval}
            />
          )}
          
          <div className="mt-12 sm:mt-16 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {availablePlans.map((plan) => {
              const isCurrentPlan = currentUserResolvedPlan?.id === plan.id;
              
              return (
                 <PlanCard 
                  key={plan.id} 
                  plan={plan}
                  isCurrentPlan={isCurrentPlan}
                  userIsOnPaidPlan={!!userIsOnPaidPlan}
                  isProcessing={isSubscriptionLoading}
                  handleSubscribe={handleSubscribe}
                  handleCancelSubscription={handleCancelSubscription}
                  formatAmount={formatAmount}
                  formatInterval={formatInterval}
                />
              );
            })}
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
        </div>
      </div>
    </div>
  );
}