import React, { useState, useCallback, useMemo } from 'react';
import { UploadCloud, FileText, Image, XCircle, CheckCircle2, AlertTriangle, Loader2, Paperclip } from 'lucide-react';

export interface FileUploadProps {
  config: {
    acceptedFileTypes: string[]; // e.g., ['.md', 'image/png', 'text/plain']
    maxSize: number; // in bytes
    multipleFiles: boolean;
  };
  onFileLoad: (fileContent: string | ArrayBuffer, file: File) => void;
  onUploadTrigger: (file: File) => Promise<{ success: boolean; error?: string; resourceReference?: unknown }>;
  className?: string;
  label?: string | React.ReactNode;
  activeText?: string | React.ReactNode;
  renderMode?: 'default' | 'minimalButton' | 'dropZoneOverlay';
  buttonIcon?: React.ReactNode;
  buttonText?: string;
  buttonClassName?: string;
  dropZoneClassName?: string;
  dropZoneOverlayText?: string | React.ReactNode;
  dataTestId?: string;
}

interface UploadableFile {
  id: string;
  file: File;
  previewUrl?: string; // For images
  content?: string | ArrayBuffer;
  status: 'pending' | 'loading-content' | 'loaded' | 'uploading' | 'success' | 'error-validation' | 'error-reading' | 'error-upload';
  errorMessage?: string;
  resourceReference?: unknown;
}

const generateId = () => Math.random().toString(36).substring(2, 9);

const getFileIcon = (fileType: string) => {
  if (fileType.startsWith('image/')) return <Image className="h-8 w-8 text-gray-500" />;
  if (fileType === 'application/pdf') return <FileText className="h-8 w-8 text-gray-500" />;
  // Add more specific icons as needed
  return <FileText className="h-8 w-8 text-gray-500" />;
};

const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

