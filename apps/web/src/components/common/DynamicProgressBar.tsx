// apps/web/src/components/common/DynamicProgressBar.tsx
import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useDialecticStore, selectSortedStages, selectUnifiedProjectProgress } from '@paynless/store';
import { Progress } from '../ui/progress';

interface DynamicProgressBarProps {
  sessionId: string;
  className?: string;
}

export const DynamicProgressBar: React.FC<DynamicProgressBarProps> = ({ sessionId, className }) => {
  const progress = useDialecticStore(
    useShallow((state) => selectUnifiedProjectProgress(state, sessionId)),
  );
  const sortedStages = useDialecticStore(selectSortedStages);
  const stage = sortedStages.find(s => s.slug === progress.currentStageSlug)!;

  const value = Math.min(100, Math.max(0, progress.overallPercentage));
  const displayMessage = `Stage ${progress.completedStages}/${progress.totalStages}: ${stage.display_name}`;
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