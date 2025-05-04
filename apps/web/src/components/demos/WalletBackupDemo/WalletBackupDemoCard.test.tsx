import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import WalletBackupDemoCard from './WalletBackupDemoCard';
import { usePlatform } from '@paynless/platform';
import type { PlatformCapabilities, FileSystemCapabilities, CapabilityUnavailable } from '@paynless/types';
// Import the actual context hook return type for mocking
import type { CapabilitiesContextValue } from '@paynless/types';

// Mock the usePlatform hook
vi.mock('@paynless/platform');

// Mock sub-components (Keep these simple for testing the container)
vi.mock('./MnemonicInputArea', () => ({
  MnemonicInputArea: vi.fn(({ disabled, value, onChange }) => (
    <textarea
      aria-label="mnemonic phrase"
      data-testid="mnemonic-input"
      disabled={disabled}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  )),
}));
vi.mock('./GenerateMnemonicButton', () => ({
  GenerateMnemonicButton: vi.fn(({ disabled, onGenerate }) => (
    <button onClick={onGenerate} disabled={disabled} data-testid="generate-button">
      Generate Mnemonic
    </button>
  ))
}));
vi.mock('./FileActionButtons', () => ({
  FileActionButtons: vi.fn(({ disabled, onImport, onExport, isExportDisabled, isLoading }) => (
    <div data-testid="file-action-buttons">
      <button onClick={onImport} disabled={disabled || isLoading} data-testid="import-button">
        Import Mnemonic from File
      </button>
      <button onClick={onExport} disabled={disabled || isExportDisabled || isLoading} data-testid="export-button">
        Export Mnemonic to File
      </button>
      {/* Add data attributes to easily check props in tests */}
      <span data-prop-disabled={disabled}></span>
      <span data-prop-isExportDisabled={isExportDisabled}></span>
      <span data-prop-isLoading={isLoading}></span>
    </div>
  )),
}));
vi.mock('./StatusDisplay', () => ({
  StatusDisplay: vi.fn(({ message, variant }) => (
    message ? <div role="alert" data-variant={variant} data-testid="status-display">{message}</div> : null
  ))
}));

// Helper function to render with specific mocked platform state
const renderComponent = (mockReturnValue: CapabilitiesContextValue) => {
  vi.mocked(usePlatform).mockReturnValue(mockReturnValue);
  return render(<WalletBackupDemoCard />); 
};

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

