import React from 'react';
import { usePlatformCapabilities } from '@paynless/platform-capabilities';
import { logger } from '@paynless/utils';

/**
 * Example component demonstrating use of platform capabilities.
 */
export const PlatformFeatureTester: React.FC = () => {
  const capabilities = usePlatformCapabilities();

  // --- Handle Loading State --- 
  if (!capabilities) {
    return <div>Loading platform capabilities...</div>;
  }

  // --- Platform-Specific Rendering & Actions --- 
  const { platform, fileSystem } = capabilities;

  const handlePickFile = async () => {
    if (fileSystem.isAvailable) {
      logger.info(`[${platform}] Attempting to pick file...`);
      const filePath = await fileSystem.pickFile({ accept: '.txt' });
      if (filePath) {
        logger.info(`[${platform}] File picked: ${filePath}`);
        // Example: Read the file after picking
        try {
          const content = await fileSystem.readFile(filePath);
          logger.info(`[${platform}] File content length: ${content.byteLength} bytes`);
          // In a real app, update state with content or path
        } catch (err) {
          logger.error(`[${platform}] Error reading file:`, err);
        }
      } else {
        logger.info(`[${platform}] File picking cancelled.`);
      }
    } else {
      logger.warn('File picking not available on this platform.');
    }
  };

  return (
    <div style={{ border: '1px solid blue', padding: '10px', margin: '10px' }}>
      <h2>Platform Feature Tester</h2>
      <p>Detected Platform: <strong>{platform}</strong></p>
      <p>File System Available: <strong>{fileSystem.isAvailable.toString()}</strong></p>

      {/* Conditionally render the button */}
      {fileSystem.isAvailable ? (
        <button onClick={handlePickFile}>
          Pick Text File (Desktop)
        </button>
      ) : (
        <p>(File picking button hidden on platforms without filesystem capability)</p>
      )}

      {/* Example of web-specific fallback (or alternative) */}
      {platform === 'web' && (
        <div style={{ marginTop: '10px' }}>
          <label htmlFor="web-file-input">Choose file (Web standard): </label>
          <input type="file" id="web-file-input" accept='.txt' />
        </div>
      )}
    </div>
  );
}; 