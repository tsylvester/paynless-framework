import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { FileUp } from 'lucide-react';
import type { FileSystemCapabilities, CapabilityUnavailable } from '@paynless/types';

interface ImportMnemonicButtonProps {
  isDisabled: boolean;
  fileSystem: FileSystemCapabilities | CapabilityUnavailable | null | undefined;
  onSuccess: (message: string, importedMnemonic: string) => void; // Pass mnemonic up on success
  onError: (message: string) => void;
  // Optional: Callback specifically when the import starts/ends loading?
}

// Define status messages
const STATUS_IMPORT_SUCCESS = 'Mnemonic imported successfully!';
const STATUS_IMPORT_CANCELLED = 'File selection cancelled.';
const STATUS_IMPORT_ERROR = (msg: string) => `Import Error: ${msg}`;
const STATUS_UNKNOWN_ERROR = 'An unknown error occurred.';

export const ImportMnemonicButton: React.FC<ImportMnemonicButtonProps> = ({
  isDisabled,
  fileSystem,
  onSuccess,
  onError,
}) => {
  const [isImportLoading, setIsImportLoading] = useState<boolean>(false);

  const handleActualImport = async () => {
    if (!fileSystem || !fileSystem.isAvailable || isDisabled || isImportLoading) return;

    setIsImportLoading(true);
    try {
      const [selectedFilePath] = (await fileSystem.pickFile({
        multiple: false,
      })) ?? [];

      if (!selectedFilePath) {
        onError(STATUS_IMPORT_CANCELLED);
        setIsImportLoading(false); // Reset loading on cancellation
        return;
      }

      // --- File Reading and Backend Invoke ---
      const fileContent = await fileSystem.readFile(selectedFilePath);
      const importedMnemonic = new TextDecoder().decode(fileContent).trim();

      if (!importedMnemonic || importedMnemonic.split(/\s+/).length < 12) {
        throw new Error('Invalid mnemonic phrase format in file.');
      }

      await invoke('import_mnemonic', { mnemonic: importedMnemonic });

      // If invoke didn't throw, call onSuccess and pass the mnemonic up
      onSuccess(STATUS_IMPORT_SUCCESS, importedMnemonic);

    } catch (error) {
      console.error("Import Mnemonic Error:", error);
      const message = typeof error === 'string' 
        ? STATUS_IMPORT_ERROR(error) 
        : error instanceof Error 
          ? STATUS_IMPORT_ERROR(error.message) 
          : STATUS_UNKNOWN_ERROR;
      onError(message);
    } finally {
      setIsImportLoading(false);
    }
  };

  return (
    <Button
      onClick={handleActualImport}
      disabled={isDisabled || isImportLoading || !fileSystem || !fileSystem.isAvailable}
      data-testid="import-mnemonic-button"
    >
      <FileUp className="mr-2 h-4 w-4" />
      {isImportLoading ? 'Importing...' : 'Import Mnemonic from File'}
    </Button>
  );
};

export default ImportMnemonicButton; 