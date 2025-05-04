import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileActionButtons } from './FileActionButtons'; // Component to be created
import { Loader2 } from 'lucide-react'; // For checking loader icon

// Mock lucide-react icon for easier testing
vi.mock('lucide-react', async () => {
  const actual = await vi.importActual('lucide-react');
  return {
    ...actual,
    Loader2: (props: any) => <svg data-testid="loader-icon" {...props} />,
  };
});

describe('FileActionButtons Component', () => {
  const mockOnImport = vi.fn();
  const mockOnExport = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Test Case 1: Renders Import and Export buttons
  it('should render Import and Export buttons', () => {
    render(<FileActionButtons onImport={mockOnImport} onExport={mockOnExport} />);
    expect(screen.getByRole('button', { name: /import/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
    expect(screen.queryByTestId('loader-icon')).not.toBeInTheDocument();
  });

  // Test Case 2: Calls onImport when Import button is clicked (and not disabled/loading)
  it('should call onImport when Import button is clicked', () => {
    render(<FileActionButtons onImport={mockOnImport} onExport={mockOnExport} />);
    const importButton = screen.getByRole('button', { name: /import/i });
    fireEvent.click(importButton);
    expect(mockOnImport).toHaveBeenCalledTimes(1);
    expect(mockOnExport).not.toHaveBeenCalled();
  });

  // Test Case 3: Calls onExport when Export button is clicked (and not disabled/loading)
  it('should call onExport when Export button is clicked', () => {
    render(<FileActionButtons onImport={mockOnImport} onExport={mockOnExport} />);
    const exportButton = screen.getByRole('button', { name: /export/i });
    fireEvent.click(exportButton);
    expect(mockOnExport).toHaveBeenCalledTimes(1);
    expect(mockOnImport).not.toHaveBeenCalled();
  });

  // Test Case 4: Disables both buttons when disabled prop is true
  it('should disable both buttons when disabled prop is true', () => {
    render(<FileActionButtons onImport={mockOnImport} onExport={mockOnExport} disabled />);
    const importButton = screen.getByRole('button', { name: /import/i });
    const exportButton = screen.getByRole('button', { name: /export/i });

    expect(importButton).toBeDisabled();
    expect(exportButton).toBeDisabled();

    // Ensure callbacks are not called when disabled
    fireEvent.click(importButton);
    fireEvent.click(exportButton);
    expect(mockOnImport).not.toHaveBeenCalled();
    expect(mockOnExport).not.toHaveBeenCalled();
  });

  // Test Case 5: Disables only the Export button when isExportDisabled is true (and disabled is false)
  it('should disable only Export button when isExportDisabled is true', () => {
    render(<FileActionButtons onImport={mockOnImport} onExport={mockOnExport} isExportDisabled />);
    const importButton = screen.getByRole('button', { name: /import/i });
    const exportButton = screen.getByRole('button', { name: /export/i });

    expect(importButton).toBeEnabled();
    expect(exportButton).toBeDisabled();

    // Ensure only import callback is called
    fireEvent.click(importButton);
    fireEvent.click(exportButton);
    expect(mockOnImport).toHaveBeenCalledTimes(1);
    expect(mockOnExport).not.toHaveBeenCalled();
  });

   // Test Case 6: Shows Loader2 spinner and disables both buttons when isLoading prop is true
  it('should show loader and disable buttons when isLoading is true', () => {
    render(<FileActionButtons onImport={mockOnImport} onExport={mockOnExport} isLoading />);
    const importButton = screen.getByRole('button', { name: /import/i });
    const exportButton = screen.getByRole('button', { name: /export/i });

    // Check for loader presence and button states
    expect(screen.getByTestId('loader-icon')).toBeInTheDocument();
    expect(importButton).toBeDisabled();
    expect(exportButton).toBeDisabled();

    // Ensure callbacks are not called when loading
    fireEvent.click(importButton);
    fireEvent.click(exportButton);
    expect(mockOnImport).not.toHaveBeenCalled();
    expect(mockOnExport).not.toHaveBeenCalled();
  });

  // Additional check: isExportDisabled should be overridden by isLoading
  it('should disable both buttons when isLoading is true, even if isExportDisabled is false', () => {
    render(<FileActionButtons onImport={mockOnImport} onExport={mockOnExport} isLoading isExportDisabled={false} />);
    const importButton = screen.getByRole('button', { name: /import/i });
    const exportButton = screen.getByRole('button', { name: /export/i });

    expect(screen.getByTestId('loader-icon')).toBeInTheDocument();
    expect(importButton).toBeDisabled();
    expect(exportButton).toBeDisabled();
  });

  // Additional check: disabled should be overridden by isLoading
  it('should disable both buttons when isLoading is true, even if disabled is false', () => {
    render(<FileActionButtons onImport={mockOnImport} onExport={mockOnExport} isLoading disabled={false} />);
    const importButton = screen.getByRole('button', { name: /import/i });
    const exportButton = screen.getByRole('button', { name: /export/i });

    expect(screen.getByTestId('loader-icon')).toBeInTheDocument();
    expect(importButton).toBeDisabled();
    expect(exportButton).toBeDisabled();
  });

}); 