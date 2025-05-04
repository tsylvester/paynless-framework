import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MnemonicInputArea } from './MnemonicInputArea';

describe('MnemonicInputArea Component', () => {
  it('should render the Textarea component', () => {
    render(<MnemonicInputArea value="" onChange={() => {}} disabled={false} />);
    // Check if the textarea element is rendered, e.g., by its placeholder or aria-label
    expect(screen.getByRole('textbox', { name: /mnemonic phrase/i })).toBeInTheDocument();
  });

  it('should display the correct value prop', () => {
    const testValue = 'word1 word2 word3';
    render(<MnemonicInputArea value={testValue} onChange={() => {}} disabled={false} />);
    const textarea = screen.getByRole('textbox', { name: /mnemonic phrase/i }) as HTMLTextAreaElement;
    expect(textarea.value).toBe(testValue);
  });

  it('should call onChange prop when text is changed', () => {
    const handleChange = vi.fn();
    // Render with initial empty value
    render(<MnemonicInputArea value="" onChange={handleChange} disabled={false} />);
    const textarea = screen.getByRole('textbox', { name: /mnemonic phrase/i }) as HTMLTextAreaElement;
    const newValue = 'new value';

    // Simulate the change event directly for controlled components
    fireEvent.change(textarea, { target: { value: newValue } });

    // Verify onChange was called with the new value
    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith(newValue);

    // Note: We cannot assert textarea.value here reliably because the test
    // doesn't control the state update loop like a real parent component would.
    // This test focuses on verifying the callback prop is called correctly.
  });

  it('should apply the disabled attribute when disabled prop is true', () => {
    render(<MnemonicInputArea value="" onChange={() => {}} disabled={true} />);
    const textarea = screen.getByRole('textbox', { name: /mnemonic phrase/i });
    expect(textarea).toBeDisabled();
  });

  it('should NOT apply the disabled attribute when disabled prop is false', () => {
    render(<MnemonicInputArea value="" onChange={() => {}} disabled={false} />);
    const textarea = screen.getByRole('textbox', { name: /mnemonic phrase/i });
    expect(textarea).not.toBeDisabled();
  });
}); 