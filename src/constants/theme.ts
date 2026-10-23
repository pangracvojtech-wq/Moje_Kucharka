import { useColorScheme } from 'react-native';

export const Colors = {
  light: {
    text: '#1C1B1A',
    textSecondary: '#6B6660',
    background: '#FFFFFF',
    backgroundElement: '#F5F2EE',
    border: '#E4DFD8',
    primary: '#C2410C',
    primaryText: '#FFFFFF',
    danger: '#B91C1C',
  },
  dark: {
    text: '#F5F2EE',
    textSecondary: '#ABA59D',
    background: '#121110',
    backgroundElement: '#1F1D1B',
    border: '#34302C',
    primary: '#FB923C',
    primaryText: '#1C1B1A',
    danger: '#F87171',
  },
} as const;

export type ThemeColors = (typeof Colors)['light'] | (typeof Colors)['dark'];

export const Spacing = {
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
} as const;

export const Radius = 12;

export function useTheme(): ThemeColors {
  return Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
}
