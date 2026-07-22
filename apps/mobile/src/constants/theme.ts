/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

// Brand gradient — the Instagram-style violet → pink → orange sweep used for
// primary CTAs, the active tab pill, and hero accents. Same trio in both
// themes on purpose: it's saturated enough to read on both a near-black and
// a near-white surface, and a consistent gradient identity matters more here
// than perfect per-theme tuning.
export const BrandGradient = ['#7C3AED', '#EC4899', '#FB923C'] as const;

export const Colors = {
  light: {
    text: '#15132A',
    background: '#F8F7FC',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#EFE7FF',
    textSecondary: '#6B7089',
    primary: '#7C3AED',
    primaryPressed: '#6425D0',
    link: '#7C3AED',
    success: '#16A34A',
    danger: '#E11D48',
    buyBack: '#D97706',
    border: '#E7E2F5',
  },
  dark: {
    text: '#F5F6FC',
    background: '#0B0E1A',
    backgroundElement: '#161A2E',
    backgroundSelected: '#262B4A',
    textSecondary: '#9096B4',
    primary: '#9F67FF',
    primaryPressed: '#7C3AED',
    link: '#B794FF',
    success: '#22E584',
    danger: '#FF4D6D',
    buyBack: '#FFC53D',
    border: '#262B47',
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
