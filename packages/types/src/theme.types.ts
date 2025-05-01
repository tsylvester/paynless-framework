export interface ThemeColors {
  primary: string;
  secondary: string;
  background: string;
  surface: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
  successBackground: string;
  successForeground: string;
  attentionBackground: string;
  attentionForeground: string;
}

export interface Theme {
  name: string;
  colors: ThemeColors;
  isDark: boolean;
}

export type ColorMode = 'light' | 'dark';

export type ThemeName = 
  | 'light'
  | 'dark'
  | 'protanopia'
  | 'deuteranopia'
  | 'tritanopia'
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'indigo'
  | 'violet';

export interface ThemeState {
  currentTheme: Theme;
  colorMode: ColorMode;
  setColorMode: (mode: ColorMode) => void;
  setTheme: (themeName: ThemeName) => void;
}