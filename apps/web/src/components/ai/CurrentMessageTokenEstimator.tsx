import React from 'react';
import { useTokenEstimator } from '@/hooks/useTokenEstimator'; // Adjust path as needed

export interface CurrentMessageTokenEstimatorProps {
  textInput: string;
}

export const CurrentMessageTokenEstimator: React.FC<CurrentMessageTokenEstimatorProps> = ({ textInput }) => {
  const { estimatedTokens, isLoading } = useTokenEstimator(textInput);

  return (
    <div className="text-sm text-muted-foreground" data-testid="current-message-token-estimator">
      {isLoading ? (
        <span>Estimating...</span>
      ) : (
        <span>Est. tokens: {estimatedTokens}</span>
      )}
    </div>
  );
}; 