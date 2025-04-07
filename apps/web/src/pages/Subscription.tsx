// src/pages/Subscription.tsx
import { useState } from 'react';
import { Layout } from '../components/layout/Layout';
import { useAuthStore } from '@paynless/store';
import { Navigate } from 'react-router-dom';
import { logger } from '@paynless/utils';
import { AlertCircle, AlertTriangle } from 'lucide-react';
import { useSubscriptionStore } from '@paynless/store';
import { CurrentSubscriptionCard } from '../components/subscription/CurrentSubscriptionCard';
import { PlanCard } from '../components/subscription/PlanCard';
import type { UserSubscription, SubscriptionPlan } from '@paynless/types';

// Define Props for the component
interface SubscriptionPageProps {
  // Add other props if needed, e.g., passed down from router
  onSubscribe: (priceId: string) => Promise<void>; // Function to handle checkout initiation
}

export function SubscriptionPage(props: SubscriptionPageProps) {
  const { user, isLoading: authLoading } = useAuthStore();
  const { 
    availablePlans, 
    userSubscription, 
    isSubscriptionLoading, 
    isTestMode, 
    createBillingPortalSession, 
    cancelSubscription,
    error: storeError
  } = useSubscriptionStore(state => ({ 
    availablePlans: state.availablePlans, 
    userSubscription: state.userSubscription, 
    isSubscriptionLoading: state.isSubscriptionLoading, 
    isTestMode: state.isTestMode,
    createBillingPortalSession: state.createBillingPortalSession,
    cancelSubscription: state.cancelSubscription,
    error: state.error
  }));
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  
  const { onSubscribe } = props; // Destructure the prop

  const handleSubscribe = async (priceId: string) => {
    if (!user) return;
    
    setIsProcessing(true);
    setActionError(null);
    
    try {
      // Call the platform-specific function passed via props
      await onSubscribe(priceId);
      // If onSubscribe throws, the error will be caught below.
      // Redirection or native payment sheet is handled by the onSubscribe implementation.

    } catch (err) {
      // Handle errors (e.g., from backend API call failing within onSubscribe)
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setActionError(errorMessage);
      logger.error('Error in subscription process', {
        error: errorMessage,
        userId: user.id,
        priceId,
      });
    } finally {
      setIsProcessing(false);
    }
  };
  
  const handleCancelSubscription = async () => {
    if (!user) return;
    const subscriptionId = userSubscription?.stripeSubscriptionId;
    
    if (!subscriptionId) {
        logger.error('Cannot cancel/downgrade: Missing subscription ID.');
        setActionError('Cannot process cancellation: Subscription ID is missing.');
        return;
    }

    setIsProcessing(true);
    setActionError(null);

    try {
      const success = await cancelSubscription(subscriptionId);
      if (!success) {
        setActionError('Failed to cancel subscription. Please try again or contact support.');
      }
      // No redirect needed, store refresh will update UI
    } catch (err) { 
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setActionError(errorMessage);
      logger.error('Error initiating subscription cancellation', {
        error: errorMessage,
        userId: user.id,
        subscriptionId,
      });
    } finally {
      setIsProcessing(false);
    }
  };
  
  const handleManageSubscription = async () => {
    if (!user || !userSubscription) return;
    
    setIsProcessing(true);
    setActionError(null);
    
    try {
      const billingPortalUrl = await createBillingPortalSession();
      
      if (billingPortalUrl) {
        window.location.href = billingPortalUrl;
      } else {
        setActionError('Failed to access billing portal. Please try again.');
      }
    } catch (err) { 
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setActionError(errorMessage);
      logger.error('Error initiating billing portal session', {
        error: errorMessage,
        userId: user.id,
      });
    } finally {
      setIsProcessing(false);
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
  
  if (authLoading || isSubscriptionLoading) {
    return (
      <Layout>
        <div data-testid="loading-spinner-container" className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
        </div>
      </Layout>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" />;
  }
  
  const userIsOnPaidPlan = userSubscription?.status === 'active' || userSubscription?.status === 'trialing';

  return (
    <Layout>
      <div className="py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center">
            <h1 className="text-3xl font-extrabold text-textPrimary sm:text-4xl">
              Subscription Plans
            </h1>
            <p className="mt-4 text-xl text-textSecondary">
              Choose the plan that's right for you
            </p>
          </div>
          
          {(storeError || actionError) && (
            <div className="mt-6 mx-auto max-w-lg p-4 bg-red-50 border border-red-200 rounded-md flex items-center gap-3 text-red-700">
              <AlertCircle size={20} />
              <span>{actionError || storeError?.message || 'An error occurred'}</span>
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
          
          {userSubscription && userSubscription.plan && userSubscription.status !== 'free' && (
            <CurrentSubscriptionCard 
              userSubscription={userSubscription as UserSubscription & { plan: SubscriptionPlan }}
              isProcessing={isProcessing}
              handleManageSubscription={handleManageSubscription}
              handleCancelSubscription={handleCancelSubscription}
              formatAmount={formatAmount}
              formatInterval={formatInterval}
            />
          )}
          
          <div className="mt-12 sm:mt-16 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {availablePlans.map((plan) => {
              const isCurrentPlan = userSubscription?.plan?.id === plan.id;
              
              return (
                 <PlanCard 
                  key={plan.id} 
                  plan={plan}
                  isCurrentPlan={isCurrentPlan}
                  userIsOnPaidPlan={!!userIsOnPaidPlan}
                  isProcessing={isProcessing}
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
    </Layout>
  );
}