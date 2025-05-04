import React, { useState } from 'react';
import { usePlatform } from '@paynless/platform';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Info, AlertCircle } from 'lucide-react';
import * as bip39 from 'bip39';

import { TextInputArea } from '@/components/common/TextInputArea';
import { GenerateMnemonicButton } from './GenerateMnemonicButton';
import { FileActionButtons } from './FileActionButtons';
import { StatusDisplay } from './StatusDisplay';
import ErrorBoundary from '@/components/common/ErrorBoundary';

interface WalletBackupDemoCardProps {}

export const WalletBackupDemoCard: React.FC<WalletBackupDemoCardProps> = () => {
  const { capabilities, isLoadingCapabilities, capabilityError } = usePlatform();
  const [mnemonic, setMnemonic] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusVariant, setStatusVariant] = useState<'info' | 'success' | 'error'>('info');
  const [isActionLoading, setIsActionLoading] = useState<boolean>(false);

  const fileSystem = capabilities?.fileSystem;
  const isFileSystemAvailable = fileSystem?.isAvailable === true;

  const isDisabled = !isFileSystemAvailable || isActionLoading || isLoadingCapabilities || !!capabilityError;
  const isExportDisabled = !mnemonic || isDisabled;

  const handleGenerate = () => {
    try {
      const newMnemonic = bip39.generateMnemonic();
      setMnemonic(newMnemonic);
      setStatusMessage('Mnemonic generated successfully!');
      setStatusVariant('success');
    } catch (error) {
      console.error("Mnemonic Generation Error:", error);
      setStatusMessage(error instanceof Error ? error.message : 'An unknown error occurred during generation.');
      setStatusVariant('error');
    }
  };

  const handleImport = async () => {
    if (!fileSystem || !isFileSystemAvailable || isLoadingCapabilities || capabilityError) return;

    setIsActionLoading(true);
    setStatusMessage(null);
    try {
      const [selectedFilePath] = (await fileSystem.pickFile({
        multiple: false,
      })) ?? [];

      if (!selectedFilePath) {
        setStatusMessage('File selection cancelled.');
        setStatusVariant('info');
        return;
      }

      const fileContent = await fileSystem.readFile(selectedFilePath);
      const importedMnemonic = new TextDecoder().decode(fileContent);

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
    if (!fileSystem || !isFileSystemAvailable || !mnemonic || isLoadingCapabilities || capabilityError) return;

    setIsActionLoading(true);
    setStatusMessage(null);
    try {
      const savePath = await fileSystem.pickSaveFile({
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

  const renderContent = () => {
    if (isLoadingCapabilities) {
      return (
        <div className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <div className="flex space-x-2">
             <Skeleton className="h-10 w-32" />
          </div>
           <div className="flex flex-col md:flex-row md:space-x-2 space-y-2 md:space-y-0">
             <Skeleton className="h-10 w-48" />
             <Skeleton className="h-10 w-48" />
          </div>
          <Skeleton className="h-10 w-full" />
        </div>
      );
    }

    if (capabilityError) {
      return (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error Loading Capabilities</AlertTitle>
          <AlertDescription>
            {capabilityError.message || 'An unknown error occurred while detecting platform features.'}
          </AlertDescription>
        </Alert>
      );
    }

    if (!capabilities) {
         return (
             <Alert variant="default">
                 <Info className="h-4 w-4" />
                 <AlertTitle>Platform Unknown</AlertTitle>
                 <AlertDescription>
                    Could not determine platform capabilities.
                 </AlertDescription>
             </Alert>
         );
    }

    return (
      <>
        {!isFileSystemAvailable && (
           <Alert variant="default">
             <Info className="h-4 w-4" />
             <AlertTitle>File System Unavailable</AlertTitle>
             <AlertDescription>
                File operations require the Desktop app environment and may be unavailable.
             </AlertDescription>
           </Alert>
        )}

        <TextInputArea
          label="Mnemonic Phrase (12 or 24 words)"
          id="mnemonic-input-area"
          placeholder="Enter or generate your BIP-39 mnemonic phrase here..."
          value={mnemonic}
          onChange={setMnemonic}
          disabled={isDisabled}
          dataTestId="mnemonic-input"
        />
        <div className="flex flex-col md:flex-row md:space-x-2 space-y-2 md:space-y-0">
          <GenerateMnemonicButton 
            onGenerate={handleGenerate} 
            disabled={isDisabled} 
          />
          <FileActionButtons
            onImport={handleImport}
            onExport={handleExport}
            disabled={isDisabled}
            isExportDisabled={isExportDisabled}
            isLoading={isActionLoading}
          />
        </div>
        <StatusDisplay message={statusMessage} variant={statusVariant} />
      </>
    );
  };

  return (
    <ErrorBoundary fallbackMessage="An unexpected error occurred in the Wallet Backup component.">
      <div className="p-4 border rounded-lg space-y-4">
        <h2 className="text-lg font-semibold">Wallet Backup/Recovery Demo</h2>
        {renderContent()} 
      </div>
    </ErrorBoundary>
  );
};

export default WalletBackupDemoCard; 