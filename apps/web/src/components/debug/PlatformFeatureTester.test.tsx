import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlatformFeatureTester } from './PlatformFeatureTester';
import { usePlatform } from '@paynless/platform';
import type { Platform } from '@paynless/types';
import { logger } from '@paynless/utils';

// Mock the logger
vi.mock('@paynless/utils', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    }
}));

// Mock the hook directly
const MockCapabilitiesContext = React.createContext<Platform | null>(null);
vi.mock('@paynless/platform', async (importOriginal) => {
    const original = await importOriginal<any>();
    return {
        ...original,
        usePlatform: () => React.useContext(MockCapabilitiesContext),
    };
});

// Helper to render with the mocked hook
const renderWithMockedHook = (capabilities: Platform | null) => {
    return render(
        <MockCapabilitiesContext.Provider value={capabilities}>
            <PlatformFeatureTester />
        </MockCapabilitiesContext.Provider>
    );
};

describe('PlatformFeatureTester', () => {

  it('should display loading state initially', () => {
    renderWithMockedHook(null);
    expect(screen.getByText('Loading platform capabilities...')).toBeInTheDocument();
  });

  it('should display tauri platform info and show desktop button in tauri environment', () => {
    const tauriCaps: Platform = {
      platform: 'tauri',
      fileSystem: {
        isAvailable: true,
        pickFile: vi.fn(),
        pickSaveFile: vi.fn(),
        readFile: vi.fn(),
        writeFile: vi.fn(),
      },
    };
    renderWithMockedHook(tauriCaps);

    expect(screen.getByText(/Detected Platform:/)).toHaveTextContent('tauri');
    expect(screen.getByText(/File System Available:/)).toHaveTextContent('true');
    expect(screen.getByRole('button', { name: /Pick & Load Text File/ })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Choose file \(Web standard\):/)).not.toBeInTheDocument();
  });

  // --- Tests specifically for Tauri File System Interactions ---
  describe('when running in Tauri environment', () => {
    let mockPickFile: ReturnType<typeof vi.fn>;
    let mockReadFile: ReturnType<typeof vi.fn>;
    let mockPickSaveFile: ReturnType<typeof vi.fn>;
    let mockWriteFile: ReturnType<typeof vi.fn>;
    let tauriCaps: Platform;

    beforeEach(() => {
      mockPickFile = vi.fn();
      mockReadFile = vi.fn();
      mockPickSaveFile = vi.fn();
      mockWriteFile = vi.fn();

      tauriCaps = {
        platform: 'tauri',
        fileSystem: {
          isAvailable: true,
          pickFile: mockPickFile,
          readFile: mockReadFile,
          pickSaveFile: mockPickSaveFile,
          writeFile: mockWriteFile,
        },
      };
    });

    it('should call pickFile and readFile when pick button is clicked', async () => {
      mockPickFile.mockResolvedValue(['/picked/file.txt']);
      mockReadFile.mockResolvedValue(new TextEncoder().encode('File content'));
      renderWithMockedHook(tauriCaps);

      const button = screen.getByRole('button', { name: /Pick & Load Text File/ });
      await act(async () => {
        fireEvent.click(button);
      });

      expect(mockPickFile).toHaveBeenCalledWith({ accept: '.txt', multiple: false });
      expect(mockReadFile).toHaveBeenCalledWith('/picked/file.txt');
      expect(screen.getByRole('textbox')).toHaveValue('File content');
    });

    it('should render a save button', () => {
      renderWithMockedHook(tauriCaps);
      expect(screen.getByRole('button', { name: /Save Text File/ })).toBeInTheDocument();
    });

    it('should call pickSaveFile and writeFile when save button is clicked', async () => {
      mockPickSaveFile.mockResolvedValue('/chosen/save/path.txt');
      renderWithMockedHook(tauriCaps);

      const expectedContent = 'Test content to save';
      const expectedData = new TextEncoder().encode(expectedContent);
      const saveButton = screen.getByRole('button', { name: /Save Text File/ });
      
      await act(async () => {
        fireEvent.click(saveButton);
      });
      await act(async () => { await new Promise(res => setTimeout(res,0)); });

      expect(mockPickSaveFile).toHaveBeenCalledTimes(1);
      expect(mockPickSaveFile).toHaveBeenCalledWith({ accept: '.txt' });
      expect(mockWriteFile).toHaveBeenCalledTimes(1);
      expect(mockWriteFile).toHaveBeenCalledWith('/chosen/save/path.txt', expectedData);
    });

    it('should handle cancellation of save dialog', async () => {
      mockPickSaveFile.mockResolvedValue(null);
      renderWithMockedHook(tauriCaps);
      const loggerSpy = vi.spyOn(logger, 'info');
      const saveButton = screen.getByRole('button', { name: /Save Text File/ });
      
      await act(async () => {
        fireEvent.click(saveButton);
      });
      await act(async () => { await new Promise(res => setTimeout(res,0)); });
      
      expect(mockPickSaveFile).toHaveBeenCalledTimes(1);
      expect(mockWriteFile).not.toHaveBeenCalled();
      expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('File saving cancelled'));
      loggerSpy.mockRestore();
    });

  }); // end describe('when running in Tauri environment')

}); // end describe('PlatformFeatureTester') 