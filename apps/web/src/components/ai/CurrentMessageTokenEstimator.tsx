import React from 'react';
import { useTokenEstimator } from '@/hooks/useTokenEstimator'; // Adjust path as needed

export interface CurrentMessageTokenEstimatorProps {
  textInput: string;
}

export const CurrentMessageTokenEstimator: React.FC<CurrentMessageTokenEstimatorProps> = ({ textInput }) => {
  const estimatedTokens = useTokenEstimator(textInput);

  // Placeholder for rendering logic - to be refined by tests
  if (typeof estimatedTokens !== 'number') {
    // Or some other loading/default state if the hook could return something else initially
    return null;
  }

  return (
    <div className="text-sm text-muted-foreground" data-testid="current-message-token-estimator">
      {/* Content to be driven by tests, e.g., `Est. tokens: ${estimatedTokens}` */}
      Est. tokens: {estimatedTokens}
    </div>
  );
}; 