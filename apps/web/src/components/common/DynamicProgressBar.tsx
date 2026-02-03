// apps/web/src/components/common/DynamicProgressBar.tsx
import React from 'react';
import { useDialecticStore, selectUnifiedProjectProgress } from '@paynless/store';
import { Progress } from '../ui/progress';

interface DynamicProgressBarProps {
  sessionId: string;
  className?: string;
}

export const DynamicProgressBar: React.FC<DynamicProgressBarProps> = ({ sessionId, className }) => {
  const progress = useDialecticStore(state => selectUnifiedProjectProgress(state, sessionId));

  const value = Math.min(100, Math.max(0, progress.overallPercentage));
  const stageLabel = progress.currentStageSlug;
  const displayMessage = `Stage ${progress.completedStages}/${progress.totalStages}: ${stageLabel}`;
  console.log(progress);
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