import React from 'react';
import { usePlatform } from '@paynless/platform';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from '@/components/ui/button';
import { Skeleton } from "@/components/ui/skeleton";
import { Info, AlertCircle, Upload, Download } from 'lucide-react';
import ErrorBoundary from '@/components/common/ErrorBoundary';

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

  const fileSystem = capabilities?.fileSystem;
  const isFileSystemAvailable = fileSystem?.isAvailable === true;

  const handleLoadConfig = async () => {
    if (!fileSystem || !isFileSystemAvailable) return;
    // TODO: Implement file picking and reading logic
    console.log(`Attempting to load config: ${configName}`);
  };

  const handleSaveConfig = async () => {
     if (!fileSystem || !isFileSystemAvailable) return;
    // TODO: Implement file saving logic
    console.log(`Attempting to save config: ${configName}`);
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
      <div className="flex space-x-2 mt-2">
        <Button onClick={handleLoadConfig} disabled={!isFileSystemAvailable}>
          <Upload className="mr-2 h-4 w-4" /> Load Config
        </Button>
        <Button onClick={handleSaveConfig} disabled={!isFileSystemAvailable}>
          <Download className="mr-2 h-4 w-4" /> Save Config
        </Button>
      </div>
    );
  };

  return (
    <ErrorBoundary fallbackMessage={`Error in Config File Manager (${configName})`}>
      <div className="p-4 border rounded-lg">
        <h3 className="text-md font-semibold">Config File Manager ({configName})</h3>
        {/* TODO: Add status display component later */}
        {renderContent()}
      </div>
    </ErrorBoundary>
  );
};

export default ConfigFileManager; 