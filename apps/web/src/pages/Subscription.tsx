// src/pages/Subscription.tsx
import { useState } from 'react';
import { Layout } from '../components/layout/Layout';
import { useAuthStore } from '@paynless/store';
import { Navigate } from 'react-router-dom';
import { logger } from '@paynless/utils';
import { Check, AlertCircle, CreditCard, Award, AlertTriangle } from 'lucide-react';
import { useSubscriptionStore } from '@paynless/store';

// Define interface for structured description
interface PlanDescription {
  subtitle: string | null;
  features: string[];
}

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
    cancelSubscription 
  } = useSubscriptionStore(state => ({ 
    availablePlans: state.availablePlans, 
    userSubscription: state.userSubscription, 
    isSubscriptionLoading: state.isSubscriptionLoading, 
    isTestMode: state.isTestMode,
    createBillingPortalSession: state.createBillingPortalSession,
    cancelSubscription: state.cancelSubscription
  }));
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { onSubscribe } = props; // Destructure the prop

  const handleSubscribe = async (priceId: string) => {
    if (!user) return;
    
    setIsProcessing(true);
    setError(null);
    
    try {
      // Call the platform-specific function passed via props
      await onSubscribe(priceId);
      // If onSubscribe throws, the error will be caught below.
      // Redirection or native payment sheet is handled by the onSubscribe implementation.

    } catch (err) {
      // Handle errors (e.g., from backend API call failing within onSubscribe)
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMessage);
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
    if (!user || !userSubscription?.id) return;
    
    setIsProcessing(true);
    setError(null);
    const subscriptionId = userSubscription.id;

    try {
      const success = await cancelSubscription(subscriptionId);
      if (!success) {
        setError('Failed to cancel subscription. Please try again or contact support.');
      }
      // No redirect needed, store refresh will update UI
    } catch (err) { 
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMessage);
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
    setError(null);
    
    try {
      const billingPortalUrl = await createBillingPortalSession();
      
      if (billingPortalUrl) {
        window.location.href = billingPortalUrl;
      } else {
        setError('Failed to access billing portal. Please try again.');
      }
    } catch (err) { 
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMessage);
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
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
        </div>
      </Layout>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" />;
  }
  
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
          
          {error && (
            <div className="mt-6 mx-auto max-w-lg p-4 bg-red-50 border border-red-200 rounded-md flex items-center gap-3 text-red-700">
              <AlertCircle size={20} />
              <span>{error}</span>
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
          
          {userSubscription && userSubscription.status !== 'free' && userSubscription.plan && (
            <div className="mt-8 mx-auto max-w-2xl bg-primary/10 border border-primary/20 rounded-lg p-6">
              <div className="flex items-start gap-4">
                <div className="rounded-full bg-primary/20 p-3">
                  <Award className="h-8 w-8 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-medium text-textPrimary">Current Subscription</h3>
                  <p className="mt-1 text-textSecondary">
                    You are currently subscribed to the <span className="font-semibold">{userSubscription.plan.name}</span> plan.
                  </p>
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <span className="text-sm text-textSecondary">Price: </span>
                      <span className="font-medium">
                        {formatAmount(userSubscription.plan.amount, userSubscription.plan.currency)} 
                        {' '}{formatInterval(userSubscription.plan.interval, userSubscription.plan.intervalCount)}
                      </span>
                    </div>
                    <div>
                      <span className="text-sm text-textSecondary">Status: </span>
                      <span className={`font-medium capitalize ${
                        userSubscription.status === 'active' || userSubscription.status === 'trialing' 
                          ? 'text-green-600'
                          : 'text-yellow-600'
                      }`}>
                        {userSubscription.status}
                      </span>
                    </div>
                    {userSubscription.currentPeriodEnd && (
                      <div>
                        <span className="text-sm text-textSecondary">Current period ends: </span>
                        <span className="font-medium">
                          {new Date(userSubscription.currentPeriodEnd).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                    {userSubscription.cancelAtPeriodEnd && (
                      <div className="col-span-full mt-1">
                        <span className="text-sm text-yellow-600">
                          Your subscription will be canceled at the end of the current billing period.
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      onClick={handleManageSubscription}
                      disabled={isProcessing}
                      className={`inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary ${
                        isProcessing ? 'opacity-75 cursor-not-allowed' : ''
                      }`}
                    >
                      <CreditCard className="mr-2 h-4 w-4" />
                      Manage Billing / Payment
                    </button>
                    {userSubscription.status === 'active' && !userSubscription.cancelAtPeriodEnd && (
                       <button
                         onClick={handleCancelSubscription}
                         disabled={isProcessing}
                         className={`inline-flex items-center px-4 py-2 border border-border rounded-md shadow-sm text-sm font-medium text-textPrimary hover:bg-surface focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary ${
                           isProcessing ? 'opacity-75 cursor-not-allowed' : ''
                         }`}
                       >
                         Cancel Subscription
                       </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <div className="mt-12 sm:mt-16 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {/* Loop over ALL available plans fetched from the store */}
            {availablePlans.map((plan) => {
              const isCurrentPlan = userSubscription?.plan?.id === plan.id;
              const isFreePlan = plan.amount === 0;
              const userIsOnPaidPlan = userSubscription?.status === 'active' || userSubscription?.status === 'trialing';

              // Attempt to parse description - provide defaults if parsing fails or data is missing
              let subtitle = plan.name; // Default to plan name
              let features: string[] = [];

              // Check if description is an object and try to extract properties safely
              if (plan.description && typeof plan.description === 'object') {
                const desc = plan.description as Partial<PlanDescription>; // Use Partial for safe access
                subtitle = (typeof desc.subtitle === 'string' && desc.subtitle) ? desc.subtitle : plan.name;
                features = Array.isArray(desc.features) ? desc.features : [];
              } else if (typeof plan.description === 'string' && plan.description) {
                // Basic fallback if description is still somehow a string after migration
                subtitle = plan.description;
              }
              // Removed try-catch as type checks handle most cases

              return (
                <div 
                  key={plan.id} // Assuming plan.id is the unique DB identifier
                  className={`border rounded-lg shadow-sm divide-y bg-surface ${
                    isCurrentPlan ? 'border-primary ring-2 ring-primary' : 'border-border divide-border'
                  }`}
                >
                  <div className="p-6">
                    <h2 className="text-xl font-medium text-textPrimary">{plan.name}</h2>
                    {/* Display subtitle from JSON */}
                    <p className="mt-2 text-sm text-textSecondary">{subtitle}</p>
                    <p className="mt-4">
                      <span className="text-4xl font-extrabold text-textPrimary">
                        {/* Display $0 for free plan, otherwise format amount */}
                        {isFreePlan ? '$0' : formatAmount(plan.amount, plan.currency)}
                      </span>
                      <span className="text-base font-medium text-textSecondary">
                        {/* Display /mo for free plan, otherwise format interval */}
                        {isFreePlan ? '/mo' : `/${formatInterval(plan.interval, plan.intervalCount).replace('ly', '')}`}
                      </span>
                    </p>
                    {/* Display features from JSON */}
                    <ul className="mt-6 space-y-4">
                      {features.length > 0 ? (
                        features.map((feature, index) => (
                          <li key={index} className="flex items-start">
                            <div className="flex-shrink-0">
                              <Check className="h-5 w-5 text-green-500" />
                            </div>
                            <p className="ml-3 text-sm text-textSecondary">{feature}</p>
                          </li>
                        ))
                      ) : (
                        <li className="flex items-start">
                           <div className="flex-shrink-0">
                              <Check className="h-5 w-5 text-gray-400" />
                            </div>
                          <p className="ml-3 text-sm text-textSecondary italic">No specific features listed.</p>
                        </li>
                      )}
                    </ul>
                  </div>
                  <div className="px-6 py-4 bg-background">
                    {isCurrentPlan ? (
                      // Button for the CURRENT plan (Free or Paid)
                      <button
                        disabled
                        className="w-full inline-flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-textSecondary/50 bg-surface cursor-not-allowed"
                      >
                        Current Plan
                      </button>
                    ) : isFreePlan ? (
                      // Button for the Free plan card (only shown if NOT current)
                      <button
                        onClick={handleCancelSubscription} // Downgrade action
                        disabled={isProcessing || !userIsOnPaidPlan} // Can only downgrade if on a paid plan
                        className={`w-full inline-flex justify-center py-2 px-4 border border-border rounded-md shadow-sm text-sm font-medium hover:bg-surface focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary ${
                          (isProcessing || !userIsOnPaidPlan) ? 'text-textSecondary/50 opacity-75 cursor-not-allowed' : 'text-textPrimary'
                        }`}
                      >
                        {isProcessing ? 'Processing...' : 'Downgrade to Free'}
                      </button>
                    ) : (
                      // Button for Paid plan cards (only shown if NOT current)
                      <button
                        onClick={() => handleSubscribe(plan.stripePriceId || plan.id)} // Use stripePriceId or plan DB id
                        disabled={isProcessing}
                        className={`w-full inline-flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary ${
                          isProcessing ? 'opacity-75 cursor-not-allowed' : ''
                        }`}
                      >
                        {userIsOnPaidPlan ? 'Change Plan' : 'Subscribe'}
                      </button>
                    )}
                  </div>
                </div>
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