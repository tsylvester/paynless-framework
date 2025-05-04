import React, { useState } from 'react';
import { usePlatform } from '@paynless/platform';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from '@/components/ui/button';
import { Skeleton } from "@/components/ui/skeleton";
import { Info, AlertCircle, Upload, Download, FolderOpen } from 'lucide-react';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import { StatusDisplay } from '../demos/WalletBackupDemo/StatusDisplay';
import { FileDataDisplay } from '../common/FileDataDisplay';
import { TextInputArea } from '../common/TextInputArea';

interface ConfigFileManagerProps {
  // Props TBD based on actual config needs
  configName?: string; 
}

/**
 * ConfigFileManager - A placeholder component demonstrating platform capability usage
 * for loading and saving configuration files.
 */
export const ConfigFileManager: React.FC<ConfigFileManagerProps> = ({ configName = 'app' }) => {
  const { capabilities, isLoadingCapabilities, capabilityError } = usePlatform();
  // Add state for config data, status messages, action loading etc. later
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isActionLoading, setIsActionLoading] = useState<boolean>(false);
  // Add status variant state
  const [statusVariant, setStatusVariant] = useState<'info' | 'success' | 'error'>('info');
  // Add state for the loaded file content
  const [loadedConfigContent, setLoadedConfigContent] = useState<string | null>(null);
  // Add state for the editable config content in the text area
  const [configInputContent, setConfigInputContent] = useState<string>('');
  // Add state for selected directory path
  const [selectedDirectoryPath, setSelectedDirectoryPath] = useState<string | null>(null);

  const fileSystem = capabilities?.fileSystem;
  const isFileSystemAvailable = fileSystem?.isAvailable === true;
  const isDisabled = !isFileSystemAvailable || isActionLoading;

  // Constants for status messages
  const STATUS_PICKING_FILE = 'Picking file...';
  const STATUS_READING_FILE = (path: string) => `Reading file: ${path}...`;
  const STATUS_LOAD_SUCCESS = 'File loaded successfully! (Content not processed yet)';
  const STATUS_LOAD_CANCELLED = 'File selection cancelled.';
  const STATUS_LOAD_ERROR = (msg: string) => `Load Error: ${msg}`;
  const STATUS_PICKING_SAVE = 'Picking save location...';
  const STATUS_SAVING_FILE = (path: string) => `Saving config to ${path}...`;
  const STATUS_SAVE_SUCCESS = 'Config saved successfully!';
  const STATUS_SAVE_CANCELLED = 'File save cancelled.';
  const STATUS_SAVE_ERROR = (msg: string) => `Save Error: ${msg}`;
  const STATUS_UNKNOWN_ERROR = 'An unknown error occurred.';
  const STATUS_DIR_SELECT_SUCCESS = (path: string) => `Selected directory: ${path}`;
  const STATUS_DIR_SELECT_CANCELLED = 'Directory selection cancelled.';
  const STATUS_DIR_SELECT_ERROR = (msg: string) => `Directory Select Error: ${msg}`;

  const handleLoadConfig = async () => {
    if (!fileSystem || !isFileSystemAvailable || isActionLoading) return;

    setIsActionLoading(true);
    setStatusMessage(STATUS_PICKING_FILE);
    setStatusVariant('info');
    try {
      const selectedPaths = await fileSystem.pickFile({
        multiple: false,
      });

      const selectedFilePath = selectedPaths?.[0];
      if (!selectedFilePath) {
        setStatusMessage(STATUS_LOAD_CANCELLED);
        setStatusVariant('info');
        setIsActionLoading(false);
        return;
      }

      setStatusMessage(STATUS_READING_FILE(selectedFilePath));
      setStatusVariant('info');
      const fileContent = await fileSystem.readFile(selectedFilePath);

      setStatusMessage(STATUS_LOAD_SUCCESS);
      setStatusVariant('success');
      // Decode content and update state
      try {
        const decodedContent = new TextDecoder().decode(fileContent);
        setLoadedConfigContent(decodedContent);
        setConfigInputContent(decodedContent);
        // Optional: Attempt to parse as JSON for logging/validation?
        // const jsonData = JSON.parse(decodedContent);
        // console.log("Parsed JSON data:", jsonData);
      } catch (decodeError) {
         console.error("Decoding/Parsing Error:", decodeError);
         setStatusMessage('File loaded, but failed to decode or parse content.');
         setStatusVariant('error');
         setLoadedConfigContent(null); // Clear content on decode error
      }

    } catch (error) {
      console.error("Load Config Error:", error);
      const message = error instanceof Error ? STATUS_LOAD_ERROR(error.message) : STATUS_UNKNOWN_ERROR;
      setStatusMessage(message);
      setStatusVariant('error');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleSaveConfig = async () => {
     if (!fileSystem || !isFileSystemAvailable || isActionLoading) return;

    // Check if there's content to save
    if (!configInputContent) {
      setStatusMessage(STATUS_SAVE_ERROR('No content to save. Load or enter configuration data.'));
      setStatusVariant('error');
      return;
    }

    setIsActionLoading(true);
    setStatusMessage(STATUS_PICKING_SAVE);
    setStatusVariant('info');
    try {
        const savePath = await fileSystem.pickSaveFile({
            // Add options like defaultPath or accept later if needed
            // defaultPath: `${configName}.json`
        });

        if (!savePath) {
            setStatusMessage(STATUS_SAVE_CANCELLED);
            setStatusVariant('info');
            setIsActionLoading(false);
            return;
        }

        setStatusMessage(STATUS_SAVING_FILE(savePath));
        setStatusVariant('info');

        // Get actual config data from the state controlled by TextInputArea
        const dataToSave = new TextEncoder().encode(configInputContent);

        await fileSystem.writeFile(savePath, dataToSave);

        setStatusMessage(STATUS_SAVE_SUCCESS);
        setStatusVariant('success');

    } catch (error) {
        console.error("Save Config Error:", error);
        const message = error instanceof Error ? STATUS_SAVE_ERROR(error.message) : STATUS_UNKNOWN_ERROR;
        setStatusMessage(message);
        setStatusVariant('error');
    } finally {
        setIsActionLoading(false);
    }
  };

  const handleSelectDirectory = async () => {
    if (!fileSystem || !isFileSystemAvailable || isActionLoading) return;

    setIsActionLoading(true);
    setStatusMessage('Selecting directory...');
    setStatusVariant('info');
    setSelectedDirectoryPath(null); // Clear previous selection
    try {
      const selectedPaths = await fileSystem.pickDirectory({}); // Add options if needed

      const selectedDirPath = selectedPaths?.[0]; // Assuming single selection for now
      if (!selectedDirPath) {
        setStatusMessage(STATUS_DIR_SELECT_CANCELLED);
        setStatusVariant('info');
        return;
      }

      setSelectedDirectoryPath(selectedDirPath);
      setStatusMessage(STATUS_DIR_SELECT_SUCCESS(selectedDirPath));
      setStatusVariant('info'); // Use info for selection confirmation

    } catch (error) {
      console.error("Select Directory Error:", error);
      const message = error instanceof Error ? STATUS_DIR_SELECT_ERROR(error.message) : STATUS_UNKNOWN_ERROR;
      setStatusMessage(message);
      setStatusVariant('error');
    } finally {
      setIsActionLoading(false);
    }
  };

  const renderContent = () => {
    if (isLoadingCapabilities) {
      return (
        <div className="space-y-2">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-32" />
        </div>
      );
    }

    if (capabilityError) {
      return (
        <Alert variant="destructive" className="mt-2">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Capability Error</AlertTitle>
          <AlertDescription>
            {capabilityError.message || 'Failed to check file system capabilities.'}
          </AlertDescription>
        </Alert>
      );
    }
    
    if (!isFileSystemAvailable) {
         return (
           <Alert variant="default" className="mt-2">
             <Info className="h-4 w-4" />
             <AlertTitle>Desktop Only</AlertTitle>
             <AlertDescription>
                Loading/Saving config files requires the Desktop app.
             </AlertDescription>
           </Alert>
         );
    }

    // TODO: Add real inputs/displays for config data later

    return (
      <>
        <div className="flex space-x-2 mt-2">
          <Button onClick={handleLoadConfig} disabled={isDisabled}>
            <Upload className="mr-2 h-4 w-4" /> Load Config
          </Button>
          <Button onClick={handleSaveConfig} disabled={isDisabled}>
            <Download className="mr-2 h-4 w-4" /> Save Config
          </Button>
          <Button onClick={handleSelectDirectory} disabled={isDisabled}>
            <FolderOpen className="mr-2 h-4 w-4" /> Select Directory
          </Button>
        </div>
        {/* Status should appear within the main content block */}
        <StatusDisplay message={statusMessage} variant={statusVariant} />
        {/* Conditionally render FileDataDisplay */} 
        {loadedConfigContent !== null && (
          <FileDataDisplay title="Loaded Content" content={loadedConfigContent} />
        )}
        {isFileSystemAvailable && (
          <TextInputArea
            label="Config Content (Editable)"
            id="config-file-content-input"
            value={configInputContent}
            onChange={setConfigInputContent}
            disabled={isActionLoading} // Disable while actions are running
            rows={10} // Example rows, adjust as needed
            placeholder="Load a configuration file or paste content here to save..."
            dataTestId="config-input-area" // Add test ID
          />
        )}
      </>
    );
  };

  return (
    <ErrorBoundary fallbackMessage={`Error in Config File Manager (${configName})`}>
      <div className="p-4 border rounded-lg space-y-2">
        <h3 className="text-md font-semibold">Config File Manager ({configName})</h3>
        {renderContent()}
      </div>
    </ErrorBoundary>
  );
};

export default ConfigFileManager; 