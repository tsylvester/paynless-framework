import React from 'react';
import { Button } from '@/components/ui/button';
import { MinusIcon, PlusIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

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

  const isSelected = value > 0;
  
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="icon-xs"
        className={cn(
          "h-6 w-6 transition-colors",
          isSelected && "border-primary/50 hover:border-primary"
        )}
        onClick={handleDecrement}
        disabled={disabled || value <= minValue}
        aria-label="Decrement multiplicity"
      >
        <MinusIcon className="h-3 w-3" />
      </Button>
      
      <div className={cn(
        "w-6 h-6 rounded-md flex items-center justify-center text-sm font-bold tabular-nums transition-colors",
        isSelected 
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground"
      )}>
        <span aria-live="polite">{value}</span>
      </div>
      
      <Button
        variant="outline"
        size="icon-xs"
        className={cn(
          "h-6 w-6 transition-colors",
          isSelected && "border-primary/50 hover:border-primary"
        )}
        onClick={handleIncrement}
        disabled={disabled || (maxValue !== undefined && value >= maxValue)}
        aria-label="Increment multiplicity"
      >
        <PlusIcon className="h-3 w-3" />
      </Button>
    </div>
  );
}; 