import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useSubscription } from '../hooks/useSubscription';
import { CreditCard, Check, X, AlertTriangle, RefreshCw, Calendar, Clock, ExternalLink } from 'lucide-react';
import { SubscriptionEvent, SubscriptionPlan, SubscriptionStatus } from '../types/subscription.types';

const SubscriptionPage: React.FC = () => {
  const { user } = useAuth();
  const { 
    subscription, 
    subscriptionEvents, 
    plans, 
    isLoading, 
    error,
    loadSubscription,
    loadSubscriptionEvents,
    createCheckoutSession,
    cancelSubscription,
    resumeSubscription,
    checkoutSession
  } = useSubscription();
  
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const navigate = useNavigate();

  // Redirect to sign in if not authenticated
  useEffect(() => {
    if (!user && !isLoading) {
      navigate('/signin');
    }
  }, [user, isLoading, navigate]);

  // Format date for display
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date);
  };

  // Format price with currency
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(price);
  };

  // Handle subscription checkout
  const handleSubscribe = async (planId: string) => {
    setIsProcessing(true);
    setActionError(null);
    
    try {
      const checkoutResult = await createCheckoutSession(planId);
      if (checkoutResult?.url) {
        window.location.href = checkoutResult.url;
      } else {
        setActionError('Failed to create checkout session');
      }
    } catch (err) {
      setActionError((err as Error).message);
      console.error('Error creating checkout:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle subscription cancellation
  const handleCancel = async () => {
    setIsProcessing(true);
    setActionError(null);
    
    try {
      const success = await cancelSubscription();
      if (success) {
        setShowCancelConfirm(false);
        setActionSuccess('Your subscription has been canceled successfully. It will remain active until the end of the current billing period.');
      } else {
        setActionError('Failed to cancel subscription. Please try again.');
      }
    } catch (err) {
      setActionError((err as Error).message);
      console.error('Error canceling subscription:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle subscription resumption
  const handleResume = async () => {
    setIsProcessing(true);
    setActionError(null);
    
    try {
      const success = await resumeSubscription();
      if (success) {
        setActionSuccess('Your subscription has been resumed successfully.');
      } else {
        setActionError('Failed to resume subscription. Please try again.');
      }
    } catch (err) {
      setActionError((err as Error).message);
      console.error('Error resuming subscription:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Determine if user is on free plan
  const isFreePlan = subscription?.subscription_plan_id === 'free';
  
  // Check if subscription is scheduled to be canceled at period end
  const isCancelingAtPeriodEnd = subscription?.subscription_status === SubscriptionStatus.CANCELED_AT_PERIOD_END;

  // Get user's current plan
  const currentPlan = plans.find(p => p.subscription_plan_id === subscription?.subscription_plan_id);

  // Get simplified event description for history list
  const getEventDescription = (event: SubscriptionEvent): string => {
    switch (event.subscription_event_type) {
      case 'subscription_created':
        return 'Subscription started';
      case 'subscription_updated':
        return 'Subscription updated';
      case 'subscription_canceled':
        return 'Subscription canceled';
      case 'subscription_resumed':
        return 'Subscription resumed';
      case 'plan_changed':
        return `Changed to ${event.event_data?.current_plan_id || 'new'} plan`;
      case 'plan_upgraded':
        return `Upgraded to ${event.event_data?.current_plan_id || 'premium'} plan`;
      case 'plan_downgraded':
        return `Downgraded to ${event.event_data?.current_plan_id || 'free'} plan`;
      case 'invoice.payment_succeeded':
        return `Payment of ${formatPrice(event.event_data?.amount_paid || 0)} processed`;
      case 'invoice.payment_failed':
        return 'Payment failed';
      default:
        return event.subscription_event_type;
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center">
        <div className="animate-spin h-10 w-10 border-t-2 border-b-2 border-blue-600 rounded-full"></div>
      </div>
    );
  }

  // Error state
  if (error && !subscription) {
    return (
      <div className="min-h-[calc(100vh-8rem)] flex flex-col items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full text-center">
          <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Error Loading Subscription</h2>
          <p className="text-red-500 mb-4">{error.message}</p>
          <button
            onClick={() => {
              loadSubscription();
              loadSubscriptionEvents();
            }}
            className="inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-8rem)] py-10 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center">
            <CreditCard className="mr-3 h-8 w-8 text-blue-600" />
            Subscription Management
          </h1>
          <p className="mt-2 text-lg text-gray-600">
            Manage your subscription plan and billing information
          </p>
        </div>

        {/* Success/Error messages */}
        {actionSuccess && (
          <div className="mb-6 bg-green-50 border border-green-200 text-green-800 rounded-lg p-4 flex items-start">
            <Check className="h-5 w-5 text-green-600 mt-0.5 mr-2" />
            <div>
              <p className="font-medium">{actionSuccess}</p>
              <button
                onClick={() => setActionSuccess(null)}
                className="text-sm text-green-700 mt-1 underline"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {actionError && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-800 rounded-lg p-4 flex items-start">
            <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 mr-2" />
            <div>
              <p className="font-medium">{actionError}</p>
              <button
                onClick={() => setActionError(null)}
                className="text-sm text-red-700 mt-1 underline"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Current Subscription */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden mb-8">
          <div className="px-6 py-5 border-b border-gray-200 bg-gray-50">
            <h2 className="text-xl font-semibold text-gray-800">Current Subscription</h2>
          </div>
          
          <div className="p-6">
            {subscription ? (
              <div>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
                  <div className="mb-4 md:mb-0">
                    <h3 className="text-lg font-medium text-gray-900 mb-1 flex items-center">
                      {currentPlan?.subscription_name || 'Unknown Plan'}
                      {!isFreePlan && (
                        <span className="ml-2 px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
                          Premium
                        </span>
                      )}
                      {isCancelingAtPeriodEnd && (
                        <span className="ml-2 px-2 py-1 text-xs font-medium bg-amber-100 text-amber-800 rounded-full">
                          Cancels Soon
                        </span>
                      )}
                    </h3>
                    <p className="text-gray-600">{currentPlan?.subscription_description}</p>
                  </div>
                  
                  <div className="text-right">
                    <p className="text-2xl font-bold text-gray-900">
                      {formatPrice(subscription.subscription_price)}
                      <span className="text-sm font-normal text-gray-500 ml-1">
                        /{currentPlan?.interval || 'month'}
                      </span>
                    </p>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  {/* Subscription period */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center mb-2">
                      <Calendar className="h-5 w-5 text-gray-400 mr-2" />
                      <h4 className="text-sm font-medium text-gray-700">Subscription Period</h4>
                    </div>
                    <div className="ml-7">
                      {!isFreePlan ? (
                        <div>
                          <p className="text-gray-600">
                            <span className="font-medium">Started:</span> {formatDate(subscription.current_period_start)}
                          </p>
                          {subscription.current_period_end && (
                            <p className="text-gray-600 mt-1">
                              <span className="font-medium">
                                {isCancelingAtPeriodEnd ? 'Ends' : 'Renews'}:
                              </span> {formatDate(subscription.current_period_end)}
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-gray-600">Free plan - no billing period</p>
                      )}
                    </div>
                  </div>
                  
                  {/* Status */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center mb-2">
                      <Clock className="h-5 w-5 text-gray-400 mr-2" />
                      <h4 className="text-sm font-medium text-gray-700">Subscription Status</h4>
                    </div>
                    <div className="ml-7">
                      <p className="text-gray-600 capitalize">
                        <span className="font-medium">Status:</span> {subscription.subscription_status?.replace(/_/g, ' ')}
                      </p>
                      {isCancelingAtPeriodEnd && (
                        <p className="text-amber-600 mt-1 text-sm">
                          Your subscription will end on {formatDate(subscription.current_period_end)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Subscription features */}
                <div className="mb-6">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Plan Features</h4>
                  <ul className="space-y-2">
                    {currentPlan?.features.map((feature, index) => (
                      <li key={index} className="flex items-start">
                        <Check className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" />
                        <span className="text-gray-600">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                
                {/* Action buttons */}
                <div className="flex flex-wrap gap-3">
                  {isFreePlan ? (
                    // Free plan - show upgrade options
                    <>
                      <button
                        onClick={() => {
                          const premiumPlan = plans.find(p => p.subscription_plan_id !== 'free');
                          if (premiumPlan) {
                            handleSubscribe(premiumPlan.subscription_plan_id);
                          }
                        }}
                        disabled={isProcessing || checkoutSession.isCreating}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                      >
                        {isProcessing || checkoutSession.isCreating ? (
                          <>
                            <div className="animate-spin h-4 w-4 border-2 border-white border-opacity-20 border-t-white rounded-full mr-2"></div>
                            Processing...
                          </>
                        ) : (
                          <>
                            Upgrade to Premium
                          </>
                        )}
                      </button>
                    </>
                  ) : (
                    // Paid plan - show cancel/resume options
                    <>
                      {isCancelingAtPeriodEnd ? (
                        <button
                          onClick={handleResume}
                          disabled={isProcessing}
                          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                        >
                          {isProcessing ? (
                            <>
                              <div className="animate-spin h-4 w-4 border-2 border-white border-opacity-20 border-t-white rounded-full mr-2"></div>
                              Processing...
                            </>
                          ) : (
                            <>
                              Resume Subscription
                            </>
                          )}
                        </button>
                      ) : (
                        <button
                          onClick={() => setShowCancelConfirm(true)}
                          disabled={isProcessing}
                          className="px-4 py-2 border border-red-600 text-red-600 rounded-md hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Cancel Subscription
                        </button>
                      )}
                      
                      <a
                        href="https://billing.stripe.com/p/login/test_14k2aI7ts3hx7xScMM" 
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 flex items-center"
                      >
                        Manage Payment Methods
                        <ExternalLink className="h-4 w-4 ml-1" />
                      </a>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
                <p className="text-gray-700 mb-4">Subscription information could not be loaded.</p>
                <button
                  onClick={() => {
                    loadSubscription();
                    loadSubscriptionEvents();
                  }}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Reload
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Available Plans */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden mb-8">
          <div className="px-6 py-5 border-b border-gray-200 bg-gray-50">
            <h2 className="text-xl font-semibold text-gray-800">Available Plans</h2>
          </div>
          
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {plans.map((plan) => (
                <div
                  key={plan.subscription_plan_id}
                  className={`border rounded-lg overflow-hidden ${
                    subscription?.subscription_plan_id === plan.subscription_plan_id
                      ? 'border-blue-500 ring-2 ring-blue-200'
                      : 'border-gray-200'
                  }`}
                >
                  <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                    <div className="flex justify-between items-center">
                      <h3 className="text-lg font-medium text-gray-900">{plan.subscription_name}</h3>
                      {subscription?.subscription_plan_id === plan.subscription_plan_id && (
                        <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                          Current Plan
                        </span>
                      )}
                    </div>
                    <p className="text-2xl font-bold mt-1">
                      {formatPrice(plan.subscription_price)}
                      <span className="text-sm font-normal text-gray-500">/{plan.interval}</span>
                    </p>
                  </div>
                  
                  <div className="p-6">
                    <p className="text-gray-600 mb-4">{plan.subscription_description}</p>
                    
                    <ul className="mb-6 space-y-2">
                      {plan.features.map((feature, index) => (
                        <li key={index} className="flex items-start">
                          <Check className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" />
                          <span className="text-gray-600">{feature}</span>
                        </li>
                      ))}
                    </ul>
                    
                    {subscription?.subscription_plan_id !== plan.subscription_plan_id && (
                      <button
                        onClick={() => handleSubscribe(plan.subscription_plan_id)}
                        disabled={isProcessing || checkoutSession.isCreating}
                        className={`w-full py-2 px-4 rounded-md font-medium ${
                          plan.subscription_plan_id === 'free'
                            ? 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                        } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {isProcessing || checkoutSession.isCreating ? (
                          <div className="flex items-center justify-center">
                            <div className="animate-spin h-4 w-4 border-2 border-white border-opacity-20 border-t-white rounded-full mr-2"></div>
                            Processing...
                          </div>
                        ) : (
                          `Switch to ${plan.subscription_name}`
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Subscription History */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-200 bg-gray-50">
            <h2 className="text-xl font-semibold text-gray-800">Subscription History</h2>
          </div>
          
          <div className="p-6">
            {subscriptionEvents.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Event
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {subscriptionEvents.map((event) => (
                      <tr key={event.subscription_event_id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(event.created_at)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {getEventDescription(event)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">
                          {event.subscription_status?.replace(/_/g, ' ') || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-500">No subscription history available.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Cancel confirmation modal */}
      {showCancelConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex flex-col items-center text-center">
              <AlertTriangle className="text-amber-500 mb-3" size={32} />
              <h3 className="text-xl font-medium mb-2">Cancel Your Subscription?</h3>
              <p className="text-gray-600 mb-6">
                Your subscription will remain active until the end of the current billing period 
                ({formatDate(subscription?.current_period_end)}). After that, you'll be moved to the Free plan.
              </p>
              
              <div className="flex space-x-4">
                <button
                  onClick={() => setShowCancelConfirm(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
                  disabled={isProcessing}
                >
                  Keep Subscription
                </button>
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 flex items-center"
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <>
                      <div className="animate-spin h-4 w-4 border-2 border-white border-opacity-20 border-t-white rounded-full mr-2"></div>
                      Processing...
                    </>
                  ) : (
                    'Yes, Cancel'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SubscriptionPage;