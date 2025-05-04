import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import WalletBackupDemoCard from './WalletBackupDemoCard';
import { usePlatform } from '@paynless/platform';
import { FileSystemCapabilities, PlatformCapabilities } from '@paynless/types';

// Define the actual return type of the hook
type UsePlatformReturnType = {
  platformCapabilities: PlatformCapabilities | null;
  isLoadingCapabilities: boolean;
  capabilityError: Error | null;
};

// Mock the usePlatform hook
vi.mock('@paynless/platform');

// Mock sub-components initially (will be rendered by WalletBackupDemoCard)
vi.mock('./MnemonicInputArea', () => ({
  MnemonicInputArea: vi.fn(({ disabled }) => (
    <textarea aria-label="mnemonic phrase" disabled={disabled}>Mock Input</textarea>
  )),
}));
vi.mock('./FileActionButtons', () => ({
  FileActionButtons: vi.fn(({ disabled }) => (
    <div>
      <button disabled={disabled}>Import Mnemonic from File</button>
      <button disabled={disabled}>Export Mnemonic to File</button>
    </div>
  )),
}));
vi.mock('./StatusDisplay', () => ({
  StatusDisplay: vi.fn(() => <div>Mock Status</div>),
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

describe('WalletBackupDemoCard Component', () => {
  it('should render the basic structure', () => {
    const mockLoadingState: UsePlatformReturnType = {
      platformCapabilities: null,
      isLoadingCapabilities: true,
      capabilityError: null,
    };
    renderComponent(mockLoadingState);
    expect(screen.getByRole('heading', { name: /Wallet Backup\/Recovery Demo/i })).toBeInTheDocument();
  });

  it('should render loading state when capabilities are loading', () => {
    const mockLoadingState: UsePlatformReturnType = {
      platformCapabilities: null,
      isLoadingCapabilities: true,
      capabilityError: null,
    };
    const { container } = renderComponent(mockLoadingState);

    // Check for the presence of Skeleton components
    // We query by a common attribute/class if possible, or check for multiple
    // Assuming the Skeleton component adds `data-slot="skeleton"` or a common class like `animate-pulse`
    // Find all elements with the pulse animation class (common for skeletons)
    const skeletons = container.querySelectorAll('.animate-pulse');
    // Expect multiple skeletons to be rendered for the loading state
    expect(skeletons.length).toBeGreaterThan(2); 

    // Optionally, check that the unavailable message is NOT present
    expect(screen.queryByText(/File operations require the Desktop app./i)).not.toBeInTheDocument();
    // Optionally, check that main content elements (buttons, textarea) are NOT present
    expect(screen.queryByRole('button', { name: /Import Mnemonic from File/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /mnemonic phrase/i })).not.toBeInTheDocument();
  });

  it('should render unavailable state when file system is unavailable', () => {
    const mockUnavailableState: UsePlatformReturnType = {
      platformCapabilities: {
        platform: 'web',
        os: 'unknown',
        fileSystem: { isAvailable: false },
      },
      isLoadingCapabilities: false,
      capabilityError: null,
    };
    renderComponent(mockUnavailableState);

    // Check for the informative message (likely rendered by the card itself)
    expect(screen.getByText(/File operations require the Desktop app./i)).toBeInTheDocument();

    // Check that sub-component buttons are disabled (passed via props)
    const importButton = screen.getByRole('button', { name: /Import Mnemonic from File/i });
    const exportButton = screen.getByRole('button', { name: /Export Mnemonic to File/i });
    expect(importButton).toBeDisabled();
    expect(exportButton).toBeDisabled();

    // Check that sub-component text area is disabled
    expect(screen.getByRole('textbox', { name: /mnemonic phrase/i })).toBeDisabled();
  });

  it('should render available state with enabled controls when file system is available', () => {
    const mockAvailableState: UsePlatformReturnType = {
      platformCapabilities: {
        platform: 'tauri',
        os: 'windows',
        fileSystem: mockAvailableFileSystem,
      },
      isLoadingCapabilities: false,
      capabilityError: null,
    };
    renderComponent(mockAvailableState);

    // Check that buttons are enabled
    const importButton = screen.getByRole('button', { name: /Import Mnemonic from File/i });
    const exportButton = screen.getByRole('button', { name: /Export Mnemonic to File/i });
    expect(importButton).toBeEnabled();
    expect(exportButton).toBeEnabled();

    // Check that the text area is enabled
    expect(screen.getByRole('textbox', { name: /mnemonic phrase/i })).toBeEnabled();

    // Check that the unavailable message is NOT present
    expect(screen.queryByText(/File operations require the Desktop app./i)).not.toBeInTheDocument();
  });

}); 