import React, { useState, useRef, useEffect } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Eye, Edit3, Paperclip } from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer';
import { FileUpload, type FileUploadProps } from './FileUpload';
import { cn } from '@/lib/utils';

// Extract types from FileUploadProps
type FileUploadConfig = FileUploadProps['config'];
type FileLoadHandler = FileUploadProps['onFileLoad'];

export interface TextInputAreaProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label: string;
  placeholder?: string;
  id?: string;
  rows?: number;
  dataTestId?: string;
  textAreaClassName?: string;
  
  // Props for MD preview functionality
  showPreviewToggle?: boolean; // If true, shows the Eye/Edit3 icon to toggle

  // Props for integrated FileUpload
  showFileUpload?: boolean; // If true, enables file upload (dropzone and paperclip)
  fileUploadConfig?: FileUploadConfig;
  onFileLoad?: FileLoadHandler; // Handles content of loaded file
  dropZoneLabel?: string;
  
  initialPreviewMode?: boolean; 
  onPreviewModeChange?: (isPreview: boolean) => void;
}

/**
 * A reusable textarea input component with a label, optional markdown preview, and optional file upload.
 */
export const TextInputArea = React.forwardRef<HTMLTextAreaElement, TextInputAreaProps>(
  ({
    value,
    onChange,
    disabled = false,
    label,
    placeholder,
    id = 'textInputArea',
    rows = 4,
    dataTestId,
    textAreaClassName,
    showPreviewToggle = false,
    showFileUpload = false,
    fileUploadConfig,
    onFileLoad,
    dropZoneLabel = "Drag & drop a file or click to select",
    initialPreviewMode = false,
    onPreviewModeChange,
  }, externalRef) => {
    const minHeightStyle = '30vh';//`${Math.max(rows * 20, 80)}px`;

    const [isPreviewMode, setIsPreviewMode] = useState<boolean>(initialPreviewMode);
    const [currentHeight, setCurrentHeight] = useState<string | number>(minHeightStyle);
    
    const containerRef = useRef<HTMLDivElement>(null);
    const internalTextAreaRef = useRef<HTMLTextAreaElement>(null);
    const resolvedRef = externalRef || internalTextAreaRef;

    useEffect(() => {
      setIsPreviewMode(initialPreviewMode);
    }, [initialPreviewMode]);

    // Observer for the main container resize
    useEffect(() => {
      const targetElement = containerRef.current;
      if (!targetElement) return;

      const observer = new ResizeObserver(() => {
        if (containerRef.current) {
          setCurrentHeight(containerRef.current.offsetHeight + 'px');
        }
      });
      observer.observe(targetElement);
      return () => {
        observer.unobserve(targetElement);
        observer.disconnect();
      };
    }, []); // Runs once on mount to observe the container

    const handleTextChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(event.target.value);
    };

    const togglePreviewMode = () => {
      const newPreviewMode = !isPreviewMode;
      setIsPreviewMode(newPreviewMode);
      if (onPreviewModeChange) {
        onPreviewModeChange(newPreviewMode);
      }
    };
    
    const defaultMdUploadConfig: FileUploadConfig = {
        acceptedFileTypes: ['.md', 'text/markdown'],
        maxSize: 5 * 1024 * 1024, // 5MB
        multipleFiles: false,
    };
    const currentFileUploadConfig = showFileUpload ? (fileUploadConfig || defaultMdUploadConfig) : undefined;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const handleInternalDummyUploadTrigger = async (_file: File) => {
      return { success: true, error: 'File content loaded locally; no direct upload by TextInputArea.' };
    };

    return (
      <div className="grid w-full gap-1.5">
        <div className="flex justify-between items-center mb-1">
            <Label htmlFor={id}>{label}</Label>
            <div className="flex items-center gap-1">
              {showFileUpload && currentFileUploadConfig && onFileLoad && (
                <FileUpload
                  dataTestId={dataTestId ? `${dataTestId}-paperclip` : "file-upload-paperclip"}
                  config={currentFileUploadConfig}
                  onFileLoad={onFileLoad}
                  onUploadTrigger={handleInternalDummyUploadTrigger}
                  renderMode="minimalButton"
                  buttonIcon={<Paperclip className="h-5 w-5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200" />}
                  buttonClassName="p-1 bg-background/70 dark:bg-muted/70 rounded-full hover:bg-muted dark:hover:bg-muted/90 backdrop-blur-sm"
                />
              )}
              {showPreviewToggle && (
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  onClick={togglePreviewMode}
                  className="h-7 w-7 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  aria-label={isPreviewMode ? 'Edit' : 'Preview'}
                  data-testid={dataTestId ? `${dataTestId}-preview-toggle` : "preview-toggle"}
                >
                  {isPreviewMode ? <Edit3 className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              )}
            </div>
        </div>

        <div 
          ref={containerRef}
          className="relative w-full resize-y overflow-auto border rounded-md" // Added border and rounded-md here for consistent look
          style={{
            height: currentHeight,
            minHeight: minHeightStyle,
            // Consider adding a maxHeight if needed, e.g., maxHeight: '70vh'
          }}
        >
          {isPreviewMode && showPreviewToggle ? (
            <div 
              className={cn(
                "p-3 bg-muted/20 prose prose-sm dark:prose-invert",
                "w-full h-full max-w-none",
                "overflow-y-auto",
                "prose-pre:whitespace-pre-wrap",
                "prose-pre:break-words"
              )}
              // style prop for height/minHeight removed, now h-full
              data-testid={dataTestId ? `${dataTestId}-markdown-preview` : "markdown-preview"}
            >
              {value && value.length > 0 ? (
                <MarkdownRenderer content={value} />
              ) : (
                <p className="text-sm text-muted-foreground italic p-3">Nothing to preview.</p> // Added p-3 for consistency
              )}
            </div>
          ) : (
            <Textarea
              id={id}
              value={value}
              onChange={handleTextChange}
              disabled={disabled}
              placeholder={placeholder}
              aria-label={label}
              rows={rows} // rows can give an initial height hint before manual resize
              data-testid={dataTestId}
              className={cn(
                "w-full h-full p-3", // Added p-3 for consistency with preview, h-full to fill container
                "resize-none",      // Remove Textarea's own resize handle
                "border-none focus:ring-0 focus-visible:ring-0", // Remove default border and focus ring as parent has border
                textAreaClassName
              )}
              // style prop for minHeight removed, now h-full
              ref={resolvedRef}
            />
          )}
          {showFileUpload && currentFileUploadConfig && onFileLoad && (
            <FileUpload
              dataTestId={dataTestId ? `${dataTestId}-dropzone` : "file-upload-dropzone"}
              config={currentFileUploadConfig}
              onFileLoad={onFileLoad}
              onUploadTrigger={handleInternalDummyUploadTrigger}
              label={dropZoneLabel}
              renderMode="dropZoneOverlay"
              className="absolute inset-0 z-10 flex items-center justify-center"
            />
          )}
        </div>
      </div>
    );
  }
);
TextInputArea.displayName = 'TextInputArea'; 