import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { FileUpload, FileUploadProps } from './FileUpload';

let mockFileContents: Record<string, { content: string | ArrayBuffer | null }> = {};

interface MockFileReaderType {
  onload: ((event: ProgressEvent<MockFileReaderType>) => void) | null;
  onerror: ((event: ProgressEvent<MockFileReaderType>) => void) | null;
  result: string | ArrayBuffer | null;
  error: DOMException | null;
  readyState: 0 | 1 | 2; // FileReader.EMPTY | FileReader.LOADING | FileReader.DONE
  abort: Mock<[], void>;
  readAsText: Mock<[File, string?], void>;
  readAsArrayBuffer: Mock<[File], void>;
  readAsDataURL: Mock<[File], void>;
  // EventTarget methods
  addEventListener: Mock<[string, EventListenerOrEventListenerObject | null, (boolean | AddEventListenerOptions)?], void>;
  removeEventListener: Mock<[string, EventListenerOrEventListenerObject | null, (boolean | EventListenerOptions)?], void>;
  dispatchEvent: Mock<[Event], boolean>;
}

// Store the mock implementations for read methods to be reused by each instance
const mockReadAsText = vi.fn(function(this: MockFileReaderType, file: File) {
  this.readyState = 1; // FileReader.LOADING
  setTimeout(() => {
    const fileData = mockFileContents[file.name];
    if (fileData && fileData.content !== null && typeof fileData.content === 'string') {
      this.result = fileData.content;
      this.readyState = 2; // FileReader.DONE
      this.error = null;
      if (this.onload) {
        this.onload({ target: this } as unknown as ProgressEvent<MockFileReaderType>);
      }
    } else {
      this.result = null; 
      this.readyState = 2; // FileReader.DONE
      this.error = new DOMException(`Mock error reading file '${file.name}' as text`);
      if (this.onerror) {
        this.onerror({ target: this } as unknown as ProgressEvent<MockFileReaderType>);
      }
    }
  }, 0);
});

const mockReadAsArrayBuffer = vi.fn(function(this: MockFileReaderType, file: File) {
  this.readyState = 1; // FileReader.LOADING
  setTimeout(() => {
    const fileData = mockFileContents[file.name];
    if (fileData && fileData.content !== null && fileData.content instanceof ArrayBuffer) {
      this.result = fileData.content;
      this.readyState = 2; // FileReader.DONE
      this.error = null;
      if (this.onload) {
        this.onload({ target: this } as unknown as ProgressEvent<MockFileReaderType>);
      }
    } else {
      this.result = null;
      this.readyState = 2; // FileReader.DONE
      this.error = new DOMException(`Mock error reading file '${file.name}' as ArrayBuffer`);
      if (this.onerror) {
        this.onerror({ target: this } as unknown as ProgressEvent<MockFileReaderType>);
      }
    }
  }, 0);
});

const mockReadAsDataURL = vi.fn(function(this: MockFileReaderType, file: File) {
  this.readyState = 1; // FileReader.LOADING
  setTimeout(() => {
    const fileData = mockFileContents[file.name];
    if (fileData && fileData.content !== null && typeof fileData.content === 'string') {
      this.result = fileData.content;
      this.readyState = 2; // FileReader.DONE
      this.error = null;
      if (this.onload) {
        this.onload({ target: this } as unknown as ProgressEvent<MockFileReaderType>);
      }
    } else {
      this.result = null;
      this.readyState = 2; // FileReader.DONE
      this.error = new DOMException(`Mock error reading file '${file.name}' as DataURL`);
      if (this.onerror) {
        this.onerror({ target: this } as unknown as ProgressEvent<MockFileReaderType>);
      }
    }
  }, 0);
});

