import React from 'react';
import { Textarea } from '@/components/ui/textarea';

interface MnemonicInputAreaProps {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}

export const MnemonicInputArea: React.FC<MnemonicInputAreaProps> = ({
  value,
  onChange,
  disabled,
}) => {
  return (
    <Textarea
      aria-label="mnemonic phrase"
      placeholder="Enter or import your 12 or 24 word mnemonic phrase..."
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={3}
      disabled={disabled}
      className="resize-none" // Optional: prevent resizing
    />
  );
}; 