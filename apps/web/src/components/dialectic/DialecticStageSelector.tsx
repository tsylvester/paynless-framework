import React, { useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDialecticStore } from '@paynless/store'; // Import the store
import { selectSelectedStageAssociation } from '@paynless/store'; 
import { DialecticStage } from '@paynless/types'; // Import the DialecticStage enum

// Helper function to capitalize string
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

interface DialecticStageSelectorProps {
  disabled?: boolean;
}

export const DialecticStageSelector: React.FC<DialecticStageSelectorProps> = ({
  disabled,
}) => {
  // Get current stage and setter action from the store
  const currentStage = useDialecticStore(selectSelectedStageAssociation) as DialecticStage | undefined | null; // Store can return null
  // It's safer to get actions directly from the store object to avoid re-renders if the action identity changes.
  // However, if setSelectedStageAssociation is a stable selector for the action, this is fine.
  // For this example, let's assume it's a direct action from the store hook result for setters.
  const setStage = useDialecticStore((state) => state.setSelectedStageAssociation);

  // Add this useEffect to set the default stage in the store if not already set
  useEffect(() => {
    if (currentStage === null || currentStage === undefined) {
      setStage(DialecticStage.THESIS);
    }
  }, [currentStage, setStage]); // Dependencies: run if currentStage or setStage changes

  // Default to THESIS if currentStage is null or undefined
  const stageToDisplay = currentStage || DialecticStage.THESIS;

  const handleStageChange = (newStageValue: string) => {
    // Convert string value from SelectItem back to DialecticStage enum key if needed,
    // or ensure SelectItem value is directly the enum value.
    // For simplicity, assuming onValueChange gives us the enum value directly if item values are set to enum values.
    setStage(newStageValue as DialecticStage);
    // The modal's specific logic (like setHasUserEditedDescription) will be handled by the modal
    // reacting to store changes if necessary.
  };

  return (
    <Select
      value={stageToDisplay} // Enum values are strings, e.g., "thesis"
      onValueChange={handleStageChange} // handleStageChange now expects DialecticStage
      disabled={disabled}
    >
      <SelectTrigger id="dialecticStage" aria-label="Dialectic Stage">
        <SelectValue placeholder="Select a stage...">
          {/* Capitalize the enum value for display */}
          {stageToDisplay ? `${capitalize(stageToDisplay)} Stage` : 'Select a stage...'}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className='bg-background/80 backdrop-blur-sm'>
        {/* Iterate over enum values */}
        {Object.values(DialecticStage).map(stage => (
          <SelectItem key={stage} value={stage} className="capitalize">
            {capitalize(stage)} Stage
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}; 