vi.stubGlobal('FileReader', vi.fn((): MockFileReaderType => {
  // Return a new object for each FileReader instantiation
  const newInstance: MockFileReaderType = {
    onload: null,
    onerror: null,
    result: null,
    error: null,
    readyState: 0, // FileReader.EMPTY
    abort: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    dispatchEvent: vi.fn((_event: Event) => true),
    readAsText: mockReadAsText, // Use the shared spy
    readAsArrayBuffer: mockReadAsArrayBuffer, // Use the shared spy
    readAsDataURL: mockReadAsDataURL, // Use the shared spy
  };
  return newInstance;
}));

const getMockFile = (name: string, type: string, size: number, content?: string | ArrayBuffer) => {
  const fileContent = content instanceof ArrayBuffer ? [content] : [content || 'dummy content'];
  const file = new File(fileContent, name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

const defaultProps: FileUploadProps = {
  config: {
    acceptedFileTypes: ['.md', 'text/plain', 'image/png', 'application/pdf'],
    maxSize: 1024 * 1024 * 1, // 1MB
    multipleFiles: false,
  },
  onFileLoad: vi.fn(),
  onUploadTrigger: vi.fn().mockResolvedValue({ success: true, resourceReference: 'ref123' }),
};

describe('FileUpload Component', () => {
  beforeEach(() => {
    vi.clearAllMocks(); 

    // Clear the shared spies, not instance methods
    mockReadAsText.mockClear();
    mockReadAsArrayBuffer.mockClear();
    mockReadAsDataURL.mockClear();
    // We don't need to clear abort, addEventListener etc. on a global instance anymore
    // as each FileReader will get fresh vi.fn() for those.

    mockFileContents = {}; 

    defaultProps.onFileLoad = vi.fn();
    defaultProps.onUploadTrigger = vi.fn().mockResolvedValue({ success: true, resourceReference: 'ref123' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('Props and Initial Rendering', () => {
    it('should render the file input and a drop zone label', () => {
      render(<FileUpload {...defaultProps} />);
      expect(screen.getByLabelText(/file upload input/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/file drop zone/i)).toBeInTheDocument(); 
    });

    it('should configure the file input based on config prop (single file)', () => {
      render(<FileUpload {...defaultProps} />);
      const input = screen.getByLabelText(/file upload input/i) as HTMLInputElement;
      expect(input.multiple).toBe(false);
      expect(input.accept).toBe('.md,text/plain,image/png,application/pdf');
    });

    it('should configure the file input for multiple files if specified', () => {
      const propsWithMultiple = { ...defaultProps, config: { ...defaultProps.config, multipleFiles: true } };
      render(<FileUpload {...propsWithMultiple} />);
      const input = screen.getByLabelText(/file upload input/i) as HTMLInputElement;
      expect(input.multiple).toBe(true);
    });
  });

  describe('File Selection and Client-Side Validation', () => {
    it('should display error for invalid file type', async () => {
      render(<FileUpload {...defaultProps} />);
      const input = screen.getByLabelText(/file upload input/i);
      const invalidFile = getMockFile('test.exe', 'application/octet-stream', 100);
      
      fireEvent.change(input, { target: { files: [invalidFile] } });

      await waitFor(() => {
        expect(screen.getByText(/invalid file type: test.exe/i)).toBeInTheDocument();
      });
      expect(defaultProps.onFileLoad).not.toHaveBeenCalled();
    });

    it('should display error for file size exceeding maxSize', async () => {
      render(<FileUpload {...defaultProps} />);
      const input = screen.getByLabelText(/file upload input/i);
      const largeFile = getMockFile('large.md', 'text/markdown', defaultProps.config.maxSize + 100);
      
      fireEvent.change(input, { target: { files: [largeFile] } });

      await waitFor(() => {
        expect(screen.getByText(/file too large: large.md/i)).toBeInTheDocument();
      });
      expect(defaultProps.onFileLoad).not.toHaveBeenCalled();
    });

    it('should not allow multiple files if config.multipleFiles is false', async () => {
      render(<FileUpload {...defaultProps} />);
      const input = screen.getByLabelText(/file upload input/i);
      const file1 = getMockFile('file1.md', 'text/markdown', 100, 'content1');
      const file2 = getMockFile('file2.md', 'text/markdown', 100, 'content2');
      
      mockFileContents[file1.name] = { content: 'content1' };
      // No content for file2 in mockFileContents, as it shouldn't be read

      fireEvent.change(input, { target: { files: [file1, file2] } });
      
      await waitFor(() => {
        // File 1 should be processed and displayed (its name should be there)
        expect(screen.getByText(file1.name)).toBeInTheDocument();
        // File 2 should be displayed with its specific validation error
        expect(screen.getByText(file2.name)).toBeInTheDocument();
        expect(screen.getByText(/multiple files not allowed/i)).toBeInTheDocument();
      });

      // onFileLoad should only be called for the first file
      await waitFor(() => {
        expect(defaultProps.onFileLoad).toHaveBeenCalledTimes(1);
        expect(defaultProps.onFileLoad).toHaveBeenCalledWith('content1', file1);
      });
    });
  });

  describe('File Reading and onFileLoad Callback', () => {
    it('should call onFileLoad with text content for text-based files', async () => {
      const textContent = 'Hello Markdown!';
      const mdFile = getMockFile('test.md', 'text/markdown', textContent.length, textContent);
      mockFileContents[mdFile.name] = { content: textContent };

      render(<FileUpload {...defaultProps} />);
      const input = screen.getByLabelText(/file upload input/i);
      
      await act(async () => {
        fireEvent.change(input, { target: { files: [mdFile] } });
      });

      // Assertions after act has completed
      expect(mockReadAsText).toHaveBeenCalledWith(mdFile);
      expect(screen.getByRole('button', { name: `Upload file ${mdFile.name}` })).toBeInTheDocument();
      expect(defaultProps.onFileLoad).toHaveBeenCalledWith(textContent, mdFile);
    });

    it('should call onFileLoad with data URL for image files (e.g., image/png)', async () => {
      const MOCK_DATA_URL = 'data:image/png;base64,dummycontent';
      const pngFile = getMockFile('test.png', 'image/png', MOCK_DATA_URL.length, MOCK_DATA_URL);
      mockFileContents[pngFile.name] = { content: MOCK_DATA_URL };

      render(<FileUpload {...defaultProps} />);
      const input = screen.getByLabelText(/file upload input/i);
      
      await act(async () => {
        fireEvent.change(input, { target: { files: [pngFile] } });
      });

      await waitFor(() => {
        expect(mockReadAsDataURL).toHaveBeenCalledWith(pngFile);
      });
      
      await waitFor(() => {
        expect(screen.getByRole('button', { name: `Upload file ${pngFile.name}` })).toBeInTheDocument();
      });

      expect(defaultProps.onFileLoad).toHaveBeenCalledWith(MOCK_DATA_URL, pngFile);
    });

    it('should display an error if FileReader fails', async () => {
      const file = getMockFile('error.txt', 'text/plain', 100, 'error content');
      // To make FileReader fail for this file, we simply DON'T add its content to mockFileContents
      // or add it as null, so our mock readAsText will take the error path.
      mockFileContents[file.name] = { content: null }; 
      
      render(<FileUpload {...defaultProps} />);
      const input = screen.getByLabelText(/file upload input/i);
      
      await act(async () => {
        fireEvent.change(input, { target: { files: [file] } });
      });

      await waitFor(() => {
        // Expect the error message generated by the mock FileReader's error property
        expect(screen.getByText(/^Reading: Mock error reading file 'error\\.txt' as text$/i)).toBeInTheDocument();
      });
      expect(defaultProps.onFileLoad).not.toHaveBeenCalled();
    });
  });

  describe('onUploadTrigger Callback and UI States', () => {
    it('should call onUploadTrigger when an upload is requested and display uploading state', async () => {
      const fileContent = "upload this";
      const file = getMockFile('upload_me.txt', 'text/plain', fileContent.length, fileContent);
      mockFileContents[file.name] = { content: fileContent };

      render(<FileUpload {...defaultProps} />);
      const input = screen.getByLabelText(/file upload input/i);
      
      await act(async () => {
        fireEvent.change(input, { target: { files: [file] } });
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: `Upload file ${file.name}` })).toBeInTheDocument();
      });
      expect(defaultProps.onFileLoad).toHaveBeenCalledWith(fileContent, file);
      
      const uploadButton = screen.getByRole('button', { name: `Upload file ${file.name}` }); 
      fireEvent.click(uploadButton);
      
      expect(defaultProps.onUploadTrigger).toHaveBeenCalledWith(file);
      
      await waitFor(() => {
        expect(screen.getByText(/uploading.../i)).toBeInTheDocument(); 
      });
      
      await waitFor(() => {
        expect(screen.getByText(/upload successful/i)).toBeInTheDocument();
      });
    });

    it('should display success state if onUploadTrigger resolves successfully', async () => {
      defaultProps.onUploadTrigger = vi.fn().mockResolvedValue({ success: true, resourceReference: 'ref123' });
      const fileContent = "success content";
      const file = getMockFile('success.txt', 'text/plain', fileContent.length, fileContent);
      mockFileContents[file.name] = { content: fileContent };

      render(<FileUpload {...defaultProps} />); 
      const input = screen.getByLabelText(/file upload input/i);
      
      await act(async () => {
        fireEvent.change(input, { target: { files: [file] } });
      });
      
      await waitFor(() => { 
        expect(screen.getByRole('button', { name: `Upload file ${file.name}` })).toBeInTheDocument();
      });
      
      expect(defaultProps.onFileLoad).toHaveBeenCalledWith(fileContent, file);
      
      const uploadButton = screen.getByRole('button', { name: `Upload file ${file.name}` }); 
      fireEvent.click(uploadButton);

      await waitFor(() => {
        expect(defaultProps.onUploadTrigger).toHaveBeenCalledWith(file);
        expect(screen.getByText(/upload successful!/i)).toBeInTheDocument();
        expect(screen.queryByText(/uploading.../i)).not.toBeInTheDocument();
      });
    });

    it('should display error state if onUploadTrigger rejects or returns error', async () => {
      const errorMessage = 'Upload failed by test';
      defaultProps.onUploadTrigger = vi.fn().mockResolvedValue({ success: false, error: errorMessage });
      const fileContent = "fail content";
      const file = getMockFile('fail.txt', 'text/plain', fileContent.length, fileContent);
      mockFileContents[file.name] = { content: fileContent };

      render(<FileUpload {...defaultProps} />); 
      const input = screen.getByLabelText(/file upload input/i);
      
      await act(async () => {
        fireEvent.change(input, { target: { files: [file] } });
      });

      await waitFor(() => { 
         expect(screen.getByRole('button', { name: `Upload file ${file.name}` })).toBeInTheDocument();
      });
      
      expect(defaultProps.onFileLoad).toHaveBeenCalledWith(fileContent, file);
      
      const uploadButton = screen.getByRole('button', { name: `Upload file ${file.name}` }); 
      fireEvent.click(uploadButton);

      await waitFor(() => {
        expect(defaultProps.onUploadTrigger).toHaveBeenCalledWith(file);
        expect(screen.getByText(new RegExp(errorMessage, "i"))).toBeInTheDocument();
        expect(screen.queryByText(/uploading.../i)).not.toBeInTheDocument();
        expect(screen.queryByText(/upload successful/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Drag and Drop Functionality', () => {
    it('should call onFileLoad when a valid file is dropped onto the drop zone', async () => {
      const textContent = 'Dropped content!';
      const file = getMockFile('dropped.txt', 'text/plain', textContent.length, textContent);
      mockFileContents[file.name] = { content: textContent };
      
      render(<FileUpload {...defaultProps} />);
      const dropZone = screen.getByLabelText(/file drop zone/i);

      await act(async () => {
        fireEvent.drop(dropZone, {
          dataTransfer: {
            files: [file],
            types: ['Files'],
            clearData: vi.fn(),
          },
        });
      });

      await waitFor(() => {
        expect(mockReadAsText).toHaveBeenCalledWith(file);
        expect(screen.getByRole('button', { name: `Upload file ${file.name}` })).toBeInTheDocument();
      });
      expect(defaultProps.onFileLoad).toHaveBeenCalledWith(textContent, file);
      expect(screen.getByText(file.name)).toBeInTheDocument();
    });

    it('should display error if an invalid file type is dropped', async () => {
      const invalidFile = getMockFile('dropped.exe', 'application/x-msdownload', 100);
      render(<FileUpload {...defaultProps} />);
      const dropZone = screen.getByLabelText(/file drop zone/i);

      await act(async () => {
        fireEvent.drop(dropZone, { 
          dataTransfer: { 
            files: [invalidFile], 
            types: ['Files'], 
            clearData: vi.fn(),
          }
        });
      });

      await waitFor(() => {
        expect(screen.getByText(/invalid file type: dropped.exe/i)).toBeInTheDocument();
      });
      expect(defaultProps.onFileLoad).not.toHaveBeenCalled();
    });
  });

  describe('File Preview and UI States Display', () => {
    it('should display file name, size, and type after a file is selected (and loaded)', async () => {
      const fileContent = 'Preview this content.';
      const file = getMockFile('preview.txt', 'text/plain', fileContent.length, fileContent);
      mockFileContents[file.name] = { content: fileContent };
      
      render(<FileUpload {...defaultProps} />);
      const input = screen.getByLabelText(/file upload input/i);
      
      await act(async () => {
        fireEvent.change(input, { target: { files: [file] } });
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: `Upload file ${file.name}` })).toBeInTheDocument();
      });
      expect(defaultProps.onFileLoad).toHaveBeenCalledWith(fileContent, file);
      expect(screen.getByText(file.name)).toBeInTheDocument();
      expect(screen.getByText(new RegExp(file.size.toString()))).toBeInTheDocument(); 
      const filePreviewContainer = screen.getByText(file.name).closest('.flex.items-center.justify-between');
      expect(filePreviewContainer).not.toBeNull();
      if (filePreviewContainer) {
        expect(within(filePreviewContainer as HTMLElement).getByText(new RegExp(file.type, "i"))).toBeInTheDocument();
      }
    });

    it('should clear file preview and error messages when a new file selection starts (input click)', async () => {
      render(<FileUpload {...defaultProps} config={{...defaultProps.config, multipleFiles: false}} />); 
      const input = screen.getByLabelText(/file upload input/i) as HTMLInputElement;
      
      const invalidFile = getMockFile('bad.exe', 'application/octet-stream', 100);
      // No content in mockFileContents, so read will trigger error path for mock
      mockFileContents[invalidFile.name] = { content: null }; // Or simply don't add it to mockFileContents
      
      await act(async () => {
        fireEvent.change(input, { target: { files: [invalidFile] } });
      });

      await waitFor(() => {
        expect(screen.getByText(/invalid file type: bad.exe/i)).toBeInTheDocument();
      });

      fireEvent.click(input);
      await waitFor(() => {
        expect(screen.queryByText(/invalid file type: bad.exe/i)).not.toBeInTheDocument();
        expect(screen.queryByText(invalidFile.name)).not.toBeInTheDocument();
      });

      const validFileContent = 'good content';
      const validFile = getMockFile('good.txt', 'text/plain', 100, validFileContent);
      mockFileContents[validFile.name] = { content: validFileContent };
      
      await act(async () => {
        fireEvent.change(input, { target: { files: [validFile] } });
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: `Upload file ${validFile.name}` })).toBeInTheDocument();
      });
      expect(defaultProps.onFileLoad).toHaveBeenCalledWith(validFileContent, validFile);
      expect(screen.getByText(validFile.name)).toBeInTheDocument();

      fireEvent.click(input);
      await waitFor(() => {
        expect(screen.queryByText(validFile.name)).not.toBeInTheDocument();
      });
    });
  });
}); 