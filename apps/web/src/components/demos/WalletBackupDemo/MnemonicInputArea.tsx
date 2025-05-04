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
  // Handler to extract value from event and pass to prop function
  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(event.target.value);
  };

  return (
    <Textarea
      aria-label="mnemonic phrase"
      placeholder="Enter or import your 12 or 24 word mnemonic phrase..."
      value={value}
      onChange={handleChange} // Use the local handler
      rows={3}
      disabled={disabled}
      className="resize-none" // Optional: prevent resizing
    />
  );
}; 