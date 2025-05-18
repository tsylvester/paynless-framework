import React from 'react';
import type { TokenUsage } from '@paynless/types';

export interface TokenUsageDisplayProps {
  tokenUsage: TokenUsage | null;
}

export const TokenUsageDisplay: React.FC<TokenUsageDisplayProps> = ({ tokenUsage }) => {
  if (!tokenUsage || typeof tokenUsage.prompt_tokens === 'undefined' || typeof tokenUsage.completion_tokens === 'undefined') {
    return null; // Don't render if no data or essential parts are missing
  }

  // Basic placeholder - actual formatting will be driven by tests
  return (
    <div className="text-xs text-muted-foreground" data-testid="token-usage-display">
      {`P:${tokenUsage.prompt_tokens} / C:${tokenUsage.completion_tokens}`}
    </div>
  );
}; 