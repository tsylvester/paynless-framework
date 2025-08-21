// apps/web/src/components/common/DynamicProgressBar.tsx
import React from 'react';
import { useDialecticStore } from '@paynless/store';
import { Progress } from '../ui/progress';

interface DynamicProgressBarProps {
  sessionId: string;
  className?: string;
}

export const DynamicProgressBar: React.FC<DynamicProgressBarProps> = ({ sessionId, className }) => {
  const progressData = useDialecticStore(state => state.sessionProgress[sessionId]);

  if (!progressData || !progressData.total_steps) {
    return null;
  }

  const { current_step, total_steps } = progressData;

  // Clamping logic for value calculation
  const rawValue = total_steps > 0 ? (current_step / total_steps) * 100 : 0;
  const value = Math.min(100, rawValue);

  // Default message logic
  let displayMessage = progressData.message;
  if (!displayMessage) {
    if (current_step === 0) {
      displayMessage = 'Initializing...';
    } else if (current_step >= total_steps) {
      displayMessage = 'Finalizing...';
    } else {
      displayMessage = `Processing... (${current_step}/${total_steps})`;
    }
  }

  return (
    <div className={`w-full flex flex-col gap-2 ${className}`}>
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{displayMessage}</p>
        <p className="text-sm font-semibold">{Math.round(value)}%</p>
      </div>
      <Progress value={value} className="w-full" />
    </div>
  );
}; 