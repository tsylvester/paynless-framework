import React, { createContext, useEffect, useState, useCallback } from 'react';
import { Theme, ThemeState, ColorMode, ThemeName } from '@paynless/types';
import { themes, getDarkTheme } from '../config/themes';

// Helper function to convert hex color to RGB string
function hexToRgbString(hex: string): string {
  hex = hex.replace('#', '');
  const bigint = parseInt(hex, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `${r} ${g} ${b}`;
}

// Initialize context with null to allow detection in useTheme hook
export const ThemeContext = createContext<ThemeState | null>(null);

interface ThemeProviderProps {
  children: React.ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  // Initialize from localStorage or system preference
  const initialColorMode = localStorage.getItem('colorMode') as ColorMode || 
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  
  const initialThemeName = localStorage.getItem('themeName') as ThemeName || 'dark';
  
  const [colorMode, setColorMode] = useState<ColorMode>(initialColorMode);
  const [themeName, setThemeName] = useState<ThemeName>(initialThemeName);
  
  // Get the current theme based on theme name and color mode
  const getCurrentTheme = useCallback((): Theme => {
    const baseTheme = themes[themeName];
    return colorMode === 'dark' ? getDarkTheme(baseTheme) : baseTheme;
  }, [colorMode, themeName]);
  
  const [currentTheme, setCurrentTheme] = useState<Theme>(getCurrentTheme());
  
  // Update theme when color mode changes
  const handleColorModeChange = (mode: ColorMode) => {
    setColorMode(mode);
    localStorage.setItem('colorMode', mode);
  };
  
  // Update theme when theme name changes
  const handleThemeChange = (name: ThemeName) => {
    setThemeName(name);
    localStorage.setItem('themeName', name);
  };
  
  // Update CSS variables and manage dark class when theme changes
  useEffect(() => {
    const root = document.documentElement;
    const isDark = colorMode === 'dark';

    // Add/remove dark class for Tailwind
    root.classList.toggle('dark', isDark);

    const theme = getCurrentTheme();
    setCurrentTheme(theme);
    
    Object.entries(theme.colors).forEach(([key, value]) => {
      // Convert hex to RGB string before setting CSS variable
      root.style.setProperty(`--color-${key}`, hexToRgbString(value));
    });
  }, [colorMode, themeName, getCurrentTheme]);
  
  // Listen for system color scheme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleChange = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem('colorMode')) {
        setColorMode(e.matches ? 'dark' : 'light');
      }
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);
  
  return (
    <ThemeContext.Provider
      value={{
        currentTheme,
        colorMode,
        setColorMode: handleColorModeChange,
        setTheme: handleThemeChange,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}