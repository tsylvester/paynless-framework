import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import WalletBackupDemo from './WalletBackupDemo';
import { usePlatform } from '@paynless/platform'; // Import the hook type for mocking
import { FileSystemCapabilities, PlatformCapabilities } from '@paynless/types';

// Define the actual return type of the hook for clarity
type UsePlatformReturnType = {
  platformCapabilities: PlatformCapabilities | null;
  isLoadingCapabilities: boolean;
  capabilityError: Error | null;
};

// Mock the usePlatform hook to be configurable per test
vi.mock('@paynless/platform');

// Helper function to render with specific mocked capabilities
const renderComponent = (mockReturnValue: UsePlatformReturnType) => {
  // The mockReturnValue is already typed, no need to re-type the mock function itself here
  vi.mocked(usePlatform).mockReturnValue(mockReturnValue);
  return render(<WalletBackupDemo />);
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

describe('WalletBackupDemo Component', () => {
  it('should render the basic structure', () => {
    // Test with loading state initially to ensure base elements render
    const mockLoadingState: UsePlatformReturnType = {
      platformCapabilities: null,
      isLoadingCapabilities: true,
      capabilityError: null,
    };
    renderComponent(mockLoadingState);
    expect(screen.getByRole('heading', { name: /Wallet Backup\/Recovery Demo/i })).toBeInTheDocument();
  });

  it('should render loading state (skeleton) when capabilities are loading', () => {
    const mockLoadingState: UsePlatformReturnType = {
      platformCapabilities: null,
      isLoadingCapabilities: true,
      capabilityError: null,
    };
    renderComponent(mockLoadingState);

    // Expect skeleton placeholders for buttons and text area
    // Using placeholder text as a proxy for skeletons for now
    expect(screen.getByText(/Loading capabilities.../i)).toBeInTheDocument(); // Placeholder text
    // A more robust test might query for specific skeleton component roles or test IDs
  });

  it('should render unavailable state when file system is unavailable', () => {
    const mockUnavailableState: UsePlatformReturnType = {
      platformCapabilities: {
        platform: 'web',
        os: 'unknown',
        fileSystem: { isAvailable: false },
        // Add other capabilities as unavailable if defined in PlatformCapabilities
      },
      isLoadingCapabilities: false,
      capabilityError: null,
    };
    renderComponent(mockUnavailableState);

    // Check for the informative message
    expect(screen.getByText(/File operations require the Desktop app./i)).toBeInTheDocument();

    // Check that buttons are present but disabled (assuming they exist)
    const importButton = screen.getByRole('button', { name: /Import Mnemonic from File/i });
    const exportButton = screen.getByRole('button', { name: /Export Mnemonic to File/i });
    expect(importButton).toBeInTheDocument();
    expect(importButton).toBeDisabled();
    expect(exportButton).toBeInTheDocument();
    expect(exportButton).toBeDisabled();

    // Text area might still be rendered but potentially read-only or also disabled
    expect(screen.getByRole('textbox', { name: /mnemonic phrase/i })).toBeInTheDocument();
  });

  it('should render available state with enabled controls when file system is available', () => {
    const mockAvailableState: UsePlatformReturnType = {
      platformCapabilities: {
        platform: 'tauri',
        os: 'windows',
        fileSystem: mockAvailableFileSystem,
        // Add other capabilities as unavailable if defined in PlatformCapabilities
      },
      isLoadingCapabilities: false,
      capabilityError: null,
    };
    renderComponent(mockAvailableState);

    // Check that buttons are present and enabled
    const importButton = screen.getByRole('button', { name: /Import Mnemonic from File/i });
    const exportButton = screen.getByRole('button', { name: /Export Mnemonic to File/i });
    expect(importButton).toBeInTheDocument();
    expect(importButton).toBeEnabled();
    expect(exportButton).toBeInTheDocument();
    expect(exportButton).toBeEnabled();

    // Check that the text area is present and enabled
    expect(screen.getByRole('textbox', { name: /mnemonic phrase/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /mnemonic phrase/i })).toBeEnabled();

    // Check that the unavailable message is NOT present
    expect(screen.queryByText(/File operations require the Desktop app./i)).not.toBeInTheDocument();
  });

  // Add more tests later for interactions (button clicks, file operations)
}); 