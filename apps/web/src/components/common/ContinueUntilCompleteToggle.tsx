import React from 'react';
import { useAiStore } from '@paynless/store';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

export const ContinueUntilCompleteToggle: React.FC = () => {
  const continueUntilComplete = useAiStore(state => state.continueUntilComplete);
  const setContinueUntilComplete = useAiStore(state => state.setContinueUntilComplete);

  const handleToggle = (checked: boolean) => {
    setContinueUntilComplete(checked);
  };

  return (
    <div className="flex items-center space-x-2 p-2 border rounded-md">
      <Switch
        id="continue-until-complete"
        checked={continueUntilComplete}
        onCheckedChange={handleToggle}
        aria-label="Continue until complete"
        className="data-[state=unchecked]:bg-border ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      />
      <Label htmlFor="continue-until-complete" className="flex-grow pr-2">
        Continue until complete
      </Label>
    </div>
  );
}; 