export const FileUpload: React.FC<FileUploadProps> = ({
  config,
  onFileLoad,
  onUploadTrigger,
  className = '',
  label = (
    <>
      <UploadCloud className="h-10 w-10 text-gray-400 mb-2" />
      <p className="text-sm text-gray-600">
        <span className="font-semibold">Click to upload</span> or drag and drop
      </p>
      <p className="text-xs text-gray-500">
        {config.acceptedFileTypes.join(', ').toUpperCase()} up to {formatBytes(config.maxSize)}
      </p>
    </>
  ),
  activeText = (
    <>
      <UploadCloud className="h-10 w-10 text-blue-500 mb-2 animate-pulse" />
      <p className="text-sm text-blue-600">Drop the file(s) here...</p>
    </>
  ),
  renderMode = 'default',
  buttonIcon = <Paperclip className="h-4 w-4" />,
  buttonText,
  buttonClassName = 'p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700',
  dropZoneClassName = 'border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-center p-6 transition-colors duration-200 ease-in-out',
  dropZoneOverlayText = (
    <p className="text-sm text-gray-500 pointer-events-none">
      Drag & drop a file here
    </p>
  ),
  dataTestId,
}) => {
  const [selectedFiles, setSelectedFiles] = useState<UploadableFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const acceptedMimeTypes = useMemo(() => {
    return config.acceptedFileTypes.map(type => {
      if (type.startsWith('.')) return type; // keep extensions like .md
      return type.toLowerCase();
    });
  }, [config.acceptedFileTypes]);

  const validateFile = (file: File): { isValid: boolean; error?: string } => {
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    const isTypeValid = acceptedMimeTypes.some(acceptedType => {
      if (acceptedType.startsWith('.')) return fileExtension === acceptedType;
      return file.type.toLowerCase() === acceptedType;
    });

    if (!isTypeValid) {
      return { isValid: false, error: `Invalid file type: ${file.name}` };
    }
    if (file.size > config.maxSize) {
      return { isValid: false, error: `File too large: ${file.name} (max ${formatBytes(config.maxSize)})` };
    }
    return { isValid: true };
  };

  const handleFileProcessing = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newUploadableFiles: UploadableFile[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!config.multipleFiles && i > 0) {
        // If not multiple files, only process the first, or show error for others
        newUploadableFiles.push({
          id: generateId(),
          file,
          status: 'error-validation',
          errorMessage: 'Multiple files not allowed',
        });
        continue;
      }

      const validation = validateFile(file);
      if (!validation.isValid) {
        newUploadableFiles.push({
          id: generateId(),
          file,
          status: 'error-validation',
          errorMessage: validation.error,
        });
        continue;
      }

      const uploadableFile: UploadableFile = {
        id: generateId(),
        file,
        status: 'loading-content',
      };
      newUploadableFiles.push(uploadableFile);
    }
    
    setSelectedFiles(prev => config.multipleFiles ? [...prev, ...newUploadableFiles] : newUploadableFiles);

    // Process each newly added file for content reading
    const fileProcessingPromises = newUploadableFiles.map((uf) => {
      return new Promise<void>((resolveFileProcessing) => {
        if (uf.status !== 'loading-content') {
          resolveFileProcessing();
          return;
        }

        const reader = new FileReader();
        reader.onload = (event: ProgressEvent<FileReader>) => {
          const fileContent = event.target?.result;
          if (fileContent === null || fileContent === undefined) {
            const updatedFileStateOnError = {
              ...uf,
              status: 'error-reading' as const,
              errorMessage: `Error reading file: ${uf.file.name} (empty content)`,
            };
            setSelectedFiles(prevSelectedFiles =>
              prevSelectedFiles.map(f => (f.id === uf.id ? updatedFileStateOnError : f))
            );
            resolveFileProcessing(); // Resolve promise for this file
            return;
          }

          const updatedFileStateOnSuccess = {
            ...uf,
            content: fileContent,
            status: 'loaded' as const,
            previewUrl: (uf.file.type.startsWith('image/') && typeof fileContent === 'string') ? fileContent : uf.previewUrl,
          };
          onFileLoad(fileContent, uf.file);
          setSelectedFiles(prevSelectedFiles =>
            prevSelectedFiles.map(f => (f.id === uf.id ? updatedFileStateOnSuccess : f))
          );
          resolveFileProcessing(); // Resolve promise for this file
        };

        reader.onerror = () => {
          const updatedFileState = {
            ...uf,
            status: 'error-reading' as const,
            errorMessage: reader.error?.message || `Error reading file: ${uf.file.name}`,
          };
          setSelectedFiles(prevSelectedFiles =>
            prevSelectedFiles.map(f => (f.id === uf.id ? updatedFileState : f))
          );
          resolveFileProcessing(); // Resolve promise for this file
        };

        if (uf.file.type.startsWith('image/') || uf.file.type === 'application/pdf') { // Read images/pdf as data URL for preview
          reader.readAsDataURL(uf.file);
        } else if (acceptedMimeTypes.some(type => type.startsWith('text/') || type === '.md' || type === '.txt') || uf.file.type === 'text/markdown') {
          reader.readAsText(uf.file);
        } else {
          reader.readAsArrayBuffer(uf.file);
        }
      });
    });

    await Promise.all(fileProcessingPromises);

  }, [config, acceptedMimeTypes, onFileLoad]);

  const handleUpload = async (fileToUpload: UploadableFile) => {
    if (fileToUpload.status !== 'loaded' && fileToUpload.status !== 'error-upload') return; // Only upload loaded files or retry errors

    setSelectedFiles(prev => prev.map(f => f.id === fileToUpload.id ? { ...f, status: 'uploading', errorMessage: undefined } : f));
    try {
      const result = await onUploadTrigger(fileToUpload.file);
      setSelectedFiles(prev => prev.map(f => f.id === fileToUpload.id ? {
        ...f,
        status: result.success ? 'success' : 'error-upload',
        errorMessage: result.error,
        resourceReference: result.resourceReference,
      } : f));
    } catch (error) {
      setSelectedFiles(prev => prev.map(f => f.id === fileToUpload.id ? {
        ...f,
        status: 'error-upload',
        errorMessage: error instanceof Error ? error.message : 'Unknown upload error',
      } : f));
    }
  };

  const handleDragEnter = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation(); // Necessary to allow drop
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileProcessing(e.dataTransfer.files);
      e.dataTransfer.clearData();
    }
  };
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileProcessing(e.target.files);
    // Reset input value to allow selecting the same file again
    if(e.target) e.target.value = ''; 
  };

  const handleRemoveFile = (id: string) => {
    setSelectedFiles(prev => prev.filter(f => f.id !== id));
  };

  const inputId = useMemo(() => `file-input-${generateId()}`, []); // Unique ID for the input

  const triggerFileInput = useCallback(() => {
    const inputElement = document.getElementById(inputId); 
    if (inputElement) {
      inputElement.click();
    }
  }, [inputId]); // Ensure inputId is a dependency

  // Render logic based on renderMode
  if (renderMode === 'minimalButton') {
    return (
      <div className={`relative ${className}`} data-testid={dataTestId}>
        <button
          type="button"
          onClick={triggerFileInput}
          className={`flex items-center space-x-1 text-gray-600 dark:text-gray-300 ${buttonClassName}`}
          aria-label={buttonText || 'Upload file'}
        >
          {buttonIcon}
          {buttonText && <span className="text-xs">{buttonText}</span>}
        </button>
        <input
          type="file"
          id={inputId}
          className="hidden"
          accept={acceptedMimeTypes.join(',')}
          multiple={config.multipleFiles}
          onChange={handleInputChange}
        />
        {/* Drag and drop can still be applied to this button or its container if needed */}
        {/* Or, a separate dropZoneOverlay instance would handle drag & drop specifically */}
      </div>
    );
  }

  if (renderMode === 'dropZoneOverlay') {
    return (
      <label // Using label for htmlFor to connect to hidden input for accessibility/click fallback
        htmlFor={inputId}
        className={`absolute inset-0 w-full h-full transition-colors duration-200 ease-in-out ${dropZoneClassName} \
                    ${isDragging 
                        ? 'bg-blue-50 border-blue-400 dark:bg-blue-900/30 dark:border-blue-600 cursor-copy pointer-events-auto opacity-100' 
                        : 'bg-transparent border-transparent pointer-events-none opacity-0'} \
                    ${className}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        data-testid="dropzone-overlay"
      >
        <input
          type="file"
          id={inputId}
          className="hidden"
          accept={acceptedMimeTypes.join(',')}
          multiple={config.multipleFiles}
          onChange={handleInputChange}
        />
        {/* Content wrapper to also manage pointer events based on dragging state */}
        <div className={`flex flex-col items-center justify-center h-full pointer-events-none`}>
          {isDragging ? activeText : dropZoneOverlayText}
        </div>
      </label>
    );
  }

  // Default render mode (existing UI)
  return (
    <div className={`flex flex-col items-center space-y-4 ${className}`} data-testid={dataTestId}>
      <label
        htmlFor={inputId} // Link label to the hidden file input
        className={`w-full cursor-pointer ${dropZoneClassName} ${isDragging ? 'bg-blue-50 border-blue-400 dark:bg-blue-900/30 dark:border-blue-600' : 'bg-gray-50 border-gray-300 hover:bg-gray-100 dark:bg-gray-700 dark:border-gray-600 dark:hover:bg-gray-600'}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <input 
          id="file-upload-input"
          aria-label="File upload input"
          type="file" 
          className="hidden" 
          multiple={config.multipleFiles}
          accept={config.acceptedFileTypes.join(',')}
          onChange={handleInputChange}
          onClick={(e) => {
            // Prevent click on label from re-triggering if input is directly clicked
            e.stopPropagation(); 
            // Clear previous error/preview when user opens file dialog
            // Only clear if not multiple, or implement more granular clearing logic
             if (!config.multipleFiles && selectedFiles.length > 0) {
               setSelectedFiles([]);
             }
          }}
        />
        {isDragging ? activeText : label}
      </label>

      {selectedFiles.length > 0 && (
        <div className="mt-4 space-y-3">
          {selectedFiles.map(uf => (
            <div key={uf.id} className="flex items-center justify-between p-3 border rounded-lg bg-white shadow-sm">
              <div className="flex items-center space-x-3">
                {uf.status === 'loading-content' || uf.status === 'uploading' ? (
                  <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                ) : uf.status === 'success' ? (
                  <CheckCircle2 className="h-8 w-8 text-green-500" />
                ) : uf.status.startsWith('error') ? (
                  <AlertTriangle className="h-8 w-8 text-red-500" />
                ) : uf.previewUrl ? (
                  <img src={uf.previewUrl} alt={uf.file.name} className="h-10 w-10 object-cover rounded" />
                ) : (
                  getFileIcon(uf.file.type)
                )}
                <div>
                  <p className="text-sm font-medium text-gray-800 truncate max-w-xs">{uf.file.name}</p>
                  <p className="text-xs text-gray-500">
                    {formatBytes(uf.file.size)} - {uf.file.type}
                  </p>
                  {uf.status === 'error-validation' && <p className="text-xs text-red-500">Validation: {uf.errorMessage}</p>}
                  {uf.status === 'error-reading' && <p className="text-xs text-red-500">Reading: {uf.errorMessage}</p>}
                  {uf.status === 'error-upload' && <p className="text-xs text-red-500">Upload: {uf.errorMessage}</p>}
                  {uf.status === 'uploading' && <p className="text-xs text-blue-500">Uploading...</p>}
                  {uf.status === 'success' && <p className="text-xs text-green-500">Upload successful!</p>}
                  {/* For 'loaded' state, we might not need a specific message or show 'Ready to upload' */} 
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {(uf.status === 'loaded' || uf.status === 'error-upload') && (
                  <button 
                    type="button"
                    aria-label={`Upload file ${uf.file.name}`}
                    onClick={() => handleUpload(uf)} 
                    className="p-1.5 text-blue-600 hover:text-blue-800 disabled:opacity-50"
                  >
                    <UploadCloud className="h-5 w-5" />
                  </button>
                )}
                <button 
                  type="button"
                  aria-label={`Remove file ${uf.file.name}`}
                  onClick={() => handleRemoveFile(uf.id)} 
                  className="p-1.5 text-red-500 hover:text-red-700"
                >
                  <XCircle className="h-5 w-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FileUpload; 