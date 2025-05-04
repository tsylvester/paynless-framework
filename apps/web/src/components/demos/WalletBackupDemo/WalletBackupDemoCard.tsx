import React, { useState } from 'react';
import { usePlatform } from '@paynless/platform';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Info, AlertCircle } from 'lucide-react';

import { MnemonicInputArea } from './MnemonicInputArea';
import { FileActionButtons } from './FileActionButtons';
import { StatusDisplay } from './StatusDisplay';
import ErrorBoundary from '@/components/common/ErrorBoundary';

interface WalletBackupDemoCardProps {}

export const WalletBackupDemoCard: React.FC<WalletBackupDemoCardProps> = () => {
  const { platformCapabilities, isLoadingCapabilities, capabilityError } = usePlatform();
  const [mnemonic, setMnemonic] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusVariant, setStatusVariant] = useState<'info' | 'success' | 'error'>('info');
  const [isActionLoading, setIsActionLoading] = useState<boolean>(false);

  const fileSystem = platformCapabilities?.fileSystem;
  const isFileSystemAvailable = fileSystem?.isAvailable === true;

  // Determine overall disabled state
  const isDisabled = isLoadingCapabilities || !isFileSystemAvailable || !!capabilityError || isActionLoading;
  const isExportDisabled = !mnemonic || isDisabled; // Export also requires mnemonic

  const handleImport = async () => {
    if (!fileSystem || !isFileSystemAvailable) return;

    setIsActionLoading(true);
    setStatusMessage(null);
    try {
      // Use array destructuring, handle potentially empty array
      const [selectedFilePath] = (await fileSystem.pickFile({
        multiple: false,
        // Add filter if desired, e.g., { name: 'Text Files', extensions: ['txt'] }
      })) ?? [];

      if (!selectedFilePath) {
        setStatusMessage('File selection cancelled.');
        setStatusVariant('info');
        return;
      }

      const fileContent = await fileSystem.readFile(selectedFilePath);
      const importedMnemonic = new TextDecoder().decode(fileContent);

      // Basic validation (could be enhanced)
      if (!importedMnemonic || importedMnemonic.trim().split(/\s+/).length < 12) {
        throw new Error('Invalid mnemonic phrase format in file.');
      }

      setMnemonic(importedMnemonic.trim());
      setStatusMessage('Mnemonic imported successfully!');
      setStatusVariant('success');
    } catch (error) {
      console.error("Import Error:", error);
      setStatusMessage(error instanceof Error ? error.message : 'An unknown error occurred during import.');
      setStatusVariant('error');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleExport = async () => {
    if (!fileSystem || !isFileSystemAvailable || !mnemonic) return;

    setIsActionLoading(true);
    setStatusMessage(null);
    try {
      const savePath = await fileSystem.pickSaveFile({
        // defaultPath: 'wallet-backup.txt' // Optional default path
      });

      if (!savePath) {
        setStatusMessage('File save cancelled.');
        setStatusVariant('info');
        return;
      }

      const fileData = new TextEncoder().encode(mnemonic);
      await fileSystem.writeFile(savePath, fileData);

      setStatusMessage('Mnemonic exported successfully!');
      setStatusVariant('success');
    } catch (error) {
      console.error("Export Error:", error);
      setStatusMessage(error instanceof Error ? error.message : 'An unknown error occurred during export.');
      setStatusVariant('error');
    } finally {
      setIsActionLoading(false);
    }
  };

  return (
    <ErrorBoundary fallbackMessage="An unexpected error occurred in the Wallet Backup component.">
      <div className="p-4 border rounded-lg space-y-4">
        <h2 className="text-lg font-semibold">Wallet Backup/Recovery Demo</h2>

        {/* === Capability Loading State === */}
        {isLoadingCapabilities && (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <div className="flex space-x-2">
              <Skeleton className="h-9 w-1/2" />
              <Skeleton className="h-9 w-1/2" />
            </div>
            <Skeleton className="h-8 w-3/4" />
          </div>
        )}

        {/* === Capability Error State === */} 
        {capabilityError && !isLoadingCapabilities && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error Loading Capabilities</AlertTitle>
            <AlertDescription>
              {capabilityError.message}
            </AlertDescription>
          </Alert>
           // No need to render other controls if capabilities failed to load
        )}

        {/* === Capabilities Loaded State === */} 
        {!isLoadingCapabilities && !capabilityError && (
          <>
            {/* --- Unavailable Message --- */}
            {!isFileSystemAvailable && (
               <Alert variant="warning">
                 <Info className="h-4 w-4" />
                 <AlertTitle>Desktop App Required</AlertTitle>
                 <AlertDescription>
                    File operations require the Desktop app.
                 </AlertDescription>
               </Alert>
            )}

             {/* --- Main Controls (Rendered even if unavailable, but disabled) --- */} 
            <MnemonicInputArea
              value={mnemonic}
              onChange={setMnemonic}
              disabled={isDisabled}
            />
            <FileActionButtons
              onImport={handleImport}
              onExport={handleExport}
              disabled={isDisabled} // Pass combined disabled state
              isExportDisabled={isExportDisabled} // Pass specific export disabled state
              isLoading={isActionLoading}
            />
            <StatusDisplay message={statusMessage} variant={statusVariant} />
          </>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default WalletBackupDemoCard; 