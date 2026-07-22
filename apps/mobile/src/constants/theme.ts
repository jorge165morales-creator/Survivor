/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

// Brand gradient — Electric Blue into Cyan, straight from UEFA Champions
// League's official 2024-27 brand palette (no purple/magenta — deliberately
// avoiding anything that reads as pink). Same pair in both themes on
// purpose: saturated enough to read on both a near-black and a near-white
// surface, and a consistent gradient identity matters more here than
// perfect per-theme tuning.
export const BrandGradient = ['#0232FF', '#00EEFF'] as const;

export const Colors = {
  light: {
    text: '#0B0E2E',
    background: '#F5F6FF',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E7E9FF',
    textSecondary: '#5A5F86',
    primary: '#0232FF',
    primaryPressed: '#010056',
    link: '#0232FF',
    success: '#16A34A',
    danger: '#E11D48',
    buyBack: '#D97706',
    border: '#E1E4FA',
  },
  dark: {
    text: '#F5F6FC',
    background: '#05081F',
    backgroundElement: '#10153E',
    backgroundSelected: '#1B2260',
    textSecondary: '#9099C4',
    primary: '#3358FF',
    primaryPressed: '#0232FF',
    link: '#8C6BFF',
    success: '#22E584',
    danger: '#FF0045',
    buyBack: '#FFD300',
    border: '#232B66',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'Outfit_500Medium',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'Outfit_500Medium',
    serif: 'serif',
    rounded: 'Outfit_600SemiBold',
    mono: 'monospace',
  },
  web: {
    sans: 'Outfit_500Medium, var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'Outfit_600SemiBold, var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
