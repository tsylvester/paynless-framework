import React, { useState } from 'react';
import { useTheme } from '../../context/theme.context';
import { themes } from '../../config/themes';
import { Moon, Sun, Palette, Check } from 'lucide-react';
import { ThemeName } from '../../types/theme.types';

export function ThemeSelector() {
  const { colorMode, currentTheme, setColorMode, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  
  const handleThemeChange = (themeName: ThemeName) => {
    setTheme(themeName);
    setIsOpen(false);
  };
  
  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-3 py-2 rounded-lg border border-border bg-surface hover:bg-opacity-80"
      >
        <div className="flex items-center">
          {colorMode === 'dark' ? (
            <Moon className="h-5 w-5 text-textSecondary" />
          ) : (
            <Sun className="h-5 w-5 text-textSecondary" />
          )}
        </div>
        <div
          className="w-4 h-4 rounded-full"
          style={{ backgroundColor: currentTheme.colors.primary }}
        />
        <span className="text-sm text-textPrimary">{currentTheme.name}</span>
      </button>
      
      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-surface rounded-lg shadow-xl border border-border z-50">
          {/* Color mode section */}
          <div className="p-4 border-b border-border">
            <h3 className="text-sm font-medium text-textPrimary mb-3">Color Mode</h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setColorMode('light')}
                className={`flex items-center justify-center p-3 rounded-lg border ${
                  colorMode === 'light'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-textSecondary hover:border-primary/50'
                }`}
              >
                <Sun className="h-5 w-5 mr-2" />
                Light
                {colorMode === 'light' && (
                  <Check className="h-4 w-4 ml-2" />
                )}
              </button>
              
              <button
                onClick={() => setColorMode('dark')}
                className={`flex items-center justify-center p-3 rounded-lg border ${
                  colorMode === 'dark'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-textSecondary hover:border-primary/50'
                }`}
              >
                <Moon className="h-5 w-5 mr-2" />
                Dark
                {colorMode === 'dark' && (
                  <Check className="h-4 w-4 ml-2" />
                )}
              </button>
            </div>
          </div>
          
          {/* Theme section */}
          <div className="p-4">
            <h3 className="text-sm font-medium text-textPrimary mb-3">Theme</h3>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(themes).map(([key, theme]) => (
                <button
                  key={key}
                  onClick={() => handleThemeChange(key as ThemeName)}
                  className={`flex items-center p-3 rounded-lg border ${
                    currentTheme.name === theme.name
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div
                    className="w-4 h-4 rounded-full mr-2"
                    style={{ backgroundColor: theme.colors.primary }}
                  />
                  <span className={`text-sm ${
                    currentTheme.name === theme.name
                      ? 'text-primary'
                      : 'text-textSecondary'
                  }`}>
                    {theme.name}
                  </span>
                  {currentTheme.name === theme.name && (
                    <Check className="h-4 w-4 ml-auto text-primary" />
                  )}
                </button>
              ))}
            </div>
          </div>
          
          {/* Accessibility section */}
          <div className="p-4 border-t border-border">
            <h3 className="text-sm font-medium text-textPrimary mb-3">Accessibility</h3>
            <div className="grid grid-cols-1 gap-2">
              {['protanopia', 'deuteranopia', 'tritanopia'].map((key) => (
                <button
                  key={key}
                  onClick={() => handleThemeChange(key as ThemeName)}
                  className={`flex items-center p-3 rounded-lg border ${
                    currentTheme.name.toLowerCase() === key
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <Palette className={`h-5 w-5 mr-2 ${
                    currentTheme.name.toLowerCase() === key
                      ? 'text-primary'
                      : 'text-textSecondary'
                  }`} />
                  <span className={`text-sm ${
                    currentTheme.name.toLowerCase() === key
                      ? 'text-primary'
                      : 'text-textSecondary'
                  }`}>
                    {key.charAt(0).toUpperCase() + key.slice(1)}
                  </span>
                  {currentTheme.name.toLowerCase() === key && (
                    <Check className="h-4 w-4 ml-auto text-primary" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}