import React, { useState } from 'react';
import { usePlatform } from '@paynless/platform';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Info } from 'lucide-react';

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

  const isFileSystemAvailable = platformCapabilities?.fileSystem?.isAvailable === true;
  const isDisabled = isLoadingCapabilities || !isFileSystemAvailable || isActionLoading;

  const handleImport = async () => {
    console.log('Import action triggered');
    // Logic for Step 1.4 will go here
    // Example: setIsActionLoading(true); ... setIsActionLoading(false);
    // Example: setStatusMessage(...); setStatusVariant(...);

    // Dummy usage to satisfy linter for now
    setIsActionLoading(false);
    setStatusMessage(null);
    setStatusVariant('info');
  };

  const handleExport = async () => {
    console.log('Export action triggered');
    // Logic for Step 1.5 will go here
  };

  if (isLoadingCapabilities) {
    return (
      <div className="p-4 border rounded-lg space-y-4">
        <h2 className="text-lg font-semibold">Wallet Backup/Recovery Demo</h2>
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-20 w-full" />
        <div className="flex space-x-2">
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-9 w-36" />
        </div>
      </div>
    );
  }

  if (capabilityError) {
     return (
      <div className="p-4 border rounded-lg space-y-4">
        <h2 className="text-lg font-semibold">Wallet Backup/Recovery Demo</h2>
         <Alert variant="destructive">
           <Info className="h-4 w-4" />
           <AlertTitle>Error Loading Capabilities</AlertTitle>
           <AlertDescription>
             {capabilityError.message || 'An unknown error occurred while detecting platform capabilities.'}
           </AlertDescription>
         </Alert>
       </div>
     );
  }

  return (
    <ErrorBoundary fallbackMessage="An error occurred within the Wallet Backup Demo.">
      <div className="p-4 border rounded-lg space-y-4">
        <h2 className="text-lg font-semibold">Wallet Backup/Recovery Demo</h2>

        {!isFileSystemAvailable && (
          <Alert variant="default">
            <Info className="h-4 w-4" />
            <AlertTitle>File System Unavailable</AlertTitle>
            <AlertDescription>
              File operations require the Desktop app.
            </AlertDescription>
          </Alert>
        )}

        <MnemonicInputArea
          value={mnemonic}
          onChange={setMnemonic}
          disabled={isDisabled}
        />

        <FileActionButtons
          onImport={handleImport}
          onExport={handleExport}
          disabled={isDisabled}
          isExportDisabled={!mnemonic}
          isLoading={isActionLoading}
        />

        <StatusDisplay
          message={statusMessage}
          variant={statusVariant}
        />

      </div>
    </ErrorBoundary>
  );
};

export default WalletBackupDemoCard; 