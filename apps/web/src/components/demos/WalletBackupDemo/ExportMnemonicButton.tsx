import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ask } from '@tauri-apps/plugin-dialog';
import { Button } from '@/components/ui/button';
import { FileDown } from 'lucide-react';
import type { FileSystemCapabilities, CapabilityUnavailable } from '@paynless/types';

interface ExportMnemonicButtonProps {
  isDisabled: boolean;
  fileSystem: FileSystemCapabilities | CapabilityUnavailable | null | undefined;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

// Define potential status messages locally or import from parent constants
const STATUS_EXPORT_SUCCESS = 'Mnemonic exported successfully!';
const STATUS_EXPORT_CANCELLED_DIALOG = 'Export cancelled by user.';
const STATUS_EXPORT_CANCELLED_SAVE = 'File save cancelled.';
const STATUS_EXPORT_ERROR = (msg: string) => `Export Error: ${msg}`;
const STATUS_UNKNOWN_ERROR = 'An unknown error occurred.';

export const ExportMnemonicButton: React.FC<ExportMnemonicButtonProps> = ({
  isDisabled,
  fileSystem,
  onSuccess,
  onError,
}) => {
  const [isExportLoading, setIsExportLoading] = useState<boolean>(false);

  const handleActualExport = async () => {
    // Basic checks moved here
    if (!fileSystem || !fileSystem.isAvailable || isDisabled || isExportLoading) return;

    // --- Confirmation Dialog ---
    try {
      const confirmed = await ask('Exporting your mnemonic phrase is security-sensitive. Are you sure you want to proceed?', {
          title: 'Confirm Mnemonic Export',
          okLabel: 'Export',
          cancelLabel: 'Cancel',
        });

      if (!confirmed) {
          onError(STATUS_EXPORT_CANCELLED_DIALOG);
          return;
      }
    } catch (err) {
       // Handle potential errors from the 'ask' dialog itself (unlikely but good practice)
       console.error("Dialog Error:", err);
       onError(STATUS_EXPORT_ERROR(err instanceof Error ? err.message : 'Dialog failed'));
       return; // Stop if dialog fails
    }


    // --- Proceed with Export ---
    setIsExportLoading(true);
    try {
      const retrievedMnemonic = await invoke<string>('export_mnemonic');
      const savePath = await fileSystem.pickSaveFile({});

      if (!savePath) {
        onError(STATUS_EXPORT_CANCELLED_SAVE);
        setIsExportLoading(false); // Ensure loading state is reset
        return;
      }

      const fileData = new TextEncoder().encode(retrievedMnemonic);
      await fileSystem.writeFile(savePath, fileData);

      onSuccess(STATUS_EXPORT_SUCCESS);

    } catch (error) {
      console.error("Export Error:", error);
      const message = typeof error === 'string'
        ? STATUS_EXPORT_ERROR(error)
        : error instanceof Error
          ? STATUS_EXPORT_ERROR(error.message)
          : STATUS_UNKNOWN_ERROR;
      onError(message);
    } finally {
      setIsExportLoading(false);
    }
  };

  return (
    <Button
      onClick={handleActualExport}
      disabled={isDisabled || isExportLoading || !fileSystem || !fileSystem.isAvailable}
      data-testid="export-mnemonic-button"
    >
      <FileDown className="mr-2 h-4 w-4" />
      {isExportLoading ? 'Exporting...' : 'Export Mnemonic to File'}
    </Button>
  );
};

export default ExportMnemonicButton; 