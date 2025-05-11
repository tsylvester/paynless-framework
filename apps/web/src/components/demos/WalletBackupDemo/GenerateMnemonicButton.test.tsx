import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { GenerateMnemonicButton } from './GenerateMnemonicButton'; // Assuming this path

describe('GenerateMnemonicButton Component', () => {
  it('should render a button with text "Generate Mnemonic"', () => {
    render(<GenerateMnemonicButton onGenerate={() => {}} disabled={false} />);
    expect(screen.getByRole('button', { name: /generate mnemonic/i })).toBeInTheDocument();
  });

  it('should call onGenerate prop when clicked and not disabled', () => {
    const handleGenerate = vi.fn();
    render(<GenerateMnemonicButton onGenerate={handleGenerate} disabled={false} />);
    const button = screen.getByRole('button', { name: /generate mnemonic/i });
    
    fireEvent.click(button);
    
    expect(handleGenerate).toHaveBeenCalledTimes(1);
  });

  it('should NOT call onGenerate prop when clicked and disabled', () => {
    const handleGenerate = vi.fn();
    render(<GenerateMnemonicButton onGenerate={handleGenerate} disabled={true} />);
    const button = screen.getByRole('button', { name: /generate mnemonic/i });
    
    fireEvent.click(button);
    
    expect(handleGenerate).not.toHaveBeenCalled();
  });

  it('should apply the disabled attribute when disabled prop is true', () => {
    render(<GenerateMnemonicButton onGenerate={() => {}} disabled={true} />);
    const button = screen.getByRole('button', { name: /generate mnemonic/i });
    expect(button).toBeDisabled();
  });

  it('should NOT apply the disabled attribute when disabled prop is false', () => {
    render(<GenerateMnemonicButton onGenerate={() => {}} disabled={false} />);
    const button = screen.getByRole('button', { name: /generate mnemonic/i });
    expect(button).not.toBeDisabled();
  });
}); 