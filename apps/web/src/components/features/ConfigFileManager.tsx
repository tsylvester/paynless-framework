import React, { useState, useEffect } from 'react';
import { usePlatform } from '@paynless/platform';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from '@/components/ui/button';
import { Skeleton } from "@/components/ui/skeleton";
import { Info, AlertCircle, Upload, Download, FolderOpen, Trash2 } from 'lucide-react';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import { StatusDisplay } from '../demos/WalletBackupDemo/StatusDisplay';
import { FileDataDisplay } from '../common/FileDataDisplay';
import { TextInputArea } from '../common/TextInputArea';
import { DropZone } from '../common/DropZone';
import { platformEventEmitter, FileDropPayload } from '@paynless/platform';

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
  const STATUS_DROP_LOAD_ERROR = (msg: string) => `Drop Load Error: ${msg}`;

  // --- NEW Clear Handler ---
  const handleClear = () => {
    console.log('[ConfigFileManager] Clearing state...');
    setStatusMessage(null); // Clear status message
    setStatusVariant('info');
    setIsActionLoading(false);
    setLoadedConfigContent(null); // Clear loaded content display
    setConfigInputContent(''); // Clear text input area
    setSelectedDirectoryPath(null); // Clear selected directory
  };
  // -----------------------

  // --- Refactored File Loading Logic ---
  const loadFile = async (filePath: string) => {
    if (!fileSystem || !isFileSystemAvailable || isActionLoading) return;
    console.log(`[ConfigFileManager] Loading file: ${filePath}`);
    setIsActionLoading(true);
    setStatusMessage(STATUS_READING_FILE(filePath));
    setStatusVariant('info');
    try {
      const fileContent = await fileSystem.readFile(filePath);
      setStatusMessage(STATUS_LOAD_SUCCESS);
      setStatusVariant('success');
      const decodedContent = new TextDecoder().decode(fileContent);
      setLoadedConfigContent(decodedContent);
      setConfigInputContent(decodedContent);
    } catch (error) {
      console.error("Load File Error:", error);
      const message = error instanceof Error ? STATUS_LOAD_ERROR(error.message) : STATUS_UNKNOWN_ERROR;
      setStatusMessage(message);
      setStatusVariant('error');
    } finally {
      setIsActionLoading(false); 
    }
  };
  // -------------------------------------

  const handleLoadConfig = async () => {
    if (!fileSystem || !isFileSystemAvailable || isActionLoading) return;

    setIsActionLoading(true);
    setStatusMessage(STATUS_PICKING_FILE);
    setStatusVariant('info');
    try {
      const selectedPaths = await fileSystem.pickFile({ multiple: false });
      const selectedFilePath = selectedPaths?.[0];
      if (!selectedFilePath) {
        setStatusMessage(STATUS_LOAD_CANCELLED);
        setStatusVariant('info');
        // No need to set loading false here, loadFile does it
        return;
      }
      // Call the refactored loading function
      await loadFile(selectedFilePath);

    } catch (error) { // Catch errors from pickFile itself
       console.error("Pick File Error:", error);
       const message = error instanceof Error ? STATUS_LOAD_ERROR(error.message) : STATUS_UNKNOWN_ERROR;
       setStatusMessage(message);
       setStatusVariant('error');
    } finally {
       // Ensure loading is stopped if pickFile fails before loadFile is called
       // or if pickFile is cancelled and returns early.
       // loadFile handles its own finally block.
       // Check if still loading JUST IN CASE loadFile wasn't called (e.g. cancelled)
       if(isActionLoading) setIsActionLoading(false); 
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

  // --- Effect for File Drop Listener ---
  useEffect(() => {
    if (!isFileSystemAvailable) return; // Only listen if FS is available

    const handleFileDrop = (payload: FileDropPayload) => {
      console.log('[ConfigFileManager] Received file drop:', payload);
      // Assuming we only care about the first dropped file for config loading
      const filePath = payload[0]; 
      if (filePath) {
        // Reset status before loading dropped file
        setStatusMessage(null);
        setSelectedDirectoryPath(null);
        loadFile(filePath).catch(err => {
            // Handle potential errors during the async loadFile itself
            console.error("Error during loadFile from drop:", err);
            setStatusMessage(STATUS_DROP_LOAD_ERROR(err instanceof Error ? err.message : 'Unknown error'));
            setStatusVariant('error');
        });
      }
    };

    console.log('[ConfigFileManager] Subscribing to file-drop event.');
    platformEventEmitter.on('file-drop', handleFileDrop);

    return () => {
      console.log('[ConfigFileManager] Unsubscribing from file-drop event.');
      platformEventEmitter.off('file-drop', handleFileDrop);
    };
  }, [isFileSystemAvailable]); 
  
  // Depend on file system availability
  // ---------------------------------------

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
          {/* Add Clear button */}
          <Button 
            variant="outline" 
            onClick={handleClear}
            disabled={isLoadingCapabilities || !!capabilityError} // Disable only if capabilities loading/error
            className="ml-auto" // Position to the right
            data-testid="clear-button" // Add test ID
          >
            <Trash2 className="mr-2 h-4 w-4" /> Clear
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
        {/* Add DropZone */} 
        {isFileSystemAvailable && (
           <DropZone className="mt-4 mb-4" />
        )}
      </>
    );
  };

  return (
    <ErrorBoundary fallback={`Error in Config File Manager (${configName})`}>
      <div className="p-4 border rounded-lg space-y-2">
        <h3 className="text-md font-semibold">Config File Manager ({configName})</h3>
        {renderContent()}
      </div>
    </ErrorBoundary>
  );
};

export default ConfigFileManager; 