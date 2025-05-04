import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@/tests/utils/render'; // Use shared render util
import ConfigFileManager from './ConfigFileManager';
import { usePlatform } from '@paynless/platform';
import type { FileSystemCapabilities, CapabilityUnavailable, CapabilitiesContextValue } from '@paynless/types';
import { within } from '@testing-library/react'; // Import within

// Mock the usePlatform hook
vi.mock('@paynless/platform');

// Mock file system capabilities
const mockAvailableFileSystem: FileSystemCapabilities = {
  isAvailable: true,
  readFile: vi.fn(),
  writeFile: vi.fn(),
  pickFile: vi.fn(),
  pickDirectory: vi.fn(), // Assuming it exists in the type
  pickSaveFile: vi.fn(),
};

const mockUnavailableFileSystem: CapabilityUnavailable = {
  isAvailable: false,
};


// Helper function to render with specific mocked platform state
const renderComponent = (mockReturnValue: CapabilitiesContextValue) => {
  vi.mocked(usePlatform).mockReturnValue(mockReturnValue);
  // Pass default props or customize as needed
  return render(<ConfigFileManager configName="test-config" />);
};

// Define the state needed for interaction tests
const mockAvailableState: CapabilitiesContextValue = {
    capabilities: { platform: 'tauri', os: 'windows', fileSystem: mockAvailableFileSystem },
    isLoadingCapabilities: false,
    capabilityError: null,
};

