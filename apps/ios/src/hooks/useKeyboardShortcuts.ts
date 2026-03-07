/**
 * P2 Recommendation #10: Keyboard shortcuts for power users
 * Provides keyboard shortcut handling for external keyboards
 */

import { useEffect, useCallback } from 'react';
import { Keyboard, Platform } from 'react-native';

export type KeyboardShortcut = {
  key: string;
  modifiers?: ('ctrl' | 'alt' | 'shift' | 'meta')[];
  action: () => void;
  description: string;
};

const defaultShortcuts: KeyboardShortcut[] = [
  { key: '1', modifiers: ['meta'], action: () => {}, description: 'Switch to Chats' },
  { key: '2', modifiers: ['meta'], action: () => {}, description: 'Add Channel' },
  { key: '3', modifiers: ['meta'], action: () => {}, description: 'OBS Control' },
  { key: '4', modifiers: ['meta'], action: () => {}, description: 'Settings' },
  { key: 'f', modifiers: ['meta'], action: () => {}, description: 'Open Search' },
  { key: 'w', modifiers: ['meta'], action: () => {}, description: 'Close Current Tab' },
  { key: 'Tab', modifiers: ['ctrl'], action: () => {}, description: 'Next Chat Tab' },
  { key: 'Tab', modifiers: ['ctrl', 'shift'], action: () => {}, description: 'Previous Chat Tab' },
];

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[] = defaultShortcuts) {
  // Note: React Native doesn't have native keyboard shortcut support
  // This is a placeholder for future implementation with a custom native module
  // or when using React Native on macOS Catalyst
  
  useEffect(() => {
    // On iOS, we could potentially use the hardware keyboard events
    // but this requires additional native module implementation
    
    if (Platform.OS === 'ios') {
      // Future: Implement iOS keyboard command support
      // This would require a native module to capture command key combinations
    }
  }, [shortcuts]);

  return {
    shortcuts,
    registerShortcut: (_shortcut: KeyboardShortcut) => {
      // Registration would be handled by native module
    },
    unregisterShortcut: (_key: string) => {
      // Unregistration would be handled by native module
    },
  };
}

export const shortcutLabels = {
  meta: Platform.OS === 'ios' ? '⌘' : 'Ctrl',
  ctrl: 'Ctrl',
  alt: Platform.OS === 'ios' ? '⌥' : 'Alt',
  shift: '⇧',
};

export function formatShortcut(shortcut: KeyboardShortcut): string {
  const modifiers = shortcut.modifiers?.map((m) => shortcutLabels[m]).join('') ?? '';
  return `${modifiers}${shortcut.key.toUpperCase()}`;
}
