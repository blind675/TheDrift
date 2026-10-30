/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://unistyl.es/), etc.
 */

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#242520',
    background: '#F5F2EA',
    backgroundElement: '#FFFCF6',
    backgroundSelected: '#E9E4D9',
    textSecondary: '#77786F',
    border: '#DFD9CD',
    accent: '#DA5B42',
    positive: '#438D70',
    hero: '#242621',
    heroText: '#F8F4EC',
  },
  dark: {
    text: '#F5F1E8',
    background: '#171814',
    backgroundElement: '#22241F',
    backgroundSelected: '#30322C',
    textSecondary: '#A6A79D',
    border: '#3A3C35',
    accent: '#EF765C',
    positive: '#6BB493',
    hero: '#22241F',
    heroText: '#F8F4EC',
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
