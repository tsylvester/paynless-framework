import type { SubscriptionPlan, PlanDescription, UserSubscription } from '@paynless/types';
import { Check } from 'lucide-react';

interface PlanCardProps {
  plan: SubscriptionPlan;
  isCurrentPlan: boolean;
  userIsOnPaidPlan: boolean;
  isProcessing: boolean;
  handleSubscribe: (priceId: string) => void;
  handleCancelSubscription: () => void; // For downgrade button
  formatAmount: (amount: number, currency: string) => string;
  formatInterval: (interval: string, count: number) => string;
}

export function PlanCard({
  plan,
  isCurrentPlan,
  userIsOnPaidPlan,
  isProcessing,
  handleSubscribe,
  handleCancelSubscription,
  formatAmount,
  formatInterval
}: PlanCardProps) {

  const isFreePlan = plan.amount === 0;

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
            onClick={() => handleSubscribe(plan.stripe_price_id)} // Use correct stripe_price_id field
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
} 