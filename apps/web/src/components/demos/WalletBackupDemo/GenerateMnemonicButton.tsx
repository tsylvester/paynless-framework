import React from 'react';
import { Button } from '@/components/ui/button';

interface GenerateMnemonicButtonProps {
  onGenerate: () => void; // Simple callback, no args needed from button
  disabled: boolean;
  dataTestId?: string; // Add dataTestId prop
}

export const GenerateMnemonicButton: React.FC<GenerateMnemonicButtonProps> = ({
  onGenerate,
  disabled,
  dataTestId, // Destructure prop
}) => {
  return (
    <Button 
      onClick={onGenerate} 
      disabled={disabled} 
      variant="primary" 
      data-testid={dataTestId} // Apply prop
    >
      Generate Mnemonic
    </Button>
  );
}; 