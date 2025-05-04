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
    <Button onClick={onGenerate} disabled={disabled} variant="primary">
      Generate Mnemonic
    </Button>
  );
}; 