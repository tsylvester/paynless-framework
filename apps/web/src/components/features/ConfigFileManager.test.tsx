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
        vi.mocked(mockAvailableFileSystem.pickFile).mockClear().mockResolvedValue(null); // Default mock behaviour (cancelled)
        vi.mocked(mockAvailableFileSystem.readFile).mockClear().mockResolvedValue(new Uint8Array());
        vi.mocked(mockAvailableFileSystem.pickSaveFile).mockClear().mockResolvedValue(null); // Default mock behaviour (cancelled)
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
    renderComponent(mockAvailableState); // Use the pre-defined available state
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBe(0);
    expect(screen.getByRole('button', { name: /Load Config/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Save Config/i })).toBeEnabled();
  });

  // --- Interaction Tests ---

  describe('Load Button Interactions', () => {
    it('should NOT call pickFile yet when Load Config button is clicked (placeholder)', async () => {
      renderComponent(mockAvailableState);
      const loadButton = screen.getByRole('button', { name: /Load Config/i });

      fireEvent.click(loadButton);

      await waitFor(() => {});

      expect(mockAvailableFileSystem.pickFile).not.toHaveBeenCalled();
      expect(mockAvailableFileSystem.readFile).not.toHaveBeenCalled();
    });

    // Add tests here later for when pickFile *returns* a path,
    // triggering readFile (once the component implements this)
    // it('should call readFile if a file is picked', async () => { ... });
    // it('should handle readFile errors', async () => { ... });

  });

  describe('Save Button Interactions', () => {
     it('should NOT call pickSaveFile yet when Save Config button is clicked (placeholder)', async () => {
      renderComponent(mockAvailableState);
      const saveButton = screen.getByRole('button', { name: /Save Config/i });

      fireEvent.click(saveButton);

      await waitFor(() => {});

      expect(mockAvailableFileSystem.pickSaveFile).not.toHaveBeenCalled();
      expect(mockAvailableFileSystem.writeFile).not.toHaveBeenCalled();
    });

    // Add tests here later for when pickSaveFile *returns* a path,
    // triggering writeFile (once the component implements this)
    // it('should call writeFile if a save path is picked', async () => { ... });
    // it('should handle writeFile errors', async () => { ... });

  });

}); 