import type { PlatformId } from '../types';

export const normalizeChannelInput = (platform: PlatformId, input: string) => {
  const trimmed = input.trim().replace(/^#/, '').replace(/^@/, '');
  if (!trimmed) return '';
  if (platform === 'youtube') {
    return trimmed;
  }
  return trimmed.toLowerCase();
};
