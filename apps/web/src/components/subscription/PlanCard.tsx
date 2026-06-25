import { Check, Plus } from 'lucide-react';
import type { PlanCardProps } from './PlanCard.interface';

export function PlanCard({
  plan,
  isCurrentPlan,
  userIsOnPaidPlan,
  isProcessing,
  onSelect,
  onAdd,
  onDowngrade,
  isInCart,
  cartQuantity,
  formatAmount,
  formatInterval,
}: PlanCardProps) {
  const isFreePlan = plan.amount === 0;
  const isOtp = plan.plan_type === 'one_time_purchase';

  let subtitle = plan.name;
  let features: string[] = [];

  if (
    plan.description !== null &&
    typeof plan.description === 'object' &&
    !Array.isArray(plan.description)
  ) {
    if (
      'subtitle' in plan.description &&
      typeof plan.description['subtitle'] === 'string'
    ) {
      subtitle = plan.description['subtitle'];
    }
    if (
      'features' in plan.description &&
      Array.isArray(plan.description['features'])
    ) {
      features = plan.description['features'].filter(
        (feature): feature is string => typeof feature === 'string',
      );
    }
  } else if (typeof plan.description === 'string' && plan.description) {
    subtitle = plan.description;
  }

  const planAmount = plan.amount;
  if (planAmount == null) {
    throw new Error('Plan amount is missing');
  }
  const planCurrency = plan.currency;
  if (!planCurrency) {
    throw new Error('Plan currency is missing');
  }

  let cardBorderClassName = 'border-border divide-border';
  if (isCurrentPlan) {
    cardBorderClassName = 'border-primary ring-2 ring-primary';
  } else if (isInCart) {
    cardBorderClassName = 'border-green-500 ring-2 ring-green-500';
  }

  return (
    <div
      key={plan.id}
      data-testid={`plan-card-${plan.id}`}
      className={`flex flex-col h-full border rounded-lg shadow-sm divide-y bg-surface overflow-hidden ${cardBorderClassName}`}
    >
      <div className="p-6 flex-grow">
        <h2 className="text-xl font-medium text-textPrimary">{plan.name}</h2>
        <p className="mt-2 text-sm text-textSecondary">{subtitle}</p>
        <p className="mt-4">
          <span className="text-4xl font-extrabold text-textPrimary">
            {isFreePlan ? '$0' : formatAmount(planAmount, planCurrency)}
          </span>
          <span className="text-base font-medium text-textSecondary">
            {isFreePlan
              ? '/mo'
              : plan.interval != null && plan.interval_count != null
                ? `/${formatInterval(plan.interval, plan.interval_count).replace('ly', '')}`
                : ' one-time'}
          </span>
        </p>
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
              <p className="ml-3 text-sm text-textSecondary italic">
                No specific features listed.
              </p>
            </li>
          )}
        </ul>
      </div>
      <div className="px-6 py-4 bg-background">
        {isCurrentPlan ? (
          <button
            disabled
            className="w-full inline-flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-textSecondary/50 bg-surface cursor-not-allowed"
          >
            Current Plan
          </button>
        ) : isFreePlan ? (
          <button
            onClick={onDowngrade}
            disabled={isProcessing || !userIsOnPaidPlan}
            className={`w-full inline-flex justify-center py-2 px-4 border border-border rounded-md shadow-sm text-sm font-medium hover:bg-surface focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary ${
              isProcessing || !userIsOnPaidPlan
                ? 'text-textSecondary/50 opacity-75 cursor-not-allowed'
                : 'text-textPrimary'
            }`}
          >
            {isProcessing ? 'Processing...' : 'Downgrade to Free'}
          </button>
        ) : isOtp ? (
          !isInCart ? (
            <button
              onClick={() => onAdd(plan)}
              disabled={isProcessing}
              className={`w-full inline-flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary ${
                isProcessing ? 'opacity-75 cursor-not-allowed' : ''
              }`}
            >
              {isProcessing ? 'Processing...' : 'Add to Cart'}
            </button>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-textPrimary">
                In Cart ×{cartQuantity}
              </span>
              <button
                type="button"
                aria-label="+"
                onClick={() => onAdd(plan)}
                disabled={isProcessing}
                className={`inline-flex items-center justify-center p-2 border border-border rounded-md shadow-sm text-sm font-medium hover:bg-surface focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary ${
                  isProcessing
                    ? 'text-textSecondary/50 opacity-75 cursor-not-allowed'
                    : 'text-textPrimary'
                }`}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          )
        ) : !isInCart ? (
          <button
            onClick={() => onSelect(plan)}
            disabled={isProcessing}
            className={`w-full inline-flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary ${
              isProcessing ? 'opacity-75 cursor-not-allowed' : ''
            }`}
          >
            {isProcessing ? 'Processing...' : 'Select Plan'}
          </button>
        ) : (
          <button
            onClick={() => onSelect(plan)}
            disabled={isProcessing}
            className={`w-full inline-flex justify-center items-center gap-2 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-600/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 ${
              isProcessing ? 'opacity-75 cursor-not-allowed' : ''
            }`}
          >
            <Check className="h-4 w-4" />
            {isProcessing ? 'Processing...' : 'Selected'}
          </button>
        )}
      </div>
    </div>
  );
}
