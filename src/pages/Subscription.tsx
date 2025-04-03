// src/pages/Subscription.tsx
import { useState } from 'react';
import { Layout } from '../components/layout/Layout';
import { useAuth } from '../hooks/useAuth';
import { Navigate } from 'react-router-dom';
import { logger } from '../utils/logger';
import { Check, AlertCircle, CreditCard, Award, AlertTriangle } from 'lucide-react';
import { useSubscription } from '../context/subscription.context';

export function SubscriptionPage() {
  const { user, isLoading } = useAuth();
  const { 
    userSubscription, 
    availablePlans, 
    isSubscriptionLoading, 
    isTestMode,
    createCheckoutSession,
    createBillingPortalSession
  } = useSubscription();
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const handleSubscribe = async (priceId: string) => {
    if (!user) return;
    
    setIsProcessing(true);
    setError(null);
    
    try {
      // Get the current URL to use as cancel URL
      const currentUrl = window.location.href;
      const successUrl = `${window.location.origin}/subscription/success?session_id={CHECKOUT_SESSION_ID}`;
      
      // Create a checkout session
      const checkoutUrl = await createCheckoutSession(
        priceId,
        successUrl,
        currentUrl
      );
      
      if (checkoutUrl) {
        // Redirect to checkout
        window.location.href = checkoutUrl;
      } else {
        setError('Failed to create checkout session. Please try again.');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMessage);
      logger.error('Error creating checkout session', {
        error: errorMessage,
        userId: user.id,
        priceId,
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
      // Get the current URL to use as return URL
      const returnUrl = window.location.href;
      
      // Create a billing portal session
      const billingPortalUrl = await createBillingPortalSession(returnUrl);
      
      if (billingPortalUrl) {
        // Redirect to billing portal
        window.location.href = billingPortalUrl;
      } else {
        setError('Failed to access billing portal. Please try again.');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMessage);
      logger.error('Error accessing billing portal', {
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
  
  if (isLoading || isSubscriptionLoading) {
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
                  <div className="mt-4">
                    <button
                      onClick={handleManageSubscription}
                      disabled={isProcessing}
                      className={`inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary ${
                        isProcessing ? 'opacity-75 cursor-not-allowed' : ''
                      }`}
                    >
                      <CreditCard className="mr-2 h-4 w-4" />
                      Manage Subscription
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <div className="mt-12 sm:mt-16 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {/* Free Plan */}
            <div className="border border-border rounded-lg shadow-sm divide-y divide-border bg-surface">
              <div className="p-6">
                <h2 className="text-xl font-medium text-textPrimary">Free</h2>
                <p className="mt-2 text-sm text-textSecondary">Basic access to the platform</p>
                <p className="mt-4">
                  <span className="text-4xl font-extrabold text-textPrimary">$0</span>
                  <span className="text-base font-medium text-textSecondary">/mo</span>
                </p>
                <ul className="mt-6 space-y-4">
                  <li className="flex items-start">
                    <div className="flex-shrink-0">
                      <Check className="h-5 w-5 text-green-500" />
                    </div>
                    <p className="ml-3 text-sm text-textSecondary">Basic account features</p>
                  </li>
                  <li className="flex items-start">
                    <div className="flex-shrink-0">
                      <Check className="h-5 w-5 text-green-500" />
                    </div>
                    <p className="ml-3 text-sm text-textSecondary">Limited API access</p>
                  </li>
                </ul>
              </div>
              <div className="px-6 py-4 bg-background">
                {userSubscription?.status === 'free' ? (
                  <button
                    disabled
                    className="w-full inline-flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-textSecondary/50 bg-surface cursor-not-allowed"
                  >
                    Current Plan
                  </button>
                ) : (
                  <button
                    onClick={() => handleSubscribe('price_id_for_free')}
                    disabled={isProcessing}
                    className="w-full inline-flex justify-center py-2 px-4 border border-border text-textPrimary rounded-md shadow-sm text-sm font-medium hover:bg-surface focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                  >
                    Select Plan
                  </button>
                )}
              </div>
            </div>
            
            {/* Paid Plans */}
            {availablePlans.map((plan) => {
              const isActivePlan = userSubscription?.plan?.priceId === plan.priceId;
              return (
                <div 
                  key={plan.priceId} 
                  className={`border rounded-lg shadow-sm divide-y bg-surface ${
                    isActivePlan ? 'border-primary ring-2 ring-primary' : 'border-border divide-border'
                  }`}
                >
                  <div className="p-6">
                    <h2 className="text-xl font-medium text-textPrimary">{plan.name}</h2>
                    <p className="mt-2 text-sm text-textSecondary">{plan.description}</p>
                    <p className="mt-4">
                      <span className="text-4xl font-extrabold text-textPrimary">
                        {formatAmount(plan.amount, plan.currency)}
                      </span>
                      <span className="text-base font-medium text-textSecondary">
                        /{formatInterval(plan.interval, plan.intervalCount).replace('ly', '')}
                      </span>
                    </p>
                    <ul className="mt-6 space-y-4">
                      {plan.features?.map((feature, index) => (
                        <li key={index} className="flex items-start">
                          <div className="flex-shrink-0">
                            <Check className="h-5 w-5 text-green-500" />
                          </div>
                          <p className="ml-3 text-sm text-textSecondary">{feature}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="px-6 py-4 bg-background">
                    {isActivePlan ? (
                      <button
                        disabled
                        className="w-full inline-flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-textSecondary/50 bg-surface cursor-not-allowed"
                      >
                        Current Plan
                      </button>
                    ) : (
                      <button
                        onClick={() => handleSubscribe(plan.priceId)}
                        disabled={isProcessing}
                        className={`w-full inline-flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary ${
                          isProcessing ? 'opacity-75 cursor-not-allowed' : ''
                        }`}
                      >
                        {userSubscription && userSubscription.status !== 'free' ? 'Change Plan' : 'Subscribe'}
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