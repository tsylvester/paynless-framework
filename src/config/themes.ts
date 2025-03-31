import { Theme, ThemeColors } from '../types/theme.types';

// Light mode base colors
const lightColors: ThemeColors = {
  primary: '#007AFF',
  secondary: '#34C759',
  background: '#FFFFFF',
  surface: '#F2F2F7',
  textPrimary: '#000000',
  textSecondary: '#3C3C43',
  border: '#C7C7CC',
};

// Dark mode base colors
const darkColors: ThemeColors = {
  primary: '#0A84FF',
  secondary: '#32D74B',
  background: '#000000',
  surface: '#1C1C1E',
  textPrimary: '#FFFFFF',
  textSecondary: '#EBEBF5',
  border: '#3A3A3C',
};

// Color blind friendly themes
const protanopiaColors: ThemeColors = {
  primary: '#0072B2',
  secondary: '#E69F00',
  background: '#F5F5F5',
  surface: '#DADADA',
  textPrimary: '#000000',
  textSecondary: '#555555',
  border: '#BDBDBD',
};

const deuteranopiaColors: ThemeColors = {
  primary: '#0072B2',
  secondary: '#E69F00',
  background: '#F5F5F5',
  surface: '#DADADA',
  textPrimary: '#000000',
  textSecondary: '#555555',
  border: '#BDBDBD',
};

const tritanopiaColors: ThemeColors = {
  primary: '#FF4500',
  secondary: '#008000',
  background: '#F5F5F5',
  surface: '#DADADA',
  textPrimary: '#000000',
  textSecondary: '#555555',
  border: '#BDBDBD',
};

// Theme definitions
export const themes: Record<string, Theme> = {
  light: {
    name: 'Light',
    colors: lightColors,
    isDark: false,
  },
  dark: {
    name: 'Dark',
    colors: darkColors,
    isDark: true,
  },
  protanopia: {
    name: 'Protanopia',
    colors: protanopiaColors,
    isDark: false,
  },
  deuteranopia: {
    name: 'Deuteranopia',
    colors: deuteranopiaColors,
    isDark: false,
  },
  tritanopia: {
    name: 'Tritanopia',
    colors: tritanopiaColors,
    isDark: false,
  },
  red: {
    name: 'Red',
    colors: {
      primary: '#E63946',
      secondary: '#F4A261',
      background: '#F8E9E9',
      surface: '#FFE0E0',
      textPrimary: '#661C1C',
      textSecondary: '#993232',
      border: '#D46A6A',
    },
    isDark: false,
  },
  blue: {
    name: 'Blue',
    colors: {
      primary: '#457B9D',
      secondary: '#E63946',
      background: '#E3F2FD',
      surface: '#BBDEFB',
      textPrimary: '#0D47A1',
      textSecondary: '#1565C0',
      border: '#64B5F6',
    },
    isDark: false,
  },
  green: {
    name: 'Green',
    colors: {
      primary: '#2A9D8F',
      secondary: '#E76F51',
      background: '#E8F5E9',
      surface: '#C8E6C9',
      textPrimary: '#004D40',
      textSecondary: '#00796B',
      border: '#81C784',
    },
    isDark: false,
  },
};

// Get dark version of a theme
export const getDarkTheme = (theme: Theme): Theme => {
  const darkTheme = { ...theme };
  darkTheme.isDark = true;
  darkTheme.name = `${theme.name} Dark`;
  
  // Adjust colors for dark mode
  const colors = { ...theme.colors };
  colors.background = '#000000';
  colors.surface = '#1C1C1E';
  colors.textPrimary = '#FFFFFF';
  colors.textSecondary = '#EBEBF5';
  colors.border = '#3A3A3C';
  
  // Lighten primary and secondary colors
  colors.primary = lightenColor(colors.primary, 0.2);
  colors.secondary = lightenColor(colors.secondary, 0.2);
  
  darkTheme.colors = colors;
  return darkTheme;
};

// Helper function to lighten a color
function lightenColor(color: string, amount: number): string {
  const hex = color.replace('#', '');
  const num = parseInt(hex, 16);
  const r = Math.min(255, ((num >> 16) & 0xff) + Math.floor(255 * amount));
  const g = Math.min(255, ((num >> 8) & 0xff) + Math.floor(255 * amount));
  const b = Math.min(255, (num & 0xff) + Math.floor(255 * amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}