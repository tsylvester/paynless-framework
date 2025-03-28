import React, { useState, useEffect } from 'react';
import { useSubscription } from '../../hooks/useSubscription';
import { AlertCircle } from 'lucide-react';

interface UsageIndicatorProps {
  usageType: string;
  label: string;
}

const UsageIndicator: React.FC<UsageIndicatorProps> = ({ usageType, label }) => {
  const { subscription, getRemainingUsage } = useSubscription();
  const [remaining, setRemaining] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Fetch remaining usage on mount
  useEffect(() => {
    const fetchUsage = async () => {
      if (subscription) {
        setLoading(true);
        try {
          const remainingUsage = await getRemainingUsage(usageType);
          setRemaining(remainingUsage);
        } catch (error) {
          console.error('Error fetching usage:', error);
        } finally {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    };

    fetchUsage();
  }, [subscription, usageType, getRemainingUsage]);

  // Handle no subscription case
  if (!subscription) {
    return null;
  }

  // Handle unlimited usage
  if (remaining === null) {
    return null; // Don't show for unlimited plans
  }

  // Loading state
  if (loading) {
    return (
      <div className="text-sm text-gray-400 animate-pulse">
        Loading usage...
      </div>
    );
  }

  // Calculate percentage for visual indicator
  const limits = subscription.plan.subscription_limits || {};
  const limit = limits[usageType] || 0;
  const used = limit - remaining;
  const percentage = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  
  // Determine color based on remaining usage
  let colorClass = 'bg-green-500';
  if (percentage > 75) {
    colorClass = 'bg-red-500';
  } else if (percentage > 50) {
    colorClass = 'bg-amber-500';
  } else if (percentage > 25) {
    colorClass = 'bg-blue-500';
  }

  return (
    <div className="mt-1">
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs text-gray-500 flex items-center">
          {remaining <= 0 && (
            <AlertCircle className="h-3 w-3 text-red-500 mr-1" />
          )}
          <span>
            {remaining <= 0 
              ? `No ${label} remaining today` 
              : `${remaining} ${label} remaining today`}
          </span>
        </div>
        <div className="text-xs text-gray-400">
          {used}/{limit}
        </div>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-1.5">
        <div 
          className={`${colorClass} h-1.5 rounded-full`} 
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
    </div>
  );
};

export default UsageIndicator;