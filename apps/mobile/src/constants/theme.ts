/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#000000',
    background: '#F7F9FC',
    backgroundElement: '#EEF2F8',
    backgroundSelected: '#DCE6F5',
    textSecondary: '#60646C',
    primary: '#0B2D6B',
    primaryPressed: '#082050',
    link: '#2C6FF0',
    success: '#2f9e44',
    danger: '#e5484d',
    buyBack: '#C9962C',
  },
  dark: {
    text: '#ffffff',
    background: '#0A1220',
    backgroundElement: '#161F2E',
    backgroundSelected: '#22304A',
    textSecondary: '#B0B4BA',
    primary: '#3D6FD6',
    primaryPressed: '#2E5BB8',
    link: '#5B93FF',
    success: '#3FBE5C',
    danger: '#F16267',
    buyBack: '#DDAE49',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
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
