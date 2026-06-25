import { Award, CreditCard } from 'lucide-react';
import type { CurrentSubscriptionCardProps } from './CurrentSubscriptionCard.interface';

export function CurrentSubscriptionCard({
  subscription,
  plan,
  isProcessing,
  handleManageSubscription,
  handleCancelSubscription,
  formatAmount,
  formatInterval,
}: CurrentSubscriptionCardProps) {
  const subscriptionAmount = plan.amount;
  if (!subscriptionAmount) {
    throw new Error('Subscription amount is missing');
  }

  const subscriptionCurrency = plan.currency;
  if (!subscriptionCurrency) {
    throw new Error('Subscription currency is missing');
  }

  return (
    <div className="mt-8 mx-auto max-w-2xl bg-primary/10 border border-primary/20 rounded-lg p-6">
      <div className="flex items-start gap-4">
        <div className="rounded-full bg-primary/20 p-3">
          <Award className="h-8 w-8 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-medium text-textPrimary">Current Subscription</h3>
          <p className="mt-1 text-textSecondary">
            You are currently subscribed to the{' '}
            <span className="font-semibold">{plan.name}</span> plan.
          </p>
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <span className="text-sm text-textSecondary">Price: </span>
              <span className="font-medium">
                {formatAmount(subscriptionAmount, subscriptionCurrency)}{' '}
                {formatInterval(plan.interval, plan.interval_count)}
              </span>
            </div>
            <div>
              <span className="text-sm text-textSecondary">Status: </span>
              <span
                data-testid="subscription-status"
                className={`font-medium capitalize ${
                  subscription.status === 'active'
                    ? 'text-green-600'
                    : 'text-yellow-600'
                }`}
              >
                {subscription.status}
              </span>
            </div>
            {subscription.current_period_end && (
              <div>
                <span className="text-sm text-textSecondary">Current period ends: </span>
                <span className="font-medium">
                  {new Date(subscription.current_period_end).toLocaleDateString()}
                </span>
              </div>
            )}
            {subscription.cancel_at_period_end && (
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
              {isProcessing ? 'Processing...' : 'Manage Billing / Payment'}
            </button>
            {subscription.status === 'active' &&
              !subscription.cancel_at_period_end && (
                <button
                  onClick={handleCancelSubscription}
                  disabled={isProcessing}
                  className={`inline-flex items-center px-4 py-2 border border-border rounded-md shadow-sm text-sm font-medium text-textPrimary hover:bg-surface focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary ${
                    isProcessing ? 'opacity-75 cursor-not-allowed' : ''
                  }`}
                >
                  {isProcessing ? 'Processing...' : 'Cancel Subscription'}
                </button>
              )}
          </div>
        </div>
      </div>
    </div>
  );
}
