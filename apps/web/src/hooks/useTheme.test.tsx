import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { useTheme } from '../../context/ThemeContext';
// Import the actual context and provider
import { ThemeContext, ThemeProvider } from '../context/theme.context'; 
// Import supporting types used by the real context
import type { Theme, ColorMode, ThemeName, ThemeState } from '@paynless/types';

// Define a basic mock theme object for the mock context
const mockTheme: Theme = {
    name: 'mock-theme',
    colors: { // Provide some basic color structure if needed by tests
        primary: '#000000',
        secondary: '#111111',
        background: '#FFFFFF',
        surface: '#EEEEEE',
        textPrimary: '#222222',
        textSecondary: '#555555',
        // Add other required colors
    }
};

// Mock ThemeContext value matching the REAL ThemeState structure
const mockContextValue: ThemeState = {
  currentTheme: mockTheme, // Use the mock Theme object
  colorMode: 'dark',       // Mock the colorMode
  setColorMode: vi.fn(),    // Mock the functions
  setTheme: vi.fn(),
};

describe('useTheme Hook', () => {

  it('should throw an error if used outside of a ThemeProvider', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const renderWithoutProvider = () => renderHook(() => useTheme());
    expect(renderWithoutProvider).toThrow('useTheme must be used within a ThemeProvider');
    errSpy.mockRestore();
  });

  it('should return the theme context value when used within a mock ThemeProvider', () => {
    // Wrapper using the mock context value
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ThemeContext.Provider value={mockContextValue}>
        {children}
      </ThemeContext.Provider>
    );
    const { result } = renderHook(() => useTheme(), { wrapper });

    // Assert against the structure of the mock context value
    expect(result.current).toEqual(mockContextValue);
    expect(result.current.colorMode).toBe('dark');
    expect(result.current.currentTheme.name).toBe('mock-theme');
  });
  
  it('should return the value from the actual ThemeProvider if used', () => {
    // Wrapper using the real ThemeProvider logic
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      // Provide necessary props if ThemeProvider requires them, or use defaults
      // NOTE: ThemeProvider initializes from localStorage/system preference.
      // We might need to mock localStorage or matchMedia for predictable results.
      <ThemeProvider>
        {children}
      </ThemeProvider>
    );
    const { result } = renderHook(() => useTheme(), { wrapper });

    // Assert the initial value based on ThemeProvider's default logic (likely 'light')
    // Check the 'colorMode' property, not 'theme'
    expect(result.current.colorMode).toBe('light'); 
    expect(result.current.currentTheme).toBeDefined(); // Check that a theme object exists
    // Optionally test setTheme/setColorMode interaction
    act(() => {
        result.current.setColorMode('dark');
    });
    expect(result.current.colorMode).toBe('dark'); 
  });

}); 