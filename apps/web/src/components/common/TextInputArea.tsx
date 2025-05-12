import React from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface TextInputAreaProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label: string;
  placeholder?: string;
  id?: string;
  rows?: number;
  dataTestId?: string;
}

/**
 * A reusable textarea input component with a label.
 * (Refactored from MnemonicInputArea)
 */
export const TextInputArea: React.FC<TextInputAreaProps> = ({
  value,
  onChange,
  disabled = false,
  label,
  placeholder,
  id = 'textInputArea',
  rows = 4,
  dataTestId
}) => {
  // Handler to extract value from event and pass to prop function
  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(event.target.value);
  };

  return (
    <div className="grid w-full gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        value={value}
        onChange={handleChange}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={label}
        rows={rows}
        data-testid={dataTestId}
      />
    </div>
  );
}; 