describe('ConfigFileManager Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mocks on the file system object
    if (mockAvailableFileSystem.isAvailable) {
        vi.mocked(mockAvailableFileSystem.pickFile).mockClear().mockResolvedValue(null);
        vi.mocked(mockAvailableFileSystem.readFile).mockClear().mockResolvedValue(new Uint8Array());
        vi.mocked(mockAvailableFileSystem.pickSaveFile).mockClear().mockResolvedValue(null);
        vi.mocked(mockAvailableFileSystem.writeFile).mockClear().mockResolvedValue(undefined);
    }
  });

  it('should render the basic structure heading', () => {
    const mockLoadingState: CapabilitiesContextValue = {
      capabilities: null,
      isLoadingCapabilities: true,
      capabilityError: null
    };
    renderComponent(mockLoadingState);
    expect(screen.getByRole('heading', { name: /Config File Manager \(test-config\)/i })).toBeInTheDocument();
  });

  it('should render skeleton loaders when capabilities are loading', () => {
    const mockLoadingState: CapabilitiesContextValue = {
      capabilities: null,
      isLoadingCapabilities: true,
      capabilityError: null
    };
    const { container } = renderComponent(mockLoadingState);
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('should render error alert when platform hook returns an error', () => {
    const mockError = new Error('Failed badly');
    const mockErrorState: CapabilitiesContextValue = {
      capabilities: null,
      isLoadingCapabilities: false,
      capabilityError: mockError,
    };
    renderComponent(mockErrorState);
    const errorAlert = screen.getByRole('alert');
    expect(errorAlert).toBeInTheDocument();
    expect(within(errorAlert).getByText(/Capability Error/i)).toBeInTheDocument();
    expect(within(errorAlert).getByText(mockError.message)).toBeInTheDocument();
    expect(errorAlert).toHaveClass('text-destructive');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('should render unavailable alert and NOT render buttons when file system is unavailable', () => {
    const mockUnavailableState: CapabilitiesContextValue = {
      capabilities: { platform: 'web', os: 'unknown', fileSystem: mockUnavailableFileSystem },
      isLoadingCapabilities: false,
      capabilityError: null,
    };
    renderComponent(mockUnavailableState);
    const unavailableAlert = screen.getByRole('alert');
    expect(unavailableAlert).toBeInTheDocument();
    expect(within(unavailableAlert).getByText(/Desktop Only/i)).toBeInTheDocument();
    expect(unavailableAlert).not.toHaveClass('text-destructive');
    expect(screen.queryByRole('button', { name: /Load Config/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Save Config/i })).not.toBeInTheDocument();
  });

  it('should render enabled buttons when file system is available', () => {
    renderComponent(mockAvailableState);
    // Check that the *specific* unavailability alert is NOT present
    expect(screen.queryByText(/Desktop Only/i)).not.toBeInTheDocument();
    // Check that the capability error alert is also NOT present
    expect(screen.queryByText(/Capability Error/i)).not.toBeInTheDocument();

    // Ensure skeletons are gone
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBe(0);
    expect(screen.getByRole('button', { name: /Load Config/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Save Config/i })).toBeEnabled();
  });

  // --- Interaction Tests ---

  describe('Load Button Interactions', () => {
    // Test successful load via button click (uses pickFile then loadFile)
    it('should call pickFile then loadFile, decode content, display it, and populate the text area', async () => {
        const mockFilePath = '/fake/config-to-load.json';
        const mockDecodedContent = '{"config": "value", "nested": { "key": 123 } }';
        const mockEncodedContent = new TextEncoder().encode(mockDecodedContent);

        // Mock pickFile to return a path
        vi.mocked(mockAvailableFileSystem.pickFile).mockResolvedValue([mockFilePath]);
        // Mock readFile used by loadFile
        vi.mocked(mockAvailableFileSystem.readFile).mockResolvedValue(mockEncodedContent);

        renderComponent(mockAvailableState);
        const loadButton = screen.getByRole('button', { name: /Load Config/i });

        // Initial state check (optional)
        expect(screen.queryByTestId('file-content-display')).not.toBeInTheDocument();
        expect(screen.getByTestId('config-input-area')).toHaveValue('');

        fireEvent.click(loadButton);

        // Wait for readFile to be called (indicates loadFile was executed)
        await waitFor(() => {
             expect(mockAvailableFileSystem.pickFile).toHaveBeenCalledTimes(1); // Ensure picker was called
             expect(mockAvailableFileSystem.readFile).toHaveBeenCalledTimes(1);
             expect(mockAvailableFileSystem.readFile).toHaveBeenCalledWith(mockFilePath);
        });

        // Assert displays are updated
        const displayArea = screen.getByTestId('file-content-display');
        expect(displayArea).toBeInTheDocument();
        expect(displayArea.innerHTML).toBe(mockDecodedContent);
        const textArea = screen.getByTestId('config-input-area');
        expect(textArea).toHaveValue(mockDecodedContent);

        // Also check the success status message
        await waitFor(() => {
            const statusDisplay = screen.getByTestId('status-display');
            // Check that title and description are present
            expect(within(statusDisplay).getByText('Success')).toBeInTheDocument(); 
            expect(within(statusDisplay).getByText(/File loaded successfully/i)).toBeInTheDocument();
        });
    });
    // Test for pickFile cancellation (should not call loadFile/readFile)
    it('should show cancellation message and not call readFile if pickFile is cancelled', async () => {
      vi.mocked(mockAvailableFileSystem.pickFile).mockResolvedValue(null);
      renderComponent(mockAvailableState);
      const loadButton = screen.getByRole('button', { name: /Load Config/i });
      fireEvent.click(loadButton);

      // Wait for pickFile to resolve
      await waitFor(() => {
        expect(mockAvailableFileSystem.pickFile).toHaveBeenCalledTimes(1);
      });
      // Ensure readFile was NOT called
      expect(mockAvailableFileSystem.readFile).not.toHaveBeenCalled();

      const statusDisplay = screen.getByTestId('status-display');
      await waitFor(() => {
        expect(statusDisplay).toHaveTextContent('File selection cancelled.');
      });
    });

    // Test for readFile error during loadFile
    it('should show error message if readFile fails during load', async () => {
        const mockFilePath = '/fake/error-config.json';
        const mockReadError = new Error('Permission denied');
        vi.mocked(mockAvailableFileSystem.pickFile).mockResolvedValue([mockFilePath]);
        vi.mocked(mockAvailableFileSystem.readFile).mockRejectedValue(mockReadError);

        renderComponent(mockAvailableState);
        const loadButton = screen.getByRole('button', { name: /Load Config/i });
        fireEvent.click(loadButton);

        // Wait for readFile attempt
        await waitFor(() => {
          expect(mockAvailableFileSystem.readFile).toHaveBeenCalledTimes(1);
        });

        // Assert error status
        const statusDisplay = screen.getByTestId('status-display');
        await waitFor(() => {
          expect(statusDisplay).toHaveTextContent(/Load Error: Permission denied/i);
        });
    });
  });

  describe('Save Button Interactions', () => {
    // ----- Test for successful save -----
    it('should call writeFile with the correct path and content from text area', async () => {
        const mockSavePath = '/fake/config-to-save.json';
        const mockContentToSave = '{"userSetting": true}';
        const mockEncodedContentToSave = new TextEncoder().encode(mockContentToSave);
        // Mock pickSaveFile to succeed
        vi.mocked(mockAvailableFileSystem.pickSaveFile).mockResolvedValue(mockSavePath);
        // Mock writeFile to succeed (we'll check args later)
        vi.mocked(mockAvailableFileSystem.writeFile).mockResolvedValue(undefined);

        renderComponent(mockAvailableState);

        // Simulate user typing content into the TextInputArea
        const textArea = screen.getByTestId('config-input-area');
        fireEvent.change(textArea, { target: { value: mockContentToSave } });

        const saveButton = screen.getByRole('button', { name: /Save Config/i });

        fireEvent.click(saveButton);

        // Wait for pickSaveFile and writeFile to be called
        await waitFor(() => {
          expect(mockAvailableFileSystem.pickSaveFile).toHaveBeenCalledTimes(1);
          expect(mockAvailableFileSystem.writeFile).toHaveBeenCalledTimes(1);
        });

        // Assert that writeFile IS called with the path AND the encoded content from the text area
        await waitFor(() => {
          expect(mockAvailableFileSystem.writeFile).toHaveBeenCalledWith(mockSavePath, mockEncodedContentToSave);
        });

        // Assert status display shows success
        const statusDisplay = screen.getByTestId('status-display');
        // Find the description within the alert and check its content
        const description = within(statusDisplay).getByText(/Config saved successfully/i); 
        expect(description).toBeInTheDocument();
    });
    // ---------------------------------------------

    // Test user cancelling the save file picker
    it('should show cancellation message and not call writeFile if pickSaveFile is cancelled', async () => {
      // Ensure pickSaveFile resolves to null
      vi.mocked(mockAvailableFileSystem.pickSaveFile).mockResolvedValue(null);

      renderComponent(mockAvailableState);

      // Simulate having content to save
      const textArea = screen.getByTestId('config-input-area');
      fireEvent.change(textArea, { target: { value: 'some content' } });

      const saveButton = screen.getByRole('button', { name: /Save Config/i });

      fireEvent.click(saveButton);

      // Wait for status update and ensure writeFile is not called
      await waitFor(() => {
        expect(mockAvailableFileSystem.pickSaveFile).toHaveBeenCalledTimes(1);
        expect(mockAvailableFileSystem.writeFile).not.toHaveBeenCalled();
      });

      // Assert the status display shows the cancellation message
      // This assertion should fail initially
      const statusDisplay = screen.getByTestId('status-display'); 
      expect(statusDisplay).toHaveTextContent(/File save cancelled/i);
    });

    // ----- NEW TEST for saving with empty content -----
    it('should show error and not call pickSaveFile if content is empty', async () => {
      renderComponent(mockAvailableState);
      const saveButton = screen.getByRole('button', { name: /Save Config/i });

      // Ensure text area is empty (default state)
      expect(screen.getByTestId('config-input-area')).toHaveValue('');

      fireEvent.click(saveButton);

      // Assert pickSaveFile and writeFile were NOT called
      expect(mockAvailableFileSystem.pickSaveFile).not.toHaveBeenCalled();
      expect(mockAvailableFileSystem.writeFile).not.toHaveBeenCalled();

      // Assert error status is shown
      await waitFor(() => {
        const statusDisplay = screen.getByTestId('status-display');
        expect(statusDisplay).toHaveTextContent(/No content to save/i);
        // Check title is correct for error variant
        expect(within(statusDisplay).getByText('Error')).toBeInTheDocument(); 
      });
    });

    // ----- Test for writeFile error -----
    it('should show error message if writeFile fails', async () => {
        const mockSavePath = '/fake/error-save.json';
        const mockWriteError = new Error('Disk is full');
        // Mock pickSaveFile to succeed
        vi.mocked(mockAvailableFileSystem.pickSaveFile).mockResolvedValue(mockSavePath);
        // Mock writeFile to fail
        vi.mocked(mockAvailableFileSystem.writeFile).mockRejectedValue(mockWriteError);

        renderComponent(mockAvailableState);

        // Simulate having content to save
        const textArea = screen.getByTestId('config-input-area');
        fireEvent.change(textArea, { target: { value: 'some content to cause error' } });

        const saveButton = screen.getByRole('button', { name: /Save Config/i });

        fireEvent.click(saveButton);

        // Wait for status update
        await waitFor(() => {
          expect(mockAvailableFileSystem.pickSaveFile).toHaveBeenCalledTimes(1);
          expect(mockAvailableFileSystem.writeFile).toHaveBeenCalledTimes(1);
        });

        // Assert the status display shows the error message
        // This assertion should fail initially
        const statusDisplay = screen.getByTestId('status-display');
        expect(statusDisplay).toHaveTextContent(/Save Error: Disk is full/i);
        // expect(statusDisplay).toHaveAttribute('data-variant', 'error');
    });
    // ---------------------------------------------

  });

  // --- NEW Describe Block for Directory Picking ---
  describe('Select Directory Button Interactions', () => {
    it('should render the Select Directory button when filesystem is available', () => {
      renderComponent(mockAvailableState);
      expect(screen.getByRole('button', { name: /Select Directory/i })).toBeEnabled();
    });

    it('should call pickDirectory when Select Directory button is clicked', async () => {
      renderComponent(mockAvailableState);
      const selectDirButton = screen.getByRole('button', { name: /Select Directory/i });

      fireEvent.click(selectDirButton);

      await waitFor(() => {
        expect(mockAvailableFileSystem.pickDirectory).toHaveBeenCalledTimes(1);
      });
    });

    it('should display selected directory path on success', async () => {
      const mockDirPath = ['/fake/selected-dir'];
      vi.mocked(mockAvailableFileSystem.pickDirectory).mockResolvedValue(mockDirPath);

      renderComponent(mockAvailableState);
      const selectDirButton = screen.getByRole('button', { name: /Select Directory/i });

      fireEvent.click(selectDirButton);

      // Expect StatusDisplay to show the selected path
      await waitFor(() => {
        const statusDisplay = screen.getByTestId('status-display');
        expect(statusDisplay).toHaveTextContent(`Selected directory: ${mockDirPath[0]}`);
        expect(within(statusDisplay).getByText('Information')).toBeInTheDocument(); // Check title
      });
    });

    it('should show cancellation message if pickDirectory is cancelled', async () => {
      vi.mocked(mockAvailableFileSystem.pickDirectory).mockResolvedValue(null);

      renderComponent(mockAvailableState);
      const selectDirButton = screen.getByRole('button', { name: /Select Directory/i });

      fireEvent.click(selectDirButton);

      const statusDisplay = screen.getByTestId('status-display');
      await waitFor(() => {
        expect(statusDisplay).toHaveTextContent('Directory selection cancelled.');
      });
    });

    it('should show error message if pickDirectory fails', async () => {
      const mockPickError = new Error('Cannot access directory');
      vi.mocked(mockAvailableFileSystem.pickDirectory).mockRejectedValue(mockPickError);

      renderComponent(mockAvailableState);
      const selectDirButton = screen.getByRole('button', { name: /Select Directory/i });

      fireEvent.click(selectDirButton);

      const statusDisplay = screen.getByTestId('status-display');
      await waitFor(() => {
        expect(statusDisplay).toHaveTextContent(`Directory Select Error: ${mockPickError.message}`);
         expect(within(statusDisplay).getByText('Error')).toBeInTheDocument(); // Check title
      });
    });
  });
  // -------------------------------------------

}); 