// --- Test Suite --- 
describe('WalletBackupDemoCard Component', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mocks on the file system object as well
    if (mockAvailableFileSystem.isAvailable) {
      vi.mocked(mockAvailableFileSystem.pickFile).mockClear();
      vi.mocked(mockAvailableFileSystem.readFile).mockClear();
      vi.mocked(mockAvailableFileSystem.pickSaveFile).mockClear();
      vi.mocked(mockAvailableFileSystem.writeFile).mockClear();
    }
  });

  it('should render the basic structure heading', () => {
    // Use loading state for basic structure check
    const mockLoadingState: CapabilitiesContextValue = { capabilities: null, isLoadingCapabilities: true, capabilityError: null };
    renderComponent(mockLoadingState);
    expect(screen.getByRole('heading', { name: /Wallet Backup\/Recovery Demo/i })).toBeInTheDocument();
  });

  // *** Test for Loading State ***
  it('should render skeleton loaders when capabilities are loading', () => {
    const mockLoadingState: CapabilitiesContextValue = { capabilities: null, isLoadingCapabilities: true, capabilityError: null };
    const { container } = renderComponent(mockLoadingState);
    // Check for presence of multiple skeleton elements (adjust count based on implementation)
    const skeletons = container.querySelectorAll('.animate-pulse'); // Default class for Skeleton
    expect(skeletons.length).toBeGreaterThan(3); 
    // Ensure main content is not rendered
    expect(screen.queryByTestId('mnemonic-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('file-action-buttons')).not.toBeInTheDocument();
    expect(screen.queryByTestId('status-display')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert', { name: /Error Loading Capabilities/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert', { name: /File System Unavailable/i })).not.toBeInTheDocument();
  });

  // *** Test for Error State ***
  it('should render error alert when platform hook returns an error', () => {
    const mockError = new Error('Failed to detect platform');
    const mockErrorState: CapabilitiesContextValue = {
      capabilities: null,
      isLoadingCapabilities: false,
      capabilityError: mockError,
    };
    renderComponent(mockErrorState);

    const errorAlert = screen.getByRole('alert'); 
    expect(errorAlert).toBeInTheDocument();
    // Check specific title/description within the alert
    expect(within(errorAlert).getByText(/Error Loading Capabilities/i)).toBeInTheDocument();
    expect(within(errorAlert).getByText(mockError.message)).toBeInTheDocument();
    expect(errorAlert).toHaveClass('text-destructive'); // Check for destructive variant styling

    // Ensure main content is not rendered
    expect(screen.queryByTestId('mnemonic-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('file-action-buttons')).not.toBeInTheDocument();
    expect(screen.queryByTestId('status-display')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert', { name: /File System Unavailable/i })).not.toBeInTheDocument();
    
  });
  
  // *** Test for Unavailable State ***
  it('should render unavailable alert and disabled controls when file system is unavailable', () => {
    const mockUnavailableState: CapabilitiesContextValue = {
      capabilities: { platform: 'web', os: 'unknown', fileSystem: mockUnavailableFileSystem },
      isLoadingCapabilities: false,
      capabilityError: null,
    };
    renderComponent(mockUnavailableState);

    // Check for unavailable alert
    const unavailableAlert = screen.getByRole('alert');
    expect(unavailableAlert).toBeInTheDocument();
    expect(within(unavailableAlert).getByText(/File System Unavailable/i)).toBeInTheDocument();
    expect(unavailableAlert).not.toHaveClass('text-destructive'); // Should be default variant

    // Check controls are rendered but disabled
    expect(screen.getByTestId('mnemonic-input')).toBeDisabled();
    expect(screen.getByTestId('generate-button')).toBeDisabled();
    const actionButtons = screen.getByTestId('file-action-buttons');
    expect(within(actionButtons).getByTestId('import-button')).toBeDisabled();
    expect(within(actionButtons).getByTestId('export-button')).toBeDisabled();

    // Verify props passed to FileActionButtons
    expect(actionButtons.querySelector('[data-prop-disabled=true]')).toBeInTheDocument();
    // isExportDisabled depends on mnemonic state AND overall disabled state, so it should also be true here
    expect(actionButtons.querySelector('[data-prop-isExportDisabled=true]')).toBeInTheDocument(); 
    expect(actionButtons.querySelector('[data-prop-isLoading=false]')).toBeInTheDocument();

    expect(screen.queryByTestId('status-display')).not.toBeInTheDocument(); // No initial status message
  });

  // *** Test for Available State ***
  it('should render enabled controls when file system is available', async () => {
    const mockAvailableState: CapabilitiesContextValue = {
      capabilities: { platform: 'tauri', os: 'windows', fileSystem: mockAvailableFileSystem },
      isLoadingCapabilities: false,
      capabilityError: null,
    };
    renderComponent(mockAvailableState);

    // Ensure loading/error/unavailable alerts are NOT present
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBe(0);

    // Check controls are rendered and enabled (Export initially disabled due to empty mnemonic)
    expect(screen.getByTestId('mnemonic-input')).toBeEnabled();
    expect(screen.getByTestId('generate-button')).toBeEnabled();
    const actionButtons = screen.getByTestId('file-action-buttons');
    expect(within(actionButtons).getByTestId('import-button')).toBeEnabled();
    expect(within(actionButtons).getByTestId('export-button')).toBeDisabled(); // Initially disabled

    // Verify props passed to FileActionButtons
    expect(actionButtons.querySelector('[data-prop-disabled=false]')).toBeInTheDocument();
    expect(actionButtons.querySelector('[data-prop-isExportDisabled=true]')).toBeInTheDocument(); // True because mnemonic is empty
    expect(actionButtons.querySelector('[data-prop-isLoading=false]')).toBeInTheDocument();

    // Simulate typing to enable export
    const textArea = screen.getByTestId('mnemonic-input');
    fireEvent.change(textArea, { target: { value: 'test mnemonic twelve words minimum required' } });
    
    // Use waitFor to check for the button becoming enabled due to state change
    await waitFor(() => {
        expect(within(actionButtons).getByTestId('export-button')).toBeEnabled();
        // Check props again after state update
        expect(actionButtons.querySelector('[data-prop-isExportDisabled=false]')).toBeInTheDocument();
    });
  });

  // --- Import/Export Functionality Tests (Need slight adjustments for mock structure) ---

  describe('Import Functionality', () => {
    const mockAvailableState: CapabilitiesContextValue = {
      capabilities: { platform: 'tauri', os: 'windows', fileSystem: mockAvailableFileSystem },
      isLoadingCapabilities: false,
      capabilityError: null,
    };

    it('should handle user cancellation during file picking', async () => {
      vi.mocked(mockAvailableFileSystem.pickFile!).mockResolvedValue(null);
      renderComponent(mockAvailableState);
      const importButton = screen.getByTestId('import-button');
      fireEvent.click(importButton);

      await waitFor(() => {
        expect(mockAvailableFileSystem.pickFile).toHaveBeenCalledTimes(1);
      });
      expect(mockAvailableFileSystem.readFile).not.toHaveBeenCalled();
      const statusDisplay = await screen.findByTestId('status-display');
      expect(statusDisplay).toHaveTextContent(/File selection cancelled/i);
      expect(statusDisplay).toHaveAttribute('data-variant', 'info');
    });

    it('should handle errors during file reading', async () => {
      const readError = new Error('Read permission denied');
      vi.mocked(mockAvailableFileSystem.pickFile!).mockResolvedValue(['/fake/path.txt']);
      vi.mocked(mockAvailableFileSystem.readFile!).mockRejectedValue(readError);
      renderComponent(mockAvailableState);
      const importButton = screen.getByTestId('import-button');
      fireEvent.click(importButton);

      await waitFor(() => {
        expect(mockAvailableFileSystem.readFile).toHaveBeenCalledWith('/fake/path.txt');
      });
      const statusDisplay = await screen.findByTestId('status-display');
      expect(statusDisplay).toHaveTextContent(readError.message);
      expect(statusDisplay).toHaveAttribute('data-variant', 'error');
      expect(screen.getByTestId('mnemonic-input')).toHaveValue('');
    });
    
    it('should successfully import mnemonic from file', async () => {
        const mockMnemonic = 'word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12';
        const mockFileData = new TextEncoder().encode(mockMnemonic);
        vi.mocked(mockAvailableFileSystem.pickFile!).mockResolvedValue(['/fake/path/success.txt']);
        vi.mocked(mockAvailableFileSystem.readFile!).mockResolvedValue(mockFileData);
        renderComponent(mockAvailableState);
        const importButton = screen.getByTestId('import-button');
        fireEvent.click(importButton);

        await waitFor(() => {
           expect(screen.getByTestId('mnemonic-input')).toHaveValue(mockMnemonic);
        });
        const statusDisplay = await screen.findByTestId('status-display');
        expect(statusDisplay).toHaveTextContent(/Mnemonic imported successfully/i);
        expect(statusDisplay).toHaveAttribute('data-variant', 'success');
    });

    it('should handle invalid mnemonic format in imported file', async () => {
        const mockInvalidMnemonic = 'word1 word2'; // Too short
        const mockFileData = new TextEncoder().encode(mockInvalidMnemonic);
        vi.mocked(mockAvailableFileSystem.pickFile!).mockResolvedValue(['/fake/invalid.txt']);
        vi.mocked(mockAvailableFileSystem.readFile!).mockResolvedValue(mockFileData);
        renderComponent(mockAvailableState);
        const importButton = screen.getByTestId('import-button');
        fireEvent.click(importButton);

        await waitFor(() => { 
            expect(mockAvailableFileSystem.readFile).toHaveBeenCalled();
        }); 
        const statusDisplay = await screen.findByTestId('status-display');
        expect(statusDisplay).toHaveTextContent(/Invalid mnemonic phrase format/i);
        expect(statusDisplay).toHaveAttribute('data-variant', 'error');
        expect(screen.getByTestId('mnemonic-input')).toHaveValue(''); 
    });

  });

  describe('Export Functionality', () => {
    const mockAvailableState: CapabilitiesContextValue = {
      capabilities: { platform: 'tauri', os: 'windows', fileSystem: mockAvailableFileSystem },
      isLoadingCapabilities: false,
      capabilityError: null,
    };
    const mockMnemonic = 'word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12';

    beforeEach(() => {
        // Pre-fill mnemonic for export tests
        renderComponent(mockAvailableState);
        const textArea = screen.getByTestId('mnemonic-input');
        fireEvent.change(textArea, { target: { value: mockMnemonic } });
        // Wait for export button to potentially enable (it should in this state)
        return waitFor(() => expect(screen.getByTestId('export-button')).toBeEnabled());
    });

    it('should handle user cancellation during file saving', async () => {
        vi.mocked(mockAvailableFileSystem.pickSaveFile!).mockResolvedValue(null);
        const exportButton = screen.getByTestId('export-button');
        fireEvent.click(exportButton);

        await waitFor(() => {
            expect(mockAvailableFileSystem.pickSaveFile).toHaveBeenCalledTimes(1);
        });
        expect(mockAvailableFileSystem.writeFile).not.toHaveBeenCalled();
        const statusDisplay = await screen.findByTestId('status-display');
        expect(statusDisplay).toHaveTextContent(/File save cancelled/i);
        expect(statusDisplay).toHaveAttribute('data-variant', 'info');
    });

    it('should handle errors during file writing', async () => {
        const writeError = new Error('Disk full');
        vi.mocked(mockAvailableFileSystem.pickSaveFile!).mockResolvedValue('/save/path.txt');
        vi.mocked(mockAvailableFileSystem.writeFile!).mockRejectedValue(writeError);
        const exportButton = screen.getByTestId('export-button');
        fireEvent.click(exportButton);

        await waitFor(() => {
            expect(mockAvailableFileSystem.writeFile).toHaveBeenCalled();
        });
        const statusDisplay = await screen.findByTestId('status-display');
        expect(statusDisplay).toHaveTextContent(writeError.message);
        expect(statusDisplay).toHaveAttribute('data-variant', 'error');
    });

    it('should successfully export mnemonic to file', async () => {
        const mockSavePath = '/save/success.txt';
        vi.mocked(mockAvailableFileSystem.pickSaveFile!).mockResolvedValue(mockSavePath);
        vi.mocked(mockAvailableFileSystem.writeFile!).mockResolvedValue(undefined);
        const exportButton = screen.getByTestId('export-button');
        fireEvent.click(exportButton);

        await waitFor(() => {
            const expectedData = new TextEncoder().encode(mockMnemonic);
            expect(mockAvailableFileSystem.writeFile).toHaveBeenCalledWith(mockSavePath, expectedData);
        });
        const statusDisplay = await screen.findByTestId('status-display');
        expect(statusDisplay).toHaveTextContent(/Mnemonic exported successfully/i);
        expect(statusDisplay).toHaveAttribute('data-variant', 'success');
    });
  });

  // *** Add tests for Mnemonic Generation ***
  describe('Generate Functionality', () => {
    const mockAvailableState: CapabilitiesContextValue = {
      capabilities: { platform: 'tauri', os: 'windows', fileSystem: mockAvailableFileSystem },
      isLoadingCapabilities: false,
      capabilityError: null,
    };

    it('should update mnemonic input and show success on Generate click', async () => {
      renderComponent(mockAvailableState);
      const generateButton = screen.getByTestId('generate-button');
      const textArea = screen.getByTestId('mnemonic-input');

      expect(textArea).toHaveValue(''); // Start empty

      fireEvent.click(generateButton);

      // Wait for state update
      await waitFor(() => {
        expect(textArea).not.toHaveValue('');
      });

      // Basic validation: Check word count (should be 12 or 24 for standard BIP-39)
      const generatedMnemonic = (textArea as HTMLTextAreaElement).value;
      const wordCount = generatedMnemonic.trim().split(/\s+/).length;
      expect([12, 24]).toContain(wordCount);

      // Check for success status
      const statusDisplay = screen.getByTestId('status-display');
      expect(statusDisplay).toHaveTextContent(/Mnemonic generated successfully/i);
      expect(statusDisplay).toHaveAttribute('data-variant', 'success');
    });

    it('should generate a new mnemonic on subsequent clicks', async () => {
       renderComponent(mockAvailableState);
       const generateButton = screen.getByTestId('generate-button');
       const textArea = screen.getByTestId('mnemonic-input');

       // Click once
       fireEvent.click(generateButton);
       let firstMnemonic = '';
       await waitFor(() => {
           firstMnemonic = (textArea as HTMLTextAreaElement).value;
           expect(firstMnemonic).not.toBe('');
       });

       // Click again
       fireEvent.click(generateButton);
       let secondMnemonic = '';
        await waitFor(() => {
           secondMnemonic = (textArea as HTMLTextAreaElement).value;
           expect(secondMnemonic).not.toBe('');
       });
       
       // Verify they are different
       expect(secondMnemonic).not.toEqual(firstMnemonic);
       const wordCount = secondMnemonic.trim().split(/\s+/).length;
       expect([12, 24]).toContain(wordCount);
    });
  });

}); 