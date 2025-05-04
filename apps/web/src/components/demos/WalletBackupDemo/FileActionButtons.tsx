import React from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react'; // For loading indicator

interface FileActionButtonsProps {
  onImport: () => Promise<void>;
  onExport: () => Promise<void>;
  disabled: boolean;
  isExportDisabled: boolean; // Separate disabled state for export based on mnemonic presence
  isLoading: boolean; // Loading state for when an action is in progress
}

export const FileActionButtons: React.FC<FileActionButtonsProps> = ({
  onImport,
  onExport,
  disabled,
  isExportDisabled,
  isLoading,
}) => {
  return (
    <div className="flex space-x-2">
      <Button onClick={onImport} disabled={disabled || isLoading}>
        {isLoading && (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        )}
        Import Mnemonic from File
      </Button>
      <Button
        variant="outline"
        onClick={onExport}
        disabled={disabled || isExportDisabled || isLoading}
      >
         {isLoading && (
           <Loader2 className="mr-2 h-4 w-4 animate-spin" />
         )}
        Export Mnemonic to File
      </Button>
    </div>
  );
}; 