/**
 * Design System - Consistent tokens for the MultiChat iOS app
 * P2 Recommendation #15: Create a proper design system with consistent tokens
 */

export const colors = {
  // Base colors
  background: {
    primary: '#1a1a2e',
    secondary: '#16213e',
    tertiary: '#0f3460',
    card: '#1e1e3f',
    elevated: '#252550',
  },
  
  // Text colors
  text: {
    primary: '#ffffff',
    secondary: '#a0a0b0',
    muted: '#6b6b80',
    inverse: '#1a1a2e',
  },
  
  // Platform colors
  platform: {
    twitch: '#9146ff',
    kick: '#53fc18',
    youtube: '#ff0000',
  },
  
  // Status colors
  status: {
    success: '#4ade80',
    warning: '#fbbf24',
    error: '#ef4444',
    info: '#3b82f6',
    connecting: '#f59e0b',
    connected: '#22c55e',
    disconnected: '#ef4444',
  },
  
  // Accent colors
  accent: {
    primary: '#6366f1',
    secondary: '#8b5cf6',
    highlight: '#22d3ee',
  },
  
  // Border colors
  border: {
    default: '#2a2a4a',
    light: '#3a3a5a',
    focused: '#6366f1',
  },

  // Overlay
  overlay: 'rgba(0, 0, 0, 0.5)',

  // Special messages
  superChat: {
    tier1: '#1de9b6',
    tier2: '#00e5ff',
    tier3: '#7c4dff',
    tier4: '#ff4081',
    tier5: '#ff6d00',
  },
  
  raid: '#ff6b35',
  subscription: '#6366f1',
  bits: '#9146ff',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
};

export const typography = {
  // Font sizes
  fontSize: {
    xs: 10,
    sm: 12,
    md: 14,
    lg: 16,
    xl: 18,
    xxl: 22,
    xxxl: 28,
  },
  
  // Font weights
  fontWeight: {
    normal: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
  
  // Line heights
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
};

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
};

// P2 Recommendation #14: Accessibility - Minimum touch target sizes
export const accessibility = {
  minTouchTarget: 44,
  minContrastRatio: 4.5,
};

// Animation durations
export const animation = {
  fast: 150,
  normal: 250,
  slow: 400,
};

export default {
  colors,
  spacing,
  borderRadius,
  typography,
  shadows,
  accessibility,
  animation,
};
