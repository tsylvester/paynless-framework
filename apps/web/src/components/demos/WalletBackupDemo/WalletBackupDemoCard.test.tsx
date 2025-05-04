import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import WalletBackupDemoCard from './WalletBackupDemoCard';
import { usePlatform } from '@paynless/platform';
import { FileSystemCapabilities, PlatformCapabilities, CapabilityUnavailable } from '@paynless/types';

// Define the actual return type of the hook
type UsePlatformReturnType = {
  platformCapabilities: PlatformCapabilities | null;
  isLoadingCapabilities: boolean;
  capabilityError: Error | null;
};

// Mock the usePlatform hook
vi.mock('@paynless/platform');

// Mock sub-components initially
vi.mock('./MnemonicInputArea', () => ({
  MnemonicInputArea: vi.fn(({ disabled, value, onChange }) => (
    <textarea
      aria-label="mnemonic phrase"
      disabled={disabled}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {/* Passing value via prop, remove children */} 
    </textarea>
  )),
}));
vi.mock('./FileActionButtons', () => ({
  FileActionButtons: vi.fn(({ disabled, onImport, onExport, isExportDisabled, isLoading }) => (
    <div>
      <button onClick={onImport} disabled={disabled || isLoading}>
        {isLoading ? 'Loading...' : 'Import Mnemonic from File'}
      </button>
      <button onClick={onExport} disabled={disabled || isExportDisabled || isLoading}>
        {isLoading ? 'Loading...' : 'Export Mnemonic to File'}
      </button>
    </div>
  )),
}));
vi.mock('./StatusDisplay', () => ({
  StatusDisplay: vi.fn(({ message, variant }) => (
    message ? <div role="alert" aria-label={variant ?? 'status'}>{message}</div> : null
  ))
}));

// Helper function to render with specific mocked capabilities
const renderComponent = (mockReturnValue: UsePlatformReturnType) => {
  vi.mocked(usePlatform).mockReturnValue(mockReturnValue);
  return render(<WalletBackupDemoCard />);
};

// Mock file system capabilities for the 'available' state
const mockAvailableFileSystem: FileSystemCapabilities = {
  isAvailable: true,
  readFile: vi.fn(),
  writeFile: vi.fn(),
  pickFile: vi.fn(),
  pickDirectory: vi.fn(),
  pickSaveFile: vi.fn(),
};

// Mock file system capabilities for the 'unavailable' state
const mockUnavailableFileSystem: CapabilityUnavailable = {
  isAvailable: false,
};

