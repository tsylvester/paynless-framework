import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import ImportMnemonicButton from './ImportMnemonicButton';
import type { FileSystemCapabilities, CapabilityUnavailable } from '@paynless/types';

// Mock Tauri core API
vi.mock('@tauri-apps/api/core', () => ({ 
  invoke: vi.fn(),
}));

// Import invoke AFTER mocking
import { invoke } from '@tauri-apps/api/core';

// Mock file system capabilities 
const mockAvailableFileSystem: FileSystemCapabilities = {
  isAvailable: true,
  readFile: vi.fn(),
  writeFile: vi.fn(), // Not used by this component
  pickFile: vi.fn(),
  pickDirectory: vi.fn(),
  pickSaveFile: vi.fn(),
};

const mockUnavailableFileSystem: CapabilityUnavailable = {
  isAvailable: false,
};

describe('ImportMnemonicButton Component', () => {
  const mockOnSuccess = vi.fn();
  const mockOnError = vi.fn();
  const validMnemonic = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
  const mockFilePath = '/fake/mnemonic.txt';
  const fileContent = new TextEncoder().encode(validMnemonic);

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset file system mocks before each test
    vi.mocked(mockAvailableFileSystem.pickFile).mockReset();
    vi.mocked(mockAvailableFileSystem.readFile).mockReset();
    vi.mocked(invoke).mockReset();
  });

  it('should render the button', () => {
    render(
      <ImportMnemonicButton 
        isDisabled={false} 
        fileSystem={mockAvailableFileSystem} 
        onSuccess={mockOnSuccess} 
        onError={mockOnError} 
      />
    );
    expect(screen.getByRole('button', { name: /Import Mnemonic from File/i })).toBeInTheDocument();
  });

  it('should be disabled if isDisabled prop is true', () => {
    render(
      <ImportMnemonicButton 
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
      <ImportMnemonicButton 
        isDisabled={false} 
        fileSystem={null} 
        onSuccess={mockOnSuccess} 
        onError={mockOnError} 
      />
    );
    expect(screen.getByRole('button')).toBeDisabled();

    rerender(
      <ImportMnemonicButton 
        isDisabled={false} 
        fileSystem={mockUnavailableFileSystem} 
        onSuccess={mockOnSuccess} 
        onError={mockOnError} 
      />
    );
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('should handle successful import flow', async () => {
    vi.mocked(mockAvailableFileSystem.pickFile).mockResolvedValue([mockFilePath]);
    vi.mocked(mockAvailableFileSystem.readFile).mockResolvedValue(fileContent);
    vi.mocked(invoke).mockResolvedValue(undefined); // Mock successful import_mnemonic

    render(
      <ImportMnemonicButton 
        isDisabled={false} 
        fileSystem={mockAvailableFileSystem} 
        onSuccess={mockOnSuccess} 
        onError={mockOnError} 
      />
    );
    const button = screen.getByRole('button');
    fireEvent.click(button);

    // Check loading state
    await waitFor(() => {
      expect(button).toBeDisabled();
      expect(button).toHaveTextContent(/Importing.../i);
    });

    // Wait for all async operations to complete
    await waitFor(() => {
      expect(mockAvailableFileSystem.pickFile).toHaveBeenCalledTimes(1);
      expect(mockAvailableFileSystem.readFile).toHaveBeenCalledWith(mockFilePath);
      expect(invoke).toHaveBeenCalledWith('import_mnemonic', { mnemonic: validMnemonic });
      expect(invoke).toHaveBeenCalledTimes(1);
      // Verify onSuccess callback
      expect(mockOnSuccess).toHaveBeenCalledWith('Mnemonic imported successfully!', validMnemonic);
      expect(mockOnError).not.toHaveBeenCalled();
    });

    // Check loading state reset
    expect(button).toBeEnabled();
    expect(button).toHaveTextContent(/Import Mnemonic from File/i);
  });

  it('should handle file pick cancellation', async () => {
    vi.mocked(mockAvailableFileSystem.pickFile).mockResolvedValue(null); // Simulate cancellation

    render(
      <ImportMnemonicButton 
        isDisabled={false} 
        fileSystem={mockAvailableFileSystem} 
        onSuccess={mockOnSuccess} 
        onError={mockOnError} 
      />
    );
    const button = screen.getByRole('button');
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockAvailableFileSystem.pickFile).toHaveBeenCalledTimes(1);
      expect(mockAvailableFileSystem.readFile).not.toHaveBeenCalled();
      expect(invoke).not.toHaveBeenCalled();
      expect(mockOnError).toHaveBeenCalledWith('File selection cancelled.');
      expect(mockOnSuccess).not.toHaveBeenCalled();
    });
    expect(button).toBeEnabled();
  });

  it('should handle file read error', async () => {
    const readError = new Error('Cannot read file');
    vi.mocked(mockAvailableFileSystem.pickFile).mockResolvedValue([mockFilePath]);
    vi.mocked(mockAvailableFileSystem.readFile).mockRejectedValue(readError); 

    render(
      <ImportMnemonicButton 
        isDisabled={false} 
        fileSystem={mockAvailableFileSystem} 
        onSuccess={mockOnSuccess} 
        onError={mockOnError} 
      />
    );
    const button = screen.getByRole('button');
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockAvailableFileSystem.readFile).toHaveBeenCalledWith(mockFilePath);
      expect(invoke).not.toHaveBeenCalled();
      expect(mockOnError).toHaveBeenCalledWith(`Import Error: ${readError.message}`);
      expect(mockOnSuccess).not.toHaveBeenCalled();
    });
    expect(button).toBeEnabled();
  });

  it('should handle invalid mnemonic format (frontend validation)', async () => {
    const invalidFileContent = new TextEncoder().encode('too short');
    vi.mocked(mockAvailableFileSystem.pickFile).mockResolvedValue([mockFilePath]);
    vi.mocked(mockAvailableFileSystem.readFile).mockResolvedValue(invalidFileContent);

    render(
      <ImportMnemonicButton 
        isDisabled={false} 
        fileSystem={mockAvailableFileSystem} 
        onSuccess={mockOnSuccess} 
        onError={mockOnError} 
      />
    );
    const button = screen.getByRole('button');
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockAvailableFileSystem.readFile).toHaveBeenCalledWith(mockFilePath);
      expect(invoke).not.toHaveBeenCalled();
      expect(mockOnError).toHaveBeenCalledWith('Import Error: Invalid mnemonic phrase format in file.');
      expect(mockOnSuccess).not.toHaveBeenCalled();
    });
    expect(button).toBeEnabled();
  });

  it('should handle backend invoke error', async () => {
    const backendError = 'InvalidChecksumOrSomething';
    vi.mocked(mockAvailableFileSystem.pickFile).mockResolvedValue([mockFilePath]);
    vi.mocked(mockAvailableFileSystem.readFile).mockResolvedValue(fileContent);
    vi.mocked(invoke).mockRejectedValue(backendError); // Mock invoke rejection

    render(
      <ImportMnemonicButton 
        isDisabled={false} 
        fileSystem={mockAvailableFileSystem} 
        onSuccess={mockOnSuccess} 
        onError={mockOnError} 
      />
    );
    const button = screen.getByRole('button');
    fireEvent.click(button);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('import_mnemonic', { mnemonic: validMnemonic });
      expect(mockOnError).toHaveBeenCalledWith(`Import Error: ${backendError}`);
      expect(mockOnSuccess).not.toHaveBeenCalled();
    });
    expect(button).toBeEnabled();
  });

}); 