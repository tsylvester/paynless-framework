import React, { useState, useEffect } from 'react';
import { usePlatform } from '@paynless/platform';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Info, AlertCircle, Trash2 } from 'lucide-react';
import * as bip39 from 'bip39';

import { TextInputArea } from '@/components/common/TextInputArea';
import { GenerateMnemonicButton } from './GenerateMnemonicButton';
import { FileActionButtons } from './FileActionButtons';
import { StatusDisplay } from './StatusDisplay';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import { DropZone } from '@/components/common/DropZone';
import { platformEventEmitter, FileDropPayload } from '@paynless/platform';
import { Button } from '@/components/ui/button';

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

  const STATUS_DROP_LOAD_ERROR = (msg: string) => `Drop Load Error: ${msg}`;

  const STATUS_IMPORT_SUCCESS = 'Mnemonic imported successfully!';
  const STATUS_IMPORT_CANCELLED = 'File selection cancelled.';
  const STATUS_IMPORT_ERROR = (msg: string) => `Import Error: ${msg}`;
  const STATUS_EXPORT_SUCCESS = 'Mnemonic exported successfully!';
  const STATUS_EXPORT_CANCELLED = 'File save cancelled.';
  const STATUS_EXPORT_ERROR = (msg: string) => `Export Error: ${msg}`;
  const STATUS_GENERATE_SUCCESS = 'Mnemonic generated successfully!';
  const STATUS_GENERATE_ERROR = (msg: string) => `Generation Error: ${msg}`;

  const STATUS_UNKNOWN_ERROR = 'An unknown error occurred.';

  const handleClear = () => {
    console.log('[WalletBackupDemo] Clearing state...');
    setMnemonic('');
    setStatusMessage(null);
    setStatusVariant('info');
    setIsActionLoading(false);
  };

  const importMnemonicFile = async (filePath: string) => {
    if (!fileSystem || !isFileSystemAvailable || isLoadingCapabilities || capabilityError) return;
    console.log(`[WalletBackupDemo] Importing mnemonic from: ${filePath}`);
    setIsActionLoading(true);
    setStatusMessage(null);
    try {
      const fileContent = await fileSystem.readFile(filePath);
      const importedMnemonic = new TextDecoder().decode(fileContent).trim();

      if (!importedMnemonic || importedMnemonic.split(/\s+/).length < 12) {
        throw new Error('Invalid mnemonic phrase format in file.');
      }

      setMnemonic(importedMnemonic);
      setStatusMessage(STATUS_IMPORT_SUCCESS);
      setStatusVariant('success');
    } catch (error) {
      console.error("Import Mnemonic Error:", error);
      const message = error instanceof Error ? STATUS_IMPORT_ERROR(error.message) : STATUS_UNKNOWN_ERROR;
      setStatusMessage(message);
      setStatusVariant('error');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleGenerate = () => {
    try {
      const newMnemonic = bip39.generateMnemonic();
      setMnemonic(newMnemonic);
      setStatusMessage(STATUS_GENERATE_SUCCESS);
      setStatusVariant('success');
    } catch (error) {
      console.error("Mnemonic Generation Error:", error);
      const message = error instanceof Error ? STATUS_GENERATE_ERROR(error.message) : STATUS_UNKNOWN_ERROR;
      setStatusMessage(message);
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
        setStatusMessage(STATUS_IMPORT_CANCELLED);
        setStatusVariant('info');
        setIsActionLoading(false);
        return;
      }
      
      await importMnemonicFile(selectedFilePath);
    } catch (error) {
      console.error("Pick File Error for Import:", error); 
      const message = error instanceof Error ? STATUS_IMPORT_ERROR(error.message) : STATUS_UNKNOWN_ERROR;
      setStatusMessage(message);
      setStatusVariant('error');
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
        setStatusMessage(STATUS_EXPORT_CANCELLED);
        setStatusVariant('info');
        return;
      }

      const fileData = new TextEncoder().encode(mnemonic);
      await fileSystem.writeFile(savePath, fileData);

      setStatusMessage(STATUS_EXPORT_SUCCESS);
      setStatusVariant('success');
    } catch (error) {
      console.error("Export Error:", error);
      const message = error instanceof Error ? STATUS_EXPORT_ERROR(error.message) : STATUS_UNKNOWN_ERROR;
      setStatusMessage(message);
      setStatusVariant('error');
    } finally {
      setIsActionLoading(false);
    }
  };

  useEffect(() => {
    if (!isFileSystemAvailable) return;

    const handleFileDrop = (payload: FileDropPayload) => {
      console.log('[WalletBackupDemo] Received file drop:', payload);
      const filePath = payload[0];
      if (filePath) {
        importMnemonicFile(filePath).catch(err => {
          console.error("Error during importMnemonicFile from drop:", err);
          setStatusMessage(STATUS_DROP_LOAD_ERROR(err instanceof Error ? err.message : 'Unknown error'));
          setStatusVariant('error');
        });
      }
    };

    console.log('[WalletBackupDemo] Subscribing to file-drop event.');
    platformEventEmitter.on('file-drop', handleFileDrop);

    return () => {
      console.log('[WalletBackupDemo] Unsubscribing from file-drop event.');
      platformEventEmitter.off('file-drop', handleFileDrop);
    };
  }, [isFileSystemAvailable]);

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
        {isFileSystemAvailable && (
          <DropZone className="mt-4" activeText="Drop mnemonic file here to import">
          </DropZone>
        )}
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
        <Button 
          variant="outline" 
          onClick={handleClear}
          disabled={isLoadingCapabilities || !!capabilityError}
          className="mt-2 md:mt-0 md:ml-auto"
          data-testid="clear-button"
        >
          <Trash2 className="mr-2 h-4 w-4" /> Clear
        </Button>        
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