describe('WalletBackupDemoCard Component', () => {
  // Reset mocks before each test
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the basic structure', () => {
    const mockLoadingState: UsePlatformReturnType = { platformCapabilities: null, isLoadingCapabilities: true, capabilityError: null };
    renderComponent(mockLoadingState);
    expect(screen.getByRole('heading', { name: /Wallet Backup\/Recovery Demo/i })).toBeInTheDocument();
  });

  it('should render loading state when capabilities are loading', () => {
    const mockLoadingState: UsePlatformReturnType = { platformCapabilities: null, isLoadingCapabilities: true, capabilityError: null };
    const { container } = renderComponent(mockLoadingState);
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(2);
    expect(screen.queryByText(/File operations require the Desktop app./i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Import Mnemonic from File/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /mnemonic phrase/i })).not.toBeInTheDocument();
  });

  it('should render unavailable state when file system is unavailable', () => {
    const mockUnavailableState: UsePlatformReturnType = {
      platformCapabilities: { platform: 'web', os: 'unknown', fileSystem: { isAvailable: false } },
      isLoadingCapabilities: false,
      capabilityError: null,
    };
    renderComponent(mockUnavailableState);
    expect(screen.getByText(/File operations require the Desktop app./i)).toBeInTheDocument();
    const importButton = screen.getByRole('button', { name: /Import Mnemonic from File/i });
    const exportButton = screen.getByRole('button', { name: /Export Mnemonic to File/i });
    expect(importButton).toBeDisabled();
    expect(exportButton).toBeDisabled();
    expect(screen.getByRole('textbox', { name: /mnemonic phrase/i })).toBeDisabled();
  });

  it('should render available state with enabled controls when file system is available', () => {
    const mockAvailableState: UsePlatformReturnType = {
      platformCapabilities: { platform: 'tauri', os: 'windows', fileSystem: mockAvailableFileSystem },
      isLoadingCapabilities: false,
      capabilityError: null,
    };
    renderComponent(mockAvailableState);
    const importButton = screen.getByRole('button', { name: /Import Mnemonic from File/i });
    const exportButton = screen.getByRole('button', { name: /Export Mnemonic to File/i });
    const textArea = screen.getByRole('textbox', { name: /mnemonic phrase/i });

    expect(importButton).toBeEnabled();
    expect(exportButton).toBeDisabled();
    expect(textArea).toBeEnabled();
    expect(screen.queryByText(/File operations require the Desktop app./i)).not.toBeInTheDocument();

    fireEvent.change(textArea, { target: { value: 'test mnemonic' } });
    waitFor(() => {
       expect(exportButton).toBeEnabled();
    });
  });

  // Test added for capability error state
  it('should render error state when platform hook returns an error', async () => {
    const mockError = new Error('Failed to detect platform capabilities');
    const mockErrorState: UsePlatformReturnType = {
      platformCapabilities: null,
      isLoadingCapabilities: false,
      capabilityError: mockError,
    };
    renderComponent(mockErrorState);

    // Expect an error message based on capabilityError
    // Find the alert by role only, as the name is not reliably 'error'
    const errorAlert = await screen.findByRole('alert'); 
    expect(errorAlert).toBeInTheDocument();
    // Ensure the variant is destructive (shadcn adds text-destructive class)
    expect(errorAlert).toHaveClass('text-destructive'); 

    // Check for the title and description within the alert
    expect(within(errorAlert).getByText('Error Loading Capabilities')).toBeInTheDocument();
    expect(within(errorAlert).getByText(mockError.message)).toBeInTheDocument();

    // Expect controls to be disabled or absent (check based on implementation)
    // Based on the current implementation, the controls shouldn't render at all in this state.
    expect(screen.queryByRole('button', { name: /Import Mnemonic from File/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Export Mnemonic to File/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /mnemonic phrase/i })).not.toBeInTheDocument();
  });

  // --- Import Functionality Tests --- 

  it('should do nothing if import is clicked when unavailable', async () => {
    const mockUnavailableState: UsePlatformReturnType = {
      platformCapabilities: { platform: 'web', os: 'unknown', fileSystem: mockUnavailableFileSystem },
      isLoadingCapabilities: false,
      capabilityError: null,
    };
    const pickFileMock = vi.fn();
    (mockAvailableFileSystem as FileSystemCapabilities).pickFile = pickFileMock;

    renderComponent(mockUnavailableState);
    const importButton = screen.getByRole('button', { name: /Import Mnemonic from File/i });
    expect(importButton).toBeDisabled();
    expect(pickFileMock).not.toHaveBeenCalled();
  });

  it('should handle user cancellation during file picking', async () => {
    const pickFileMock = vi.fn().mockResolvedValue(null);
    const readFileMock = vi.fn();
    const mockAvailableState: UsePlatformReturnType = {
      platformCapabilities: {
        platform: 'tauri',
        os: 'windows',
        fileSystem: { ...mockAvailableFileSystem, pickFile: pickFileMock, readFile: readFileMock }
      },
      isLoadingCapabilities: false,
      capabilityError: null,
    };
    renderComponent(mockAvailableState);
    const importButton = screen.getByRole('button', { name: /Import Mnemonic from File/i });

    fireEvent.click(importButton);

    await waitFor(() => {
      expect(pickFileMock).toHaveBeenCalledTimes(1);
    });

    expect(readFileMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert', { name: /error/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert', { name: /success/i })).not.toBeInTheDocument();

    const infoAlert = await screen.findByRole('alert', { name: /info/i });
    expect(infoAlert).toBeInTheDocument();
    expect(within(infoAlert).getByText(/File selection cancelled./i)).toBeInTheDocument();

    await waitFor(() => {
       expect(importButton).toBeEnabled();
    });
  });

  it('should handle errors during file reading', async () => {
    const pickFileMock = vi.fn().mockResolvedValue(['/fake/path/mnemonic.txt']);
    const readFileMock = vi.fn().mockRejectedValue(new Error('Failed to read file'));
    const mockAvailableState: UsePlatformReturnType = {
      platformCapabilities: {
        platform: 'tauri',
        os: 'windows',
        fileSystem: { ...mockAvailableFileSystem, pickFile: pickFileMock, readFile: readFileMock }
      },
      isLoadingCapabilities: false,
      capabilityError: null,
    };
    renderComponent(mockAvailableState);
    const importButton = screen.getByRole('button', { name: /Import Mnemonic from File/i });

    fireEvent.click(importButton);

    const errorAlert = await screen.findByRole('alert', { name: /error/i });
    expect(errorAlert).toBeInTheDocument();

    expect(pickFileMock).toHaveBeenCalledTimes(1);
    expect(readFileMock).toHaveBeenCalledWith('/fake/path/mnemonic.txt');
    expect(within(errorAlert).getByText(/Failed to read file/i)).toBeInTheDocument();
    const textArea = screen.getByRole('textbox', { name: /mnemonic phrase/i });
    expect(textArea).toHaveValue('');
    expect(importButton).toBeEnabled();
  });

  it('should successfully import mnemonic from file', async () => {
    const mockMnemonic = 'word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12';
    const mockFileData = new TextEncoder().encode(mockMnemonic);
    const pickFileMock = vi.fn().mockResolvedValue(['/fake/path/mnemonic.txt']);
    const readFileMock = vi.fn().mockResolvedValue(mockFileData);
    const mockAvailableState: UsePlatformReturnType = {
      platformCapabilities: {
        platform: 'tauri',
        os: 'windows',
        fileSystem: { ...mockAvailableFileSystem, pickFile: pickFileMock, readFile: readFileMock }
      },
      isLoadingCapabilities: false,
      capabilityError: null,
    };
    renderComponent(mockAvailableState);
    const importButton = screen.getByRole('button', { name: /Import Mnemonic from File/i });

    fireEvent.click(importButton);

    const successAlert = await screen.findByRole('alert', { name: /success/i });
    expect(successAlert).toBeInTheDocument();

    expect(pickFileMock).toHaveBeenCalledTimes(1);
    expect(readFileMock).toHaveBeenCalledWith('/fake/path/mnemonic.txt');
    const textArea = screen.getByRole('textbox', { name: /mnemonic phrase/i });
    expect(textArea).toHaveValue(mockMnemonic);
    expect(screen.queryByRole('alert', { name: /error/i })).not.toBeInTheDocument();
    expect(importButton).toBeEnabled();
  });

  // Test added for invalid mnemonic format
  it('should handle invalid mnemonic format in imported file', async () => {
    const mockInvalidMnemonic = 'word1 word2 word3'; // Only 3 words
    const mockFileData = new TextEncoder().encode(mockInvalidMnemonic);
    const pickFileMock = vi.fn().mockResolvedValue(['/fake/path/invalid.txt']);
    const readFileMock = vi.fn().mockResolvedValue(mockFileData);
    const mockAvailableState: UsePlatformReturnType = {
      platformCapabilities: {
        platform: 'tauri',
        os: 'windows',
        fileSystem: { ...mockAvailableFileSystem, pickFile: pickFileMock, readFile: readFileMock }
      },
      isLoadingCapabilities: false,
      capabilityError: null,
    };
    renderComponent(mockAvailableState);
    const importButton = screen.getByRole('button', { name: /Import Mnemonic from File/i });

    fireEvent.click(importButton);

    // Wait for the error alert to appear
    const errorAlert = await screen.findByRole('alert', { name: /error/i });
    expect(errorAlert).toBeInTheDocument();

    // Check mocks and state
    expect(pickFileMock).toHaveBeenCalledTimes(1);
    expect(readFileMock).toHaveBeenCalledWith('/fake/path/invalid.txt');
    expect(within(errorAlert).getByText(/Invalid mnemonic phrase format in file./i)).toBeInTheDocument();
    const textArea = screen.getByRole('textbox', { name: /mnemonic phrase/i });
    expect(textArea).toHaveValue(''); // Should not update mnemonic state
    expect(importButton).toBeEnabled(); // Should be enabled after error
  });

  // --- Export Functionality Tests --- 

  it('should keep export button disabled if mnemonic is empty', () => {
    const mockAvailableState: UsePlatformReturnType = {
      platformCapabilities: { platform: 'tauri', os: 'windows', fileSystem: mockAvailableFileSystem },
      isLoadingCapabilities: false,
      capabilityError: null,
    };
    renderComponent(mockAvailableState);
    const exportButton = screen.getByRole('button', { name: /Export Mnemonic to File/i });
    expect(exportButton).toBeDisabled();
  });

  it('should handle user cancellation during file saving', async () => {
    const mockMnemonic = 'word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12';
    const pickSaveFileMock = vi.fn().mockResolvedValue(null); // Simulate cancellation
    const writeFileMock = vi.fn();
    const mockAvailableState: UsePlatformReturnType = {
      platformCapabilities: {
        platform: 'tauri',
        os: 'windows',
        fileSystem: { ...mockAvailableFileSystem, pickSaveFile: pickSaveFileMock, writeFile: writeFileMock }
      },
      isLoadingCapabilities: false,
      capabilityError: null,
    };
    renderComponent(mockAvailableState);
    const exportButton = screen.getByRole('button', { name: /Export Mnemonic to File/i });
    const textArea = screen.getByRole('textbox', { name: /mnemonic phrase/i });

    // Simulate typing mnemonic to enable export
    fireEvent.change(textArea, { target: { value: mockMnemonic } });
    await waitFor(() => expect(exportButton).toBeEnabled());

    // Click export
    fireEvent.click(exportButton);

    // Wait for mock and assertions
    await waitFor(() => {
      expect(pickSaveFileMock).toHaveBeenCalledTimes(1);
    });

    expect(writeFileMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert', { name: /error/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert', { name: /success/i })).not.toBeInTheDocument();
    const infoAlert = await screen.findByRole('alert', { name: /info/i });
    expect(infoAlert).toBeInTheDocument();
    expect(within(infoAlert).getByText(/File save cancelled./i)).toBeInTheDocument();
    expect(exportButton).toBeEnabled(); // Should be re-enabled
  });

  it('should handle errors during file writing', async () => {
    const mockMnemonic = 'word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12';
    const mockSavePath = '/fake/save/path/backup.txt';
    const pickSaveFileMock = vi.fn().mockResolvedValue(mockSavePath);
    const writeFileMock = vi.fn().mockRejectedValue(new Error('Disk write error'));
    const mockAvailableState: UsePlatformReturnType = {
      platformCapabilities: {
        platform: 'tauri',
        os: 'windows',
        fileSystem: { ...mockAvailableFileSystem, pickSaveFile: pickSaveFileMock, writeFile: writeFileMock }
      },
      isLoadingCapabilities: false,
      capabilityError: null,
    };
    renderComponent(mockAvailableState);
    const exportButton = screen.getByRole('button', { name: /Export Mnemonic to File/i });
    const textArea = screen.getByRole('textbox', { name: /mnemonic phrase/i });

    // Simulate typing mnemonic
    fireEvent.change(textArea, { target: { value: mockMnemonic } });
    await waitFor(() => expect(exportButton).toBeEnabled());

    // Click export
    fireEvent.click(exportButton);

    // Wait for error alert
    const errorAlert = await screen.findByRole('alert', { name: /error/i });
    expect(errorAlert).toBeInTheDocument();

    // Check mocks and error message
    expect(pickSaveFileMock).toHaveBeenCalledTimes(1);
    const expectedData = new TextEncoder().encode(mockMnemonic);
    expect(writeFileMock).toHaveBeenCalledWith(mockSavePath, expectedData);
    expect(within(errorAlert).getByText(/Disk write error/i)).toBeInTheDocument();
    expect(exportButton).toBeEnabled(); // Should be re-enabled
  });

  it('should successfully export mnemonic to file', async () => {
    const mockMnemonic = 'word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12';
    const mockSavePath = '/fake/save/path/backup.txt';
    const pickSaveFileMock = vi.fn().mockResolvedValue(mockSavePath);
    const writeFileMock = vi.fn().mockResolvedValue(undefined); // writeFile returns void on success
    const mockAvailableState: UsePlatformReturnType = {
      platformCapabilities: {
        platform: 'tauri',
        os: 'windows',
        fileSystem: { ...mockAvailableFileSystem, pickSaveFile: pickSaveFileMock, writeFile: writeFileMock }
      },
      isLoadingCapabilities: false,
      capabilityError: null,
    };
    renderComponent(mockAvailableState);
    const exportButton = screen.getByRole('button', { name: /Export Mnemonic to File/i });
    const textArea = screen.getByRole('textbox', { name: /mnemonic phrase/i });

    // Simulate typing mnemonic
    fireEvent.change(textArea, { target: { value: mockMnemonic } });
    await waitFor(() => expect(exportButton).toBeEnabled());

    // Click export
    fireEvent.click(exportButton);

    // Wait for success alert
    const successAlert = await screen.findByRole('alert', { name: /success/i });
    expect(successAlert).toBeInTheDocument();

    // Check mocks and success message
    expect(pickSaveFileMock).toHaveBeenCalledTimes(1);
    const expectedData = new TextEncoder().encode(mockMnemonic);
    expect(writeFileMock).toHaveBeenCalledWith(mockSavePath, expectedData);
    expect(within(successAlert).getByText(/Mnemonic exported successfully!/i)).toBeInTheDocument();
    expect(exportButton).toBeEnabled(); // Should be re-enabled
  });

}); 