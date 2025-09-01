import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils'; // Assuming Shadcn's utility for class merging
import { UploadCloud } from 'lucide-react';
import { platformEventEmitter } from '@paynless/platform'; // Import emitter

interface DropZoneProps {
  className?: string;
  children?: React.ReactNode; // Allow passing content inside
  activeText?: string;
}

export const DropZone: React.FC<DropZoneProps> = ({
  className,
  children,
  activeText = 'Drop file here to import',
}) => {
  const [isHovering, setIsHovering] = useState(false);

  // ADDED: useEffect for platform event listener
  useEffect(() => {
    const handleHover = () => setIsHovering(true);
    const handleCancel = () => setIsHovering(false);

    console.log('[DropZone] Subscribing to file drag events');
    platformEventEmitter.on('file-drag-hover', handleHover);
    platformEventEmitter.on('file-drag-cancel', handleCancel);

    // Cleanup
    return () => {
      console.log('[DropZone] Unsubscribing from file drag events');
      platformEventEmitter.off('file-drag-hover', handleHover);
      platformEventEmitter.off('file-drag-cancel', handleCancel);
    };
  }, []); // Run only once on mount

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg transition-colors',
        isHovering ? 'border-primary bg-primary/10' : 'border-muted bg-transparent',
        className
      )}
      aria-label="File drop zone"
    >
      {isHovering ? (
        <div className="text-center text-primary">
          <UploadCloud className="mx-auto h-10 w-10 mb-2" />
          <p className="font-semibold">{activeText}</p>
        </div>
      ) : (
        children || (
          <div className="text-center text-muted-foreground">
            <UploadCloud className="mx-auto h-10 w-10 mb-2" />
            <p>Drag and drop file here</p>
             <p className="text-xs">(or use the import button)</p>
          </div>
        )
      )}
    </div>
  );
}; 