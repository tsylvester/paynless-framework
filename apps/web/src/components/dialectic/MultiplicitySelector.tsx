import React from 'react';
import { Button } from '@/components/ui/button';
import { MinusIcon, PlusIcon } from 'lucide-react';

interface MultiplicitySelectorProps {
  value: number;
  onChange: (newValue: number) => void;
  minValue?: number;
  maxValue?: number;
  disabled?: boolean;
}

export const MultiplicitySelector: React.FC<MultiplicitySelectorProps> = ({
  value,
  onChange,
  minValue = 0,
  maxValue,
  disabled = false,
}) => {
  const handleDecrement = () => {
    if (disabled) return;
    const newValue = Math.max(minValue, value - 1);
    onChange(newValue);
  };

  const handleIncrement = () => {
    if (disabled) return;
    const newValue = maxValue === undefined ? value + 1 : Math.min(maxValue, value + 1);
    onChange(newValue);
  };

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="icon-xs"
        className="h-6 w-6"
        onClick={handleDecrement}
        disabled={disabled || value <= minValue}
        aria-label="Decrement multiplicity"
      >
        <MinusIcon className="h-3 w-3" />
      </Button>
      <span className="text-sm font-medium w-4 text-center tabular-nums" aria-live="polite">
        {value}
      </span>
      <Button
        variant="outline"
        size="icon-xs"
        className="h-6 w-6"
        onClick={handleIncrement}
        disabled={disabled || (maxValue !== undefined && value >= maxValue)}
        aria-label="Increment multiplicity"
      >
        <PlusIcon className="h-3 w-3" />
      </Button>
    </div>
  );
}; 