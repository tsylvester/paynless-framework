import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { TextInputArea } from './TextInputArea';
import React from 'react'; // Import React for useState in mocks if needed

// Mock child components used by TextInputArea if they are complex or have side effects
vi.mock('@/components/common/MarkdownRenderer', () => ({
  MarkdownRenderer: vi.fn(({ content }) => <div data-testid="mock-markdown-renderer">{content}</div>),
}));

vi.mock('@/components/common/FileUpload', () => ({
  FileUpload: vi.fn(({ dataTestId, onFileLoad, config, label, buttonIcon }) => {
    const inputTestId = `mock-input-for-${dataTestId}`;
    return (
      <div data-testid={dataTestId}>
        {typeof label === 'string' ? label : 'FileUpload Mock'}
        {buttonIcon && <span data-testid={`${dataTestId}-icon`}>Icon</span>}
        <input 
            type="file" 
            data-testid={inputTestId} 
            onChange={(e) => {
                 if (e.target.files && e.target.files.length > 0 && onFileLoad) {
                    const file = e.target.files[0];
                    // Simulate reading file content as text for .md files
                    if (config?.acceptedFileTypes?.includes('.md') || config?.acceptedFileTypes?.includes('text/markdown')) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                            if (event.target?.result) {
                                onFileLoad(event.target.result as string, file);
                            }
                        };
                        reader.readAsText(file);
                    } else {
                        // For other types, pass ArrayBuffer or handle as needed by your tests
                        onFileLoad('mock file content', file); 
                    }
                }
            }}
        />
      </div>
    );
  }),
}));

