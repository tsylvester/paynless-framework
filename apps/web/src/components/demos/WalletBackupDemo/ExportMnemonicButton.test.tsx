import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ExportMnemonicButton from './ExportMnemonicButton';
import type { FileSystemCapabilities, CapabilityUnavailable } from '@paynless/types';

// Mock Tauri core API
vi.mock('@tauri-apps/api/core', () => ({ 
  invoke: vi.fn(),
}));

// Mock Tauri dialog plugin
vi.mock('@tauri-apps/plugin-dialog', () => ({
  ask: vi.fn(),
}));

// Import invoke and ask AFTER mocking
import { invoke } from '@tauri-apps/api/core'; 
import { ask } from '@tauri-apps/plugin-dialog';

// Mock file system capabilities 
const mockAvailableFileSystem: FileSystemCapabilities = {
  isAvailable: true,
  readFile: vi.fn(),
  writeFile: vi.fn(),
  pickFile: vi.fn(),
  pickDirectory: vi.fn(),
  pickSaveFile: vi.fn(),
};

const mockUnavailableFileSystem: CapabilityUnavailable = {
  isAvailable: false,
};

describe('ExportMnemonicButton Component', () => {
  const mockOnSuccess = vi.fn();
  const mockOnError = vi.fn();
  const exportedMnemonicFromBackend = 'export winner thank wave sausage worth useful legal winner thank yellow test';
  const mockSavePath = '/fake/export-mnemonic.txt';
  const expectedEncodedData = new TextEncoder().encode(exportedMnemonicFromBackend);

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mocks before each test
    vi.mocked(mockAvailableFileSystem.pickSaveFile).mockReset();
    vi.mocked(mockAvailableFileSystem.writeFile).mockReset();
    vi.mocked(invoke).mockReset();
    vi.mocked(ask).mockReset();
  });

  it('should render the button', () => {
    render(
      <ExportMnemonicButton 
        isDisabled={false} 
        fileSystem={mockAvailableFileSystem} 
        onSuccess={mockOnSuccess} 
        onError={mockOnError} 
      />
    );
    expect(screen.getByRole('button', { name: /Export Mnemonic to File/i })).toBeInTheDocument();
  });

  it('should be disabled if isDisabled prop is true', () => {
    render(
      <ExportMnemonicButton 
        isDisabled={true} 
        fileSystem={mockAvailableFileSystem} 
        onSuccess={mockOnSuccess} 
        onError={mockOnError} 
      />
    );
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('should be disabled if fileSystem is null or unavailable', () => {
    const { rerender } = render(
      <ExportMnemonicButton 
        isDisabled={false} 
        fileSystem={null} 
        onSuccess={mockOnSuccess} 
        onError={mockOnError} 
      />
    );
    expect(screen.getByRole('button')).toBeDisabled();

    rerender(
      <ExportMnemonicButton 
        isDisabled={false} 
        fileSystem={mockUnavailableFileSystem} 
        onSuccess={mockOnSuccess} 
        onError={mockOnError} 
      />
    );
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('should handle successful export flow', async () => {
    vi.mocked(ask).mockResolvedValue(true); // User confirms dialog
    vi.mocked(invoke).mockResolvedValue(exportedMnemonicFromBackend); // Backend returns mnemonic
    vi.mocked(mockAvailableFileSystem.pickSaveFile).mockResolvedValue(mockSavePath);
    vi.mocked(mockAvailableFileSystem.writeFile).mockResolvedValue(undefined); // Write succeeds

    render(
      <ExportMnemonicButton 
        isDisabled={false} 
        fileSystem={mockAvailableFileSystem} 
        onSuccess={mockOnSuccess} 
        onError={mockOnError} 
      />
    );
    const button = screen.getByRole('button');
    fireEvent.click(button);

    // 1. Wait for dialog to be called
    await waitFor(() => {
      expect(ask).toHaveBeenCalledTimes(1);
    });

    // 2. Wait for button to enter loading state (re-render after setIsExportLoading(true))
    // Use findByRole which waits for the element to be disabled
    await screen.findByRole('button', { name: /Export Mnemonic to File/i, disabled: true });

    // 3. Wait for the rest of the async operations and final state
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('export_mnemonic');
      expect(mockAvailableFileSystem.pickSaveFile).toHaveBeenCalledTimes(1);
      expect(mockAvailableFileSystem.writeFile).toHaveBeenCalledWith(mockSavePath, expectedEncodedData);
      expect(mockOnSuccess).toHaveBeenCalledWith('Mnemonic exported successfully!');
      expect(mockOnError).not.toHaveBeenCalled();
    });

    // 4. Final check: Button should be enabled again
    expect(button).toBeEnabled();
    expect(button).toHaveTextContent(/Export Mnemonic to File/i);
  });

  it('should handle dialog cancellation', async () => {
    vi.mocked(ask).mockResolvedValue(false); // User cancels dialog

    render(
      <ExportMnemonicButton 
        isDisabled={false} 
        fileSystem={mockAvailableFileSystem} 
        onSuccess={mockOnSuccess} 
        onError={mockOnError} 
      />
    );
    const button = screen.getByRole('button');
    fireEvent.click(button);

    await waitFor(() => {
      expect(ask).toHaveBeenCalledTimes(1);
      expect(invoke).not.toHaveBeenCalled();
      expect(mockAvailableFileSystem.pickSaveFile).not.toHaveBeenCalled();
      expect(mockAvailableFileSystem.writeFile).not.toHaveBeenCalled();
      expect(mockOnError).toHaveBeenCalledWith('Export cancelled by user.');
      expect(mockOnSuccess).not.toHaveBeenCalled();
    });
    expect(button).toBeEnabled(); // Should remain enabled
  });

  it('should handle backend invoke error', async () => {
    const backendError = 'CouldNotRetrieveMnemonic';
    vi.mocked(ask).mockResolvedValue(true); // User confirms dialog
    vi.mocked(invoke).mockRejectedValue(backendError); // Mock invoke rejection

    render(
      <ExportMnemonicButton 
        isDisabled={false} 
        fileSystem={mockAvailableFileSystem} 
        onSuccess={mockOnSuccess} 
        onError={mockOnError} 
      />
    );
    const button = screen.getByRole('button');
    fireEvent.click(button);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('export_mnemonic');
      expect(mockAvailableFileSystem.pickSaveFile).not.toHaveBeenCalled();
      expect(mockAvailableFileSystem.writeFile).not.toHaveBeenCalled();
      expect(mockOnError).toHaveBeenCalledWith(`Export Error: ${backendError}`);
      expect(mockOnSuccess).not.toHaveBeenCalled();
    });
    expect(button).toBeEnabled();
  });

  it('should handle file save cancellation', async () => {
    vi.mocked(ask).mockResolvedValue(true);
    vi.mocked(invoke).mockResolvedValue(exportedMnemonicFromBackend);
    vi.mocked(mockAvailableFileSystem.pickSaveFile).mockResolvedValue(null); // Simulate cancellation

    render(
      <ExportMnemonicButton 
        isDisabled={false} 
        fileSystem={mockAvailableFileSystem} 
        onSuccess={mockOnSuccess} 
        onError={mockOnError} 
      />
    );
    const button = screen.getByRole('button');
    fireEvent.click(button);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledTimes(1);
      expect(mockAvailableFileSystem.pickSaveFile).toHaveBeenCalledTimes(1);
      expect(mockAvailableFileSystem.writeFile).not.toHaveBeenCalled();
      expect(mockOnError).toHaveBeenCalledWith('File save cancelled.');
      expect(mockOnSuccess).not.toHaveBeenCalled();
    });
    expect(button).toBeEnabled();
  });

  it('should handle file write error', async () => {
    const writeError = new Error('Permission denied');
    vi.mocked(ask).mockResolvedValue(true);
    vi.mocked(invoke).mockResolvedValue(exportedMnemonicFromBackend);
    vi.mocked(mockAvailableFileSystem.pickSaveFile).mockResolvedValue(mockSavePath);
    vi.mocked(mockAvailableFileSystem.writeFile).mockRejectedValue(writeError);

    render(
      <ExportMnemonicButton 
        isDisabled={false} 
        fileSystem={mockAvailableFileSystem} 
        onSuccess={mockOnSuccess} 
        onError={mockOnError} 
      />
    );
    const button = screen.getByRole('button');
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockAvailableFileSystem.writeFile).toHaveBeenCalledWith(mockSavePath, expectedEncodedData);
      expect(mockOnError).toHaveBeenCalledWith(`Export Error: ${writeError.message}`);
      expect(mockOnSuccess).not.toHaveBeenCalled();
    });
    expect(button).toBeEnabled();
  });

}); 