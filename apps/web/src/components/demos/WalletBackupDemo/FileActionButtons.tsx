import React from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react'; // For loading indicator

interface FileActionButtonsProps {
  onImport: () => void;
  onExport: () => void;
  disabled?: boolean;
  isExportDisabled?: boolean;
  isLoading?: boolean;
}

export const FileActionButtons: React.FC<FileActionButtonsProps> = ({
  onImport,
  onExport,
  disabled = false,
  isExportDisabled = false,
  isLoading = false,
}) => {
  // Overall disabled state for any action
  const isAnyActionDisabled = disabled || isLoading;
  // Specific disabled state for the export action
  const isCurrentExportDisabled = isExportDisabled || isAnyActionDisabled;

  return (
    <div className="flex space-x-2">
      <Button
        onClick={onImport}
        disabled={isAnyActionDisabled}
        variant="outline"
      >
        {isLoading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : null}
        Import Mnemonic from File
      </Button>
      <Button
        onClick={onExport}
        disabled={isCurrentExportDisabled}
        variant="outline"
      >
        Export Mnemonic to File
      </Button>
    </div>
  );
}; 