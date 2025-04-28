import React, { createContext, useEffect, useState, useCallback } from 'react';
import { Theme, ThemeState, ColorMode, ThemeName, ThemeColors } from '@paynless/types';
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
  
  const initialThemeName = localStorage.getItem('themeName') as ThemeName || 'light';
  
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
    
    // Determine if the final theme should be dark
    const baseTheme = themes[themeName] || themes['light'];
    const finalTheme = colorMode === 'dark' ? getDarkTheme(baseTheme) : baseTheme;
    const isDark = finalTheme.isDark;

    // Add/remove dark class for Tailwind
    root.classList.toggle('dark', isDark);

    // Update the state with the final theme
    setCurrentTheme(finalTheme);
    
    // Map color names to CSS variable names (camelCase to kebab-case)
    const cssVarMap: Record<keyof ThemeColors, string> = {
      primary: '--primary',
      secondary: '--secondary',
      background: '--background',
      surface: '--surface',
      textPrimary: '--text-primary',
      textSecondary: '--text-secondary',
      border: '--border',
      // New notification colors
      successBackground: '--success-background',
      successForeground: '--success-foreground',
      attentionBackground: '--attention-background',
      attentionForeground: '--attention-foreground',
    };

    // Clear previous theme variables first (optional but good practice)
    // Object.values(cssVarMap).forEach(varName => root.style.removeProperty(varName));

    // Apply new theme variables
    Object.entries(finalTheme.colors).forEach(([key, value]) => {
      const varName = cssVarMap[key as keyof ThemeColors];
      if (varName && value) {
          // Convert hex to RGB string for use with Tailwind opacity modifiers if needed
          root.style.setProperty(varName, hexToRgbString(value));
      } else {
          console.warn(`ThemeContext: Missing CSS variable mapping or color value for key: ${key}`);
      }
    });
  }, [colorMode, themeName]); // Removed getCurrentTheme from deps as it's defined inside effect scope effectively
  
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