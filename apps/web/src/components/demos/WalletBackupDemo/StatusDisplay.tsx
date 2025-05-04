import React from 'react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info, CheckCircle, AlertCircle } from 'lucide-react';

type StatusVariant = 'info' | 'success' | 'error';

interface StatusDisplayProps {
  message: string | null;
  variant: StatusVariant;
}

export const StatusDisplay: React.FC<StatusDisplayProps> = ({ message, variant }) => {
  if (!message) {
    return null; // Don't render anything if there's no message
  }

  const alertVariant = variant === 'error' ? 'destructive' : 'default';
  const Icon = variant === 'success' ? CheckCircle :
               variant === 'error' ? AlertCircle :
               Info; // Default to Info
  const title = variant === 'success' ? 'Success' :
                variant === 'error' ? 'Error' :
                'Info';
  const iconColor = variant === 'success' ? 'text-green-500' : '';

  return (
    <Alert variant={alertVariant}>
      <Icon className={`h-4 w-4 ${iconColor}`} />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}; 