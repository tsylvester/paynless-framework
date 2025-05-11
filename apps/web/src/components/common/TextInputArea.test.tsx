import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TextInputArea } from './TextInputArea';

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

  it('should call onChange handler when text is entered', () => {
    const handleChange = vi.fn();
    const labelText = "Input Area";
    render(
      <TextInputArea 
        label={labelText}
        value=""
        onChange={handleChange}
      />
    );
    const textarea = screen.getByRole('textbox', { name: labelText });
    const testInput = 'New text entered by user';

    fireEvent.change(textarea, { target: { value: testInput } });

    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith(testInput);
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
    // Check against the default value set in the component (e.g., 4)
    expect(textarea).toHaveAttribute('rows', '4');
  });

  // Test data-testid application
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
}); 