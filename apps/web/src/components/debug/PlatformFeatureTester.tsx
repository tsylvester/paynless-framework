import React, { useState } from 'react';
import { usePlatform } from '@paynless/platform';
import { logger } from '@paynless/utils';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle } from 'lucide-react';

/**
 * Example component demonstrating use of platform capabilities.
 */
export const PlatformFeatureTester: React.FC = () => {
  const { capabilities, isLoadingCapabilities, capabilityError } = usePlatform();
  const [textContent, setTextContent] = useState('Test content to save');

  // --- Handle Loading State --- 
  if (isLoadingCapabilities) {
    return (
      <div style={{ border: '1px solid gray', padding: '10px', margin: '10px' }} className="space-y-2">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-20 w-full" />
        <div className="flex space-x-2">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-48" />
        </div>
      </div>
    );
  }

  // --- Handle Error State --- 
  if (capabilityError) {
    return (
      <div style={{ border: '1px solid red', padding: '10px', margin: '10px' }}>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error Loading Platform Capabilities</AlertTitle>
          <AlertDescription>
            {capabilityError.message || 'An unknown error occurred.'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  
  // --- Handle Null Capabilities State (Shouldn't happen if !isLoading && !error, but good practice) --- 
  if (!capabilities) {
     return (
      <div style={{ border: '1px solid orange', padding: '10px', margin: '10px' }}>
        <p>Capabilities object is unexpectedly null.</p>
       </div>
     );
  }

  // --- Platform-Specific Rendering & Actions (capabilities object is now guaranteed) --- 
  const { platform, fileSystem } = capabilities;

  // Render null if web (already handled by check below but explicit is okay)
  if (platform === 'web') {
     return null; 
  }
  
  // File System check (fileSystem is now guaranteed, check its availability)
  const isFileSystemAvailable = fileSystem.isAvailable;

  // --- Handlers (Now use isFileSystemAvailable directly) --- 
  const handlePickFile = async () => {
    if (isFileSystemAvailable) {
      logger.info(`[${platform}] Attempting to pick file...`);
      const filePaths = await fileSystem.pickFile({ accept: '.txt', multiple: false }); 
      if (filePaths && filePaths.length > 0) {
        const filePath = filePaths[0];
        logger.info(`[${platform}] File picked: ${filePath}`);
        try {
          const contentBytes = await fileSystem.readFile(filePath);
          const decodedContent = new TextDecoder().decode(contentBytes);
          setTextContent(decodedContent);
          logger.info(`[${platform}] File content length: ${contentBytes.byteLength} bytes`);
        } catch (err) {
          const logData = err instanceof Error ? { error: err.message } : { error: String(err) };
          logger.error(`[${platform}] Error reading file:`, logData);
        }
      } else {
        logger.info(`[${platform}] File picking cancelled or no file selected.`);
      }
    } else {
      logger.warn('File picking not available on this platform.');
    }
  };

  const handleSaveFile = async () => {
    if (isFileSystemAvailable) {
      logger.info(`[${platform}] Attempting to save file...`);
      try {
        const filePath = await fileSystem.pickSaveFile({ accept: '.txt' });
        if (filePath) {
          logger.info(`[${platform}] Save path chosen: ${filePath}`);
          const dataToWrite = new TextEncoder().encode(textContent);
          await fileSystem.writeFile(filePath, dataToWrite);
          logger.info(`[${platform}] File successfully written.`);
        } else {
          logger.info(`[${platform}] File saving cancelled.`); 
        }
      } catch (err) {
        const logData = err instanceof Error ? { error: err.message } : { error: String(err) };
        logger.error(`[${platform}] Error saving file:`, logData);
      }
    } else {
      logger.warn('File saving not available on this platform.');
    }
  };

  // --- Main Render (Only if loaded, no error, and capabilities exist) ---
  return (
    <div style={{ border: '1px solid blue', padding: '10px', margin: '10px' }}>
      <h2>Platform Feature Tester</h2>
      <p>Detected Platform: <strong>{platform}</strong></p>
      <p>File System Available: <strong>{isFileSystemAvailable.toString()}</strong></p>

      <textarea 
        value={textContent}
        onChange={(e) => setTextContent(e.target.value)}
        rows={4}
        cols={50}
        style={{ display: 'block', margin: '10px 0' }}
        aria-label="Text Content"
        disabled={!isFileSystemAvailable}
      />

      {isFileSystemAvailable ? (
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={handlePickFile}>
            Pick & Load Text File (Desktop)
          </button>
          <button onClick={handleSaveFile}>
            Save Text File (Desktop)
          </button>
        </div>
      ) : (
        <p>(File operations require the Desktop app environment and are unavailable)</p>
      )}
    </div>
  );
}; 