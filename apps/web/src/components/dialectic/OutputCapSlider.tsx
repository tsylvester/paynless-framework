import React, { useCallback, useEffect, useState } from 'react';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { useAuthStore, useDialecticStore } from '@paynless/store';
import { logger } from '@paynless/utils';
import { cn } from '@/lib/utils';

interface TierDefinition {
  level: number;
  name: string;
  output_cap_tokens: number | null;
  max_models_per_project: number;
}

// Default tier definitions as fallback
const DEFAULT_TIERS: TierDefinition[] = [
  { level: 0, name: 'free', output_cap_tokens: 8192, max_models_per_project: 1 },
  { level: 10, name: 'basic', output_cap_tokens: 32768, max_models_per_project: 2 },
  { level: 20, name: 'premium', output_cap_tokens: 131072, max_models_per_project: 3 },
  { level: 30, name: 'ultra', output_cap_tokens: null, max_models_per_project: null },
];

interface OutputCapSliderProps {
  className?: string;
  onUpgradeClick?: (tierName: string, tierLevel: number) => void;
}

export function OutputCapSlider({ className, onUpgradeClick }: OutputCapSliderProps) {
  const profile = useAuthStore((state) => state.profile);
  const { maxOutputTokens, setMaxOutputTokens } = useDialecticStore((state) => ({
    maxOutputTokens: state.maxOutputTokens || 8192,
    setMaxOutputTokens: state.setMaxOutputTokens,
  }));

  const [tierDefinitions, setTierDefinitions] = useState<TierDefinition[]>(DEFAULT_TIERS);
  const [userTier, setUserTier] = useState<TierDefinition>(DEFAULT_TIERS[0]);
  const [sliderValue, setSliderValue] = useState(maxOutputTokens);
  const [showUpgradeCTA, setShowUpgradeCTA] = useState(false);
  const [upgradeTarget, setUpgradeTarget] = useState<TierDefinition | null>(null);

  // For now, use default tier definitions and determine user's tier
  // In production, these would come from the backend via profile or a separate API
  useEffect(() => {
    // TODO: Load actual tier definitions from backend when available
    // For MVP, we'll use the hardcoded defaults
    const userTierLevel = 10; // TODO: Get from user subscription/profile
    const currentTier = tierDefinitions.find(t => t.level === userTierLevel) || tierDefinitions[0];
    setUserTier(currentTier);
  }, [tierDefinitions]);

  // Get the maximum allowed value for the slider
  const getMaxSliderValue = useCallback(() => {
    if (userTier.output_cap_tokens === null) {
      // Ultra tier - use the highest defined token value or a sensible maximum
      const highestDefinedTier = tierDefinitions
        .filter(t => t.output_cap_tokens !== null)
        .reduce((max, tier) => 
          tier.output_cap_tokens! > max.output_cap_tokens! ? tier : max
        , tierDefinitions[0]);
      return highestDefinedTier.output_cap_tokens || 131072;
    }
    return userTier.output_cap_tokens;
  }, [userTier, tierDefinitions]);

  // Get the minimum value (Free tier)
  const getMinSliderValue = useCallback(() => {
    const freeTier = tierDefinitions.find(t => t.level === 0);
    return freeTier?.output_cap_tokens || 8192;
  }, [tierDefinitions]);

  // Handle slider value change
  const handleSliderChange = useCallback((value: number[]) => {
    const newValue = value[0];
    const maxAllowed = getMaxSliderValue();

    if (newValue <= maxAllowed) {
      setSliderValue(newValue);
      setShowUpgradeCTA(false);
      setUpgradeTarget(null);
    } else {
      // Snap back to max allowed
      setSliderValue(maxAllowed);
      
      // Find the tier needed for this value
      const requiredTier = tierDefinitions.find(t => 
        t.output_cap_tokens === null || t.output_cap_tokens >= newValue
      );
      
      if (requiredTier && requiredTier.level > userTier.level) {
        setUpgradeTarget(requiredTier);
        setShowUpgradeCTA(true);
        setTimeout(() => setShowUpgradeCTA(false), 3000); // Hide after 3 seconds
      }
    }
  }, [getMaxSliderValue, userTier, tierDefinitions]);

  // Handle committing the value to the store
  const handleSliderCommit = useCallback(() => {
    setMaxOutputTokens(sliderValue);
    logger.info('Output cap set to:', { maxOutputTokens: sliderValue });
  }, [sliderValue, setMaxOutputTokens]);

  // Handle tier marker click
  const handleTierMarkerClick = useCallback((tier: TierDefinition) => {
    const tierValue = tier.output_cap_tokens;
    
    if (tierValue === null) {
      // Ultra tier - set to max displayable value
      const maxDisplay = getMaxSliderValue();
      if (userTier.level >= tier.level) {
        setSliderValue(maxDisplay);
        handleSliderCommit();
      } else {
        // Trigger upgrade CTA for ultra
        setUpgradeTarget(tier);
        setShowUpgradeCTA(true);
        if (onUpgradeClick) {
          onUpgradeClick(tier.name, tier.level);
        }
      }
      return;
    }

    if (tierValue <= getMaxSliderValue()) {
      setSliderValue(tierValue);
      handleSliderCommit();
    } else {
      // Need upgrade
      setUpgradeTarget(tier);
      setShowUpgradeCTA(true);
      if (onUpgradeClick) {
        onUpgradeClick(tier.name, tier.level);
      }
    }
  }, [userTier, getMaxSliderValue, handleSliderCommit, onUpgradeClick]);

  // Format token count for display
  const formatTokenCount = (tokens: number) => {
    if (tokens >= 1000000) {
      return `${(tokens / 1000000).toFixed(1)}M`;
    } else if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(0)}k`;
    }
    return tokens.toString();
  };

  // Get tier name for current value
  const getTierForValue = (value: number) => {
    // Find the highest tier that the value fits within
    for (let i = tierDefinitions.length - 1; i >= 0; i--) {
      const tier = tierDefinitions[i];
      if (tier.output_cap_tokens === null || value <= tier.output_cap_tokens) {
        // Check if we have access to this tier
        if (tier.level <= userTier.level) {
          return tier;
        }
      }
    }
    return tierDefinitions[0]; // Default to free
  };

  const currentValueTier = getTierForValue(sliderValue);
  const minValue = getMinSliderValue();
  const maxValue = getMaxSliderValue();

  // Calculate the highest tier's max value for the slider range display
  const sliderRangeMax = tierDefinitions
    .filter(t => t.output_cap_tokens !== null)
    .reduce((max, tier) => Math.max(max, tier.output_cap_tokens!), maxValue);

  return (
    <TooltipProvider>
      <div className={cn('space-y-4', className)}>
        {/* Current value display */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <label className="text-sm font-medium">Max Output Tokens</label>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-semibold">
                {formatTokenCount(sliderValue)}
              </span>
              <span className="text-sm text-muted-foreground">
                tokens ({currentValueTier.name})
              </span>
            </div>
          </div>
          
          {/* Upgrade CTA */}
          {showUpgradeCTA && upgradeTarget && (
            <div className="animate-fade-in flex items-center gap-2 rounded-md bg-blue-50 px-3 py-1.5 text-sm">
              <span>Upgrade to {upgradeTarget.name} for {formatTokenCount(upgradeTarget.output_cap_tokens || 0)} output</span>
              {onUpgradeClick && (
                <Button
                  size="sm"
                  variant="link"
                  onClick={() => onUpgradeClick(upgradeTarget.name, upgradeTarget.level)}
                  className="h-auto p-0 font-semibold"
                >
                  Upgrade →
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Slider with markers */}
        <div className="relative pt-8">
          {/* Tier markers */}
          <div className="absolute inset-x-0 top-0 flex justify-between px-2">
            {tierDefinitions.map((tier) => {
              const tierValue = tier.output_cap_tokens || sliderRangeMax;
              const position = ((tierValue - minValue) / (sliderRangeMax - minValue)) * 100;
              const isAccessible = tier.level <= userTier.level;
              
              return (
                <Tooltip key={tier.level}>
                  <TooltipTrigger asChild>
                    <button
                      className={cn(
                        'absolute flex flex-col items-center text-xs transition-colors',
                        isAccessible 
                          ? 'cursor-pointer hover:text-primary' 
                          : 'cursor-not-allowed text-muted-foreground opacity-50',
                        tier.level === userTier.level && 'font-semibold text-primary'
                      )}
                      style={{ left: `${position}%`, transform: 'translateX(-50%)' }}
                      onClick={() => handleTierMarkerClick(tier)}
                    >
                      <span className="capitalize">{tier.name}</span>
                      <span className="mt-1">
                        {tier.output_cap_tokens === null 
                          ? '∞' 
                          : formatTokenCount(tier.output_cap_tokens)}
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="space-y-1">
                      <p className="font-semibold capitalize">{tier.name} Tier</p>
                      <p>
                        {tier.output_cap_tokens === null
                          ? 'Unlimited output'
                          : `Up to ${formatTokenCount(tier.output_cap_tokens)} tokens`}
                      </p>
                      {!isAccessible && (
                        <p className="text-xs text-yellow-600">Upgrade required</p>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>

          {/* Slider */}
          <Slider
            value={[sliderValue]}
            min={minValue}
            max={sliderRangeMax}
            step={1024}
            onValueChange={handleSliderChange}
            onValueCommit={handleSliderCommit}
            className="mt-10"
            disabled={false}
          />

          {/* Disabled range overlay for tiers beyond user's access */}
          {userTier.output_cap_tokens && userTier.output_cap_tokens < sliderRangeMax && (
            <div
              className="absolute top-10 h-1.5 bg-gray-200 opacity-50 pointer-events-none rounded-r-full"
              style={{
                left: `${((userTier.output_cap_tokens - minValue) / (sliderRangeMax - minValue)) * 100}%`,
                right: 0,
              }}
            />
          )}
        </div>

        {/* Helper text */}
        <p className="text-sm text-muted-foreground">
          {userTier.output_cap_tokens === null
            ? 'You have unlimited output capacity with Ultra tier'
            : `Your ${userTier.name} tier allows up to ${formatTokenCount(userTier.output_cap_tokens)} tokens`}
        </p>
      </div>
    </TooltipProvider>
  );
}