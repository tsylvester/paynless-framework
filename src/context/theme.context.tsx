import React, { createContext, useContext, useEffect, useState } from 'react';
import { Theme, ThemeState, ColorMode, ThemeName } from '../types/theme.types';
import { themes, getDarkTheme } from '../config/themes';

const ThemeContext = createContext<ThemeState>({
  currentTheme: themes.light,
  colorMode: 'light',
  setColorMode: () => {},
  setTheme: () => {},
});

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
  const getCurrentTheme = (): Theme => {
    const baseTheme = themes[themeName];
    return colorMode === 'dark' ? getDarkTheme(baseTheme) : baseTheme;
  };
  
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
  
  // Update CSS variables when theme changes
  useEffect(() => {
    const theme = getCurrentTheme();
    setCurrentTheme(theme);
    
    const root = document.documentElement;
    Object.entries(theme.colors).forEach(([key, value]) => {
      root.style.setProperty(`--color-${key}`, value);
    });
  }, [colorMode, themeName]);
  
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

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};