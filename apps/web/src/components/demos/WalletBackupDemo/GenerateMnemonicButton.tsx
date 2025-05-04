import React from 'react';
import { Button } from '@/components/ui/button';

interface GenerateMnemonicButtonProps {
  onGenerate: () => void; // Simple callback, no args needed from button
  disabled: boolean;
}

export const GenerateMnemonicButton: React.FC<GenerateMnemonicButtonProps> = ({
  onGenerate,
  disabled,
}) => {
  return (
    <Button 
      variant="secondary" // Use a different variant to distinguish
      onClick={onGenerate}
      disabled={disabled}
    >
      Generate Mnemonic
    </Button>
  );
}; 