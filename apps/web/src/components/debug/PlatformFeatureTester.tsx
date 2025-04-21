import React, { useState } from 'react';
import { usePlatformCapabilities } from '@paynless/platform-capabilities';
import { logger } from '@paynless/utils';

/**
 * Example component demonstrating use of platform capabilities.
 */
export const PlatformFeatureTester: React.FC = () => {
  const capabilities = usePlatformCapabilities();
  const [textContent, setTextContent] = useState('Test content to save');

  // --- Handle Loading State --- 
  if (!capabilities) {
    return <div>Loading platform capabilities...</div>;
  }

  // --- Platform-Specific Rendering & Actions --- 
  const { platform, fileSystem } = capabilities;

  // --- Pick File Handler --- 
  const handlePickFile = async () => {
    if (fileSystem.isAvailable) {
      logger.info(`[${platform}] Attempting to pick file...`);
      const filePath = await fileSystem.pickFile({ accept: '.txt' });
      if (filePath) {
        logger.info(`[${platform}] File picked: ${filePath}`);
        try {
          const contentBytes = await fileSystem.readFile(filePath);
          const decodedContent = new TextDecoder().decode(contentBytes);
          setTextContent(decodedContent);
          logger.info(`[${platform}] File content length: ${contentBytes.byteLength} bytes`);
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

  // --- Save File Handler (NEW) ---
  const handleSaveFile = async () => {
    if (fileSystem.isAvailable) {
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
        logger.error(`[${platform}] Error saving file:`, err);
      }
    } else {
      logger.warn('File saving not available on this platform.');
    }
  };

  return (
    <div style={{ border: '1px solid blue', padding: '10px', margin: '10px' }}>
      <h2>Platform Feature Tester</h2>
      <p>Detected Platform: <strong>{platform}</strong></p>
      <p>File System Available: <strong>{fileSystem.isAvailable.toString()}</strong></p>

      {/* Text area to show/edit content */}
      <textarea 
        value={textContent}
        onChange={(e) => setTextContent(e.target.value)}
        rows={4}
        cols={50}
        style={{ display: 'block', margin: '10px 0' }}
        aria-label="Text Content"
      />

      {/* Conditionally render the buttons */}
      {fileSystem.isAvailable ? (
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={handlePickFile}>
            Pick & Load Text File (Desktop)
          </button>
          <button onClick={handleSaveFile}>
            Save Text File (Desktop)
          </button>
        </div>
      ) : (
        <p>(File operation buttons hidden on platforms without filesystem capability)</p>
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