describe('TextInputArea Component', () => {
  it('should render the label and textarea with value', () => {
    const labelText = "Test Label";
    const initialValue = "Initial text";
    render(
      <TextInputArea 
        label={labelText}
        value={initialValue}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByLabelText(labelText)).toBeInTheDocument();
    const textarea = screen.getByRole('textbox', { name: labelText });
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveValue(initialValue);
  });

  it('should render the placeholder text when provided', () => {
    const labelText = "Placeholder Test";
    const placeholderText = "Enter text here...";
    render(
      <TextInputArea 
        label={labelText}
        value=""
        onChange={vi.fn()}
        placeholder={placeholderText}
      />
    );
    expect(screen.getByPlaceholderText(placeholderText)).toBeInTheDocument();
  });

  it('should disable the textarea when disabled prop is true', () => {
    const labelText = "Disabled Area";
    render(
      <TextInputArea 
        label={labelText}
        value="Read only"
        onChange={vi.fn()}
        disabled={true}
      />
    );
    expect(screen.getByRole('textbox', { name: labelText })).toBeDisabled();
  });

  it('should call onChange handler when text is entered', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    const labelText = "Input Area";
    let currentValue = ""; 

    // Define the onChange callback once
    const onChangeCallback = (newValue: string) => {
      handleChange(newValue);
      currentValue = newValue;
      // Rerender with the new value and the same callback instance
      rerender(
        <TextInputArea 
          label={labelText}
          value={currentValue}
          onChange={onChangeCallback} // Pass the same callback
        />
      );
    };

    const { rerender } = render(
      <TextInputArea 
        label={labelText}
        value={currentValue}
        onChange={onChangeCallback}
      />
    );
    const textarea = screen.getByRole('textbox', { name: labelText });
    const testInput = 'New text entered by user';

    for (const char of testInput) {
        // Removed { delay: 1 } as it caused a type error and might not be necessary
        await user.type(textarea, char);
    }

    expect(handleChange).toHaveBeenCalledTimes(testInput.length);
    expect(handleChange).toHaveBeenLastCalledWith(testInput);
  });

  it('should have correct aria-label based on label prop', () => {
    const labelText = "ARIA Label Test";
    render(
      <TextInputArea 
        label={labelText}
        value=""
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole('textbox', { name: labelText })).toBeInTheDocument();
  });

  it('should apply the correct number of rows', () => {
    const labelText = "Rows Test";
    const customRows = 10;
    render(
      <TextInputArea 
        label={labelText}
        value=""
        onChange={vi.fn()}
        rows={customRows}
      />
    );
    const textarea = screen.getByRole('textbox', { name: labelText });
    expect(textarea).toHaveAttribute('rows', customRows.toString());
  });

  it('should use default rows if rows prop is not provided', () => {
    const labelText = "Default Rows Test";
    render(
      <TextInputArea 
        label={labelText}
        value=""
        onChange={vi.fn()}
      />
    );
    const textarea = screen.getByRole('textbox', { name: labelText });
    expect(textarea).toHaveAttribute('rows', '4'); // Default is 4
  });

  it('should apply the data-testid when provided', () => {
    const labelText = "Test ID Area";
    const testId = "my-custom-test-id";
    render(
      <TextInputArea 
        label={labelText}
        value=""
        onChange={vi.fn()}
        dataTestId={testId}
      />
    );
    expect(screen.getByTestId(testId)).toBeInTheDocument();
  });

  describe('Preview Functionality', () => {
    const labelText = 'Preview Test Area';
    const testId = 'preview-area';
    const initialContent = '## Markdown Content';

    it('does not show preview toggle if showPreviewToggle is false or not provided', () => {
      render(<TextInputArea label={labelText} value="" onChange={vi.fn()} dataTestId={testId} />); 
      expect(screen.queryByTestId(`${testId}-preview-toggle`)).not.toBeInTheDocument();
    });

    it('shows preview toggle button when showPreviewToggle is true', () => {
      render(<TextInputArea label={labelText} value="" onChange={vi.fn()} dataTestId={testId} showPreviewToggle={true} />); 
      expect(screen.getByTestId(`${testId}-preview-toggle`)).toBeInTheDocument();
    });

    it('toggles between input and preview mode and calls onPreviewModeChange', async () => {
      const user = userEvent.setup();
      const mockOnPreviewModeChange = vi.fn();
      render(
        <TextInputArea 
          label={labelText} 
          value={initialContent} 
          onChange={vi.fn()} 
          dataTestId={testId} 
          showPreviewToggle={true}
          onPreviewModeChange={mockOnPreviewModeChange}
        />
      );

      const toggleButton = screen.getByTestId(`${testId}-preview-toggle`);
      const textarea = screen.getByTestId(testId);
      
      expect(textarea).toBeInTheDocument();
      expect(screen.queryByTestId('mock-markdown-renderer')).not.toBeInTheDocument();
      expect(toggleButton).toHaveAttribute('aria-label', 'Preview');

      await user.click(toggleButton);
      expect(mockOnPreviewModeChange).toHaveBeenCalledWith(true);
      await waitFor(() => {
        expect(screen.queryByTestId(testId)).not.toBeInTheDocument(); // Textarea hidden
        const preview = screen.getByTestId('mock-markdown-renderer');
        expect(preview).toBeInTheDocument();
        expect(preview.textContent).toBe(initialContent);
      });
      expect(toggleButton).toHaveAttribute('aria-label', 'Edit');

      await user.click(toggleButton);
      expect(mockOnPreviewModeChange).toHaveBeenCalledWith(false);
       await waitFor(() => {
        expect(screen.getByTestId(testId)).toBeInTheDocument(); // Textarea shown again
        expect(screen.queryByTestId('mock-markdown-renderer')).not.toBeInTheDocument();
      });
      expect(toggleButton).toHaveAttribute('aria-label', 'Preview');
    });
  });

  describe('File Upload Functionality', () => {
    const labelText = 'File Upload Test Area';
    const testId = 'file-upload-area';
    const mockOnFileLoad = vi.fn();
    const fileUploadConfig = {
      acceptedFileTypes: ['.md', 'text/markdown'],
      maxSize: 1024 * 1024, // 1MB
      multipleFiles: false,
    };

    it('does not show file upload elements if showFileUpload is false or onFileLoad is not provided', () => {
      render(<TextInputArea label={labelText} value="" onChange={vi.fn()} dataTestId={testId} />); 
      expect(screen.queryByTestId(`${testId}-dropzone`)).not.toBeInTheDocument();
      expect(screen.queryByTestId(`${testId}-paperclip`)).not.toBeInTheDocument();
      
      render(<TextInputArea label={labelText} value="" onChange={vi.fn()} dataTestId={testId} showFileUpload={true} />); 
      expect(screen.queryByTestId(`${testId}-dropzone`)).not.toBeInTheDocument(); // onFileLoad missing
    });

    it('shows file upload elements (dropzone and paperclip) when showFileUpload is true and onFileLoad is provided', () => {
      render(
        <TextInputArea 
          label={labelText} 
          value="" 
          onChange={vi.fn()} 
          dataTestId={testId} 
          showFileUpload={true}
          onFileLoad={mockOnFileLoad}
          fileUploadConfig={fileUploadConfig}
        />
      );
      expect(screen.getByTestId(`${testId}-dropzone`)).toBeInTheDocument();
      expect(screen.getByTestId(`${testId}-paperclip`)).toBeInTheDocument();
      expect(screen.getByTestId(`mock-input-for-${testId}-dropzone`)).toBeInTheDocument(); // From FileUpload mock
      expect(screen.getByTestId(`mock-input-for-${testId}-paperclip`)).toBeInTheDocument(); // From FileUpload mock
    });

    it('calls onFileLoad with file content when a file is selected via the paperclip button', async () => {
      const user = userEvent.setup();
      render(
        <TextInputArea 
          label={labelText} 
          value="" 
          onChange={vi.fn()} 
          dataTestId={testId} 
          showFileUpload={true}
          onFileLoad={mockOnFileLoad}
          fileUploadConfig={fileUploadConfig}
          dropZoneLabel="Test Dropzone"
        />
      );

      const paperclipInput = screen.getByTestId(`mock-input-for-${testId}-paperclip`);
      const fileContent = "# Uploaded Markdown";
      const file = new File([fileContent], "test.md", { type: "text/markdown" });

      await user.upload(paperclipInput, file);

      await waitFor(() => {
        expect(mockOnFileLoad).toHaveBeenCalledTimes(1);
        expect(mockOnFileLoad).toHaveBeenCalledWith(fileContent, expect.objectContaining({ name: 'test.md' }));
      });
    });

    // Similar test could be added for the dropzone if its input is distinct and testable through the mock
    // For now, the paperclip test covers the onFileLoad integration through the mocked FileUpload.
  });
}); 