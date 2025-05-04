import React, { useState } from 'react';
import { usePlatform } from '@paynless/platform';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info, AlertCircle } from 'lucide-react';

import { MnemonicInputArea } from './MnemonicInputArea';
import { GenerateMnemonicButton } from './GenerateMnemonicButton';
import { FileActionButtons } from './FileActionButtons';
import { StatusDisplay } from './StatusDisplay';
import ErrorBoundary from '@/components/common/ErrorBoundary';

interface WalletBackupDemoCardProps {}

export const WalletBackupDemoCard: React.FC<WalletBackupDemoCardProps> = () => {
  const platformCapabilities = usePlatform();
  const [mnemonic, setMnemonic] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusVariant, setStatusVariant] = useState<'info' | 'success' | 'error'>('info');
  const [isActionLoading, setIsActionLoading] = useState<boolean>(false);

  const fileSystem = platformCapabilities?.fileSystem;
  const isFileSystemAvailable = fileSystem?.isAvailable === true;

  const isDisabled = !isFileSystemAvailable || isActionLoading;
  const isExportDisabled = !mnemonic || isDisabled;

  const handleGenerate = () => {
    console.log('Generate Mnemonic Clicked (Placeholder)');
    setStatusMessage('Generate button clicked (placeholder). Implement generation logic.');
    setStatusVariant('info');
  };

  const handleImport = async () => {
    if (!fileSystem || !isFileSystemAvailable) return;

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
    if (!fileSystem || !isFileSystemAvailable || !mnemonic) return;

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

  return (
    <ErrorBoundary fallbackMessage="An unexpected error occurred in the Wallet Backup component.">
      <div className="p-4 border rounded-lg space-y-4">
        <h2 className="text-lg font-semibold">Wallet Backup/Recovery Demo</h2>

        {!isFileSystemAvailable && (
           <Alert variant="default">
             <Info className="h-4 w-4" />
             <AlertTitle>File System Unavailable</AlertTitle>
             <AlertDescription>
                File operations require the Desktop app environment and may be unavailable.
             </AlertDescription>
           </Alert>
        )}

        <MnemonicInputArea
          value={mnemonic}
          onChange={setMnemonic}
          disabled={isDisabled}
        />
        <div className="flex space-x-2">
          <GenerateMnemonicButton 
            onGenerate={handleGenerate} 
            disabled={isDisabled} 
          />
        </div>
        <FileActionButtons
          onImport={handleImport}
          onExport={handleExport}
          disabled={isDisabled}
          isExportDisabled={isExportDisabled}
          isLoading={isActionLoading}
        />
        <StatusDisplay message={statusMessage} variant={statusVariant} />
      </div>
    </ErrorBoundary>
  );
};

export default WalletBackupDemoCard; 