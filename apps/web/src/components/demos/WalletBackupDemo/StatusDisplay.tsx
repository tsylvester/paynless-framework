import React from 'react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"
import { Info, CheckCircle, AlertCircle } from 'lucide-react';

export interface StatusDisplayProps {
  message: string | null;
  variant: 'info' | 'success' | 'error';
}

const statusConfig = {
  info: {
    Icon: Info,
    title: 'Information',
    alertVariant: 'default' as const, // Map to Shadcn Alert variant
  },
  success: {
    Icon: CheckCircle,
    title: 'Success',
    alertVariant: 'default' as const,
  },
  error: {
    Icon: AlertCircle,
    title: 'Error',
    alertVariant: 'destructive' as const,
  },
};

export const StatusDisplay: React.FC<StatusDisplayProps> = ({
  message,
  variant,
}) => {
  const { Icon, title, alertVariant } = statusConfig[variant];

  return (
    <Alert variant={alertVariant} data-testid="status-display">
      <Icon className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      {message && <AlertDescription>{message}</AlertDescription>}
    </Alert>
  );
}; 