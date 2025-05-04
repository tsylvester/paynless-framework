import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info, CheckCircle, AlertCircle } from 'lucide-react';

interface WalletBackupDemoProps {}

export const WalletBackupDemo: React.FC<WalletBackupDemoProps> = () => {
  const [mnemonic, setMnemonic] = useState<string>('');
  // Placeholder states for status messages (will be resolved in later steps)
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusVariant, setStatusVariant] = useState<'info' | 'success' | 'error'>('info');

  // Placeholder values for loading/availability (will be replaced by usePlatform hook)
  const isLoadingCapabilities = false; // Placeholder
  const isFileSystemAvailable = true; // Placeholder
  const isLoading = false; // Placeholder for import/export loading

  // TODO: Remove dummy calls once setStatusMessage/setStatusVariant are used
  if (statusMessage === 'trigger-lint-use') {
    console.log(setStatusMessage, setStatusVariant);
  }

  return (
    <div className="p-4 border rounded-lg space-y-4">
      <h2 className="text-lg font-semibold">Wallet Backup/Recovery Demo</h2>

      {/* Placeholder for Loading State - Will be refined in Step 1.3 */}
      {isLoadingCapabilities && (
        <p className="text-sm text-muted-foreground">Loading capabilities...</p>
      )}

      {/* Placeholder for Unavailable State - Will be refined in Step 1.3 */}
      {!isLoadingCapabilities && !isFileSystemAvailable && (
         <Alert variant="default"> {/* Changed variant to default */} 
           <Info className="h-4 w-4" />
           <AlertTitle>File System Unavailable</AlertTitle>
           <AlertDescription>
             File operations require the Desktop app.
           </AlertDescription>
         </Alert>
      )}

      {/* Mnemonic Input Area */}
      <Textarea
        aria-label="mnemonic phrase"
        placeholder="Enter or import your 12 or 24 word mnemonic phrase..."
        value={mnemonic}
        onChange={(e) => setMnemonic(e.target.value)}
        rows={3}
        disabled={isLoadingCapabilities || !isFileSystemAvailable || isLoading}
      />

      {/* Action Buttons */}
      <div className="flex space-x-2">
        <Button
          onClick={() => console.log('Import Clicked')} // Placeholder onClick
          disabled={isLoadingCapabilities || !isFileSystemAvailable || isLoading}
        >
          Import Mnemonic from File
        </Button>
        <Button
          variant="outline"
          onClick={() => console.log('Export Clicked')} // Placeholder onClick
          disabled={isLoadingCapabilities || !isFileSystemAvailable || isLoading || !mnemonic}
        >
          Export Mnemonic to File
        </Button>
      </div>

      {/* Status Message Area */}
      {statusMessage && (
        // Map success/info to default variant, keep destructive for error
        <Alert variant={statusVariant === 'error' ? 'destructive' : 'default'}>
          {statusVariant === 'success' && <CheckCircle className="h-4 w-4 text-green-500" />} {/* Optional color hint */}
          {statusVariant === 'error' && <AlertCircle className="h-4 w-4" />}
          {statusVariant === 'info' && <Info className="h-4 w-4" />} {/* Default icon color */} 
          <AlertTitle>
            {statusVariant === 'success' ? 'Success' : statusVariant === 'error' ? 'Error' : 'Info'}
          </AlertTitle>
          <AlertDescription>{statusMessage}</AlertDescription>
        </Alert>
      )}

      {/* Remove construction message */}
      {/* <p className="text-sm text-muted-foreground">Component under construction...</p> */}
    </div>
  );
};

export default WalletBackupDemo; 