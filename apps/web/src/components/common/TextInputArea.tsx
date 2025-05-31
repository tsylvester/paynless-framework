import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  
  // Optional: To allow parent to control preview mode if needed, though typically internal
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
    const [isPreviewMode, setIsPreviewMode] = useState<boolean>(initialPreviewMode);
    const [inputAreaHeight, setInputAreaHeight] = useState<number | null>(null);
    const internalTextAreaRef = useRef<HTMLTextAreaElement>(null);
    const ref = externalRef || internalTextAreaRef;

    useEffect(() => {
      setIsPreviewMode(initialPreviewMode);
    }, [initialPreviewMode]);

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
    
    const updateInputAreaHeight = useCallback(() => {
      if (ref && 'current' in ref && ref.current) {
        setInputAreaHeight(ref.current.offsetHeight);
      }
    }, [ref]);

    useEffect(() => {
      updateInputAreaHeight();
      // Also update on window resize for responsive adjustments
      window.addEventListener('resize', updateInputAreaHeight);
      return () => window.removeEventListener('resize', updateInputAreaHeight);
    }, [value, updateInputAreaHeight]);


    // Default FileUploadConfig if showFileUpload is true but no config is provided by parent
    const defaultMdUploadConfig: FileUploadConfig = {
        acceptedFileTypes: ['.md', 'text/markdown'],
        maxSize: 5 * 1024 * 1024, // 5MB
        multipleFiles: false,
    };
    const currentFileUploadConfig = showFileUpload ? (fileUploadConfig || defaultMdUploadConfig) : undefined;

    const handleInternalDummyUploadTrigger = async (_unusedFile: File) => {
      return { success: true, error: 'File content loaded locally; no direct upload by TextInputArea.' };
    };

    const minHeightStyle = `${Math.max(rows * 20, 80)}px`;

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

        <div className="relative">
          {isPreviewMode && showPreviewToggle ? (
            <div 
              className="p-3 border rounded-md bg-muted/20 prose prose-sm dark:prose-invert max-w-full overflow-y-auto relative"
              style={{ 
                minHeight: inputAreaHeight ? `${Math.max(inputAreaHeight, parseFloat(minHeightStyle))}px` : minHeightStyle, 
                height: inputAreaHeight ? `${Math.max(inputAreaHeight, parseFloat(minHeightStyle))}px` : minHeightStyle 
              }}
              data-testid={dataTestId ? `${dataTestId}-markdown-preview` : "markdown-preview"}
            >
              {value && value.length > 0 ? (
                <MarkdownRenderer content={value} />
              ) : (
                <p className="text-sm text-muted-foreground italic">Nothing to preview.</p>
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
              rows={rows}
              data-testid={dataTestId}
              className={cn(
                "w-full resize-y",
                textAreaClassName
              )}
              style={{ minHeight: minHeightStyle }}
              ref={ref}
              onInput={updateInputAreaHeight}
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