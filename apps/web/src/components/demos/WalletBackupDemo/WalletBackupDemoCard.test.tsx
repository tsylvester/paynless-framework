import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import WalletBackupDemoCard from './WalletBackupDemoCard';
// Import the actual child components to get their mock instances later
// No longer needed as we won't mock them directly
// import { ImportMnemonicButton } from './ImportMnemonicButton'; 
// import { ExportMnemonicButton } from './ExportMnemonicButton';
// REMOVE unused imports
// import { MnemonicInputArea } from './MnemonicInputArea'; 
// import { GenerateMnemonicButton } from './GenerateMnemonicButton';
// import { StatusDisplay } from './StatusDisplay';

import { usePlatform } from '@paynless/platform';
import type { FileSystemCapabilities, CapabilityUnavailable } from '@paynless/types';
// Import the actual context hook return type for mocking
import type { CapabilitiesContextValue } from '@paynless/types';

// Mock the usePlatform hook
vi.mock('@paynless/platform');

// Mock Tauri core API
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// Mock Tauri dialog plugin
vi.mock('@tauri-apps/plugin-dialog', () => ({
  ask: vi.fn(),
}));

// Import invoke and ask AFTER mocking (if not already done)
import { invoke } from '@tauri-apps/api/core'; 
import { ask } from '@tauri-apps/plugin-dialog';

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
    // Check for the *real* buttons (or lack thereof in loading state)
    expect(screen.queryByTestId('import-mnemonic-button')).not.toBeInTheDocument(); 
    expect(screen.queryByTestId('export-mnemonic-button')).not.toBeInTheDocument(); 
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
    // Check for the *real* buttons (or lack thereof in loading state)
    expect(screen.queryByTestId('import-mnemonic-button')).not.toBeInTheDocument(); 
    expect(screen.queryByTestId('export-mnemonic-button')).not.toBeInTheDocument(); 
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

    // Check for unavailable alert specifically by its title
    const unavailableAlert = screen.getByRole('alert', { name: /File System Unavailable/i });
    expect(unavailableAlert).toBeInTheDocument();
    expect(within(unavailableAlert).getByText(/File System Unavailable/i)).toBeInTheDocument();
    expect(unavailableAlert).not.toHaveClass('text-destructive'); // Should be default variant

    // Check controls are rendered but disabled
    expect(screen.getByTestId('mnemonic-input')).toBeDisabled();
    expect(screen.getByTestId('generate-button')).toBeDisabled();
    const importButton = screen.getByTestId('import-mnemonic-button');
    const exportButton = screen.getByTestId('export-mnemonic-button');
    expect(importButton).toBeDisabled();
    expect(exportButton).toBeDisabled();

    // StatusDisplay might render a default state, so we don't strictly check for its absence here.
  });

  // *** Test for Available State ***
  it('should render enabled controls when file system is available', async () => {
    const mockAvailableState: CapabilitiesContextValue = {
      capabilities: { platform: 'tauri', os: 'windows', fileSystem: mockAvailableFileSystem },
      isLoadingCapabilities: false,
      capabilityError: null,
    };
    renderComponent(mockAvailableState);

    // Ensure specific error/unavailable alerts are NOT present
    expect(screen.queryByRole('alert', { name: /Error Loading Capabilities/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert', { name: /File System Unavailable/i })).not.toBeInTheDocument();
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBe(0);

    // Check controls are rendered and enabled (Export initially disabled due to empty mnemonic)
    expect(screen.getByTestId('mnemonic-input')).toBeEnabled();
    expect(screen.getByTestId('generate-button')).toBeEnabled();
    const importButton = screen.getByTestId('import-mnemonic-button');
    const exportButton = screen.getByTestId('export-mnemonic-button');
    expect(importButton).toBeEnabled();
    expect(exportButton).toBeDisabled(); // Initially disabled

    // Simulate typing to enable export
    const textArea = screen.getByTestId('mnemonic-input');
    fireEvent.change(textArea, { target: { value: 'test mnemonic twelve words minimum required' } });
    
    // Use waitFor to check for the button becoming enabled due to state change
    await waitFor(() => {
        expect(exportButton).toBeEnabled();
    });
  });

  // --- Test Export Flow --- 
  describe('Export Flow', () => {
    const mockAvailableState: CapabilitiesContextValue = {
      capabilities: { platform: 'tauri', os: 'windows', fileSystem: mockAvailableFileSystem },
      isLoadingCapabilities: false,
      capabilityError: null,
    };
    const testMnemonic = 'legal winner thank year wave sausage worth useful legal winner thank yellow';

    it('should handle successful export flow', async () => {
      renderComponent(mockAvailableState);
      const textArea = screen.getByTestId('mnemonic-input');
      const exportButton = screen.getByTestId('export-mnemonic-button');
      // const statusDisplay = screen.queryByTestId('status-display'); // Initial check removed
      expect(screen.queryByTestId('status-display')).not.toBeInTheDocument();

      // Setup mocks for success
      const mockSavePath = '/fake/export-mnemonic.txt';
      const exportedMnemonicFromBackend = 'export different winner thank wave sausage worth useful legal winner thank yellow';
      const expectedEncodedData = new TextEncoder().encode(exportedMnemonicFromBackend);
      vi.mocked(ask).mockResolvedValue(true); // User confirms dialog
      vi.mocked(invoke).mockResolvedValue(exportedMnemonicFromBackend); // Backend returns mnemonic
      vi.mocked(mockAvailableFileSystem.pickSaveFile).mockResolvedValue(mockSavePath);
      vi.mocked(mockAvailableFileSystem.writeFile).mockResolvedValue(undefined); // Write succeeds

      // Enable button and click
      fireEvent.change(textArea, { target: { value: testMnemonic } });
      await waitFor(() => expect(exportButton).toBeEnabled());
      fireEvent.click(exportButton);

      // Wait for async operations and check status
      await waitFor(() => {
          expect(ask).toHaveBeenCalledTimes(1);
          expect(invoke).toHaveBeenCalledWith('export_mnemonic');
          expect(mockAvailableFileSystem.pickSaveFile).toHaveBeenCalledTimes(1);
          expect(mockAvailableFileSystem.writeFile).toHaveBeenCalledWith(mockSavePath, expectedEncodedData);
      });

      // Check final status display
      const finalStatus = await screen.findByTestId('status-display');
      expect(finalStatus).toHaveTextContent('Mnemonic exported successfully!');
      expect(finalStatus).toHaveAttribute('data-variant', 'success');
      // Ensure mnemonic input wasn't changed
      expect(textArea).toHaveValue(testMnemonic);
    });

    it('should handle export flow with backend error', async () => {
      renderComponent(mockAvailableState);
      const textArea = screen.getByTestId('mnemonic-input');
      const exportButton = screen.getByTestId('export-mnemonic-button');
      const initialMnemonic = 'some previous mnemonic value here please';
      fireEvent.change(textArea, { target: { value: initialMnemonic } });
      await waitFor(() => expect(exportButton).toBeEnabled());

      // Setup mocks for backend failure
      const backendError = 'CouldNotRetrieveMnemonic';
      vi.mocked(ask).mockResolvedValue(true); // User confirms dialog
      vi.mocked(invoke).mockRejectedValue(backendError); // Mock invoke rejection

      // Click export
      fireEvent.click(exportButton);

      // Wait for async operations and check status
      await waitFor(() => {
        expect(ask).toHaveBeenCalledTimes(1);
        expect(invoke).toHaveBeenCalledWith('export_mnemonic');
        expect(mockAvailableFileSystem.pickSaveFile).not.toHaveBeenCalled(); // Should not be called
        expect(mockAvailableFileSystem.writeFile).not.toHaveBeenCalled(); // Should not be called
      });

      // Check final status display
      const finalStatus = await screen.findByTestId('status-display');
      expect(finalStatus).toHaveTextContent(`Export Error: ${backendError}`);
      expect(finalStatus).toHaveAttribute('data-variant', 'error');
      // Ensure mnemonic input wasn't changed
      expect(textArea).toHaveValue(initialMnemonic);
    });

    it('should handle export flow with file write error', async () => {
      renderComponent(mockAvailableState);
      const textArea = screen.getByTestId('mnemonic-input');
      const exportButton = screen.getByTestId('export-mnemonic-button');
      fireEvent.change(textArea, { target: { value: testMnemonic } });
      await waitFor(() => expect(exportButton).toBeEnabled());

      // Setup mocks for file write failure
      const mockSavePath = '/fake/export-mnemonic.txt';
      const exportedMnemonicFromBackend = 'export different winner thank wave sausage worth useful legal winner thank yellow';
      const writeError = new Error('Disk full');
      vi.mocked(ask).mockResolvedValue(true); 
      vi.mocked(invoke).mockResolvedValue(exportedMnemonicFromBackend); 
      vi.mocked(mockAvailableFileSystem.pickSaveFile).mockResolvedValue(mockSavePath);
      vi.mocked(mockAvailableFileSystem.writeFile).mockRejectedValue(writeError); // Write fails

      // Click export
      fireEvent.click(exportButton);

      // Wait for async operations and check status
      await waitFor(() => {
        expect(ask).toHaveBeenCalledTimes(1);
        expect(invoke).toHaveBeenCalledWith('export_mnemonic');
        expect(mockAvailableFileSystem.pickSaveFile).toHaveBeenCalledTimes(1);
        expect(mockAvailableFileSystem.writeFile).toHaveBeenCalledTimes(1); // It was called
      });

      // Check final status display
      const finalStatus = await screen.findByTestId('status-display');
      expect(finalStatus).toHaveTextContent(`Export Error: ${writeError.message}`);
      expect(finalStatus).toHaveAttribute('data-variant', 'error');
      // Ensure mnemonic input wasn't changed
      expect(textArea).toHaveValue(testMnemonic);
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

  // --- NEW TEST for Clear Button ---
  it('should render a Clear button and reset state on click', async () => {
    const mockAvailableState: CapabilitiesContextValue = {
      capabilities: { platform: 'tauri', os: 'windows', fileSystem: mockAvailableFileSystem },
      isLoadingCapabilities: false,
      capabilityError: null,
    };
    renderComponent(mockAvailableState);

    const textArea = screen.getByTestId('mnemonic-input');
    const clearButton = screen.getByTestId('clear-button');
    const generateButton = screen.getByTestId('generate-button');

    // Initial state: clear button might be enabled, text area empty
    expect(clearButton).toBeInTheDocument();
    expect(textArea).toHaveValue('');
    expect(screen.queryByTestId('status-display')).not.toBeInTheDocument(); // No status initially

    // Simulate generating a mnemonic (which sets state)
    fireEvent.click(generateButton);

    // Wait for state to update (mnemonic and status)
    let generatedMnemonic = '';
    await waitFor(() => {
      generatedMnemonic = (textArea as HTMLTextAreaElement).value;
      expect(generatedMnemonic).not.toBe('');
      expect(screen.getByTestId('status-display')).toBeInTheDocument();
    });
    expect(screen.getByTestId('status-display')).toHaveTextContent(/Mnemonic generated successfully/i);

    // Click the clear button
    fireEvent.click(clearButton);

    // Wait for state to reset
    await waitFor(() => {
      expect(textArea).toHaveValue('');
      // Status should ideally be cleared (or reset to info if handleClear does that)
      // Depending on StatusDisplay mock, it might disappear if message is null
      expect(screen.queryByTestId('status-display')).not.toBeInTheDocument(); 
    });

    // Optionally, check if action loading state was reset if applicable
    // (Need to simulate an action first if testing that)
  });
  // ---------------------